import { q } from './db';
import type { Exec, JournalDay, Setup, TradeNote } from './types';
import { DEFAULTS, sanitizeDefaults, sanitizePlan, type DayPlan, type PlanDefaults } from './plan';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function loadExecutions(): Promise<Exec[]> {
  const rows = await q(`select * from executions order by exec_time, trade_id`);
  return rows.map((r) => ({
    tradeId: r.trade_id,
    accountId: r.account_id,
    conid: r.conid,
    symbol: r.symbol,
    underlying: r.underlying,
    description: r.description,
    assetClass: r.asset_class,
    subCategory: r.sub_category,
    currency: r.currency,
    fxRateToBase: Number(r.fx_rate_to_base),
    multiplier: Number(r.multiplier),
    putCall: r.put_call,
    strike: n(r.strike),
    expiry: d(r.expiry),
    time: iso(r.exec_time),
    tradeDate: d(r.trade_date)!,
    quantity: Number(r.quantity),
    price: Number(r.price),
    proceeds: Number(r.proceeds),
    commission: Number(r.commission),
    commissionCurrency: r.commission_currency,
    netCash: Number(r.net_cash),
    realizedPnl: Number(r.realized_pnl),
    openClose: r.open_close,
    orderId: r.order_id,
    exchange: r.exchange,
    notesCodes: r.notes_codes,
  }));
}

const COLS = [
  'trade_id', 'account_id', 'conid', 'symbol', 'underlying', 'description', 'asset_class', 'sub_category',
  'currency', 'fx_rate_to_base', 'multiplier', 'put_call', 'strike', 'expiry', 'exec_time', 'trade_date',
  'quantity', 'price', 'proceeds', 'commission', 'commission_currency', 'net_cash', 'realized_pnl',
  'open_close', 'order_id', 'exchange', 'notes_codes', 'source',
];

/** Inserts new executions and refreshes existing ones (matched by IBKR TradeID). */
export async function upsertExecutions(execs: Exec[], source: string) {
  // de-duplicate within the batch (Postgres rejects the same key twice in one upsert)
  const unique = [...new Map(execs.map((e) => [e.tradeId, e])).values()];
  let added = 0, updated = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk.map((e) => {
      const vals = [
        e.tradeId, e.accountId, e.conid, e.symbol, e.underlying, e.description, e.assetClass, e.subCategory,
        e.currency, e.fxRateToBase, e.multiplier, e.putCall, e.strike, e.expiry, e.time, e.tradeDate,
        e.quantity, e.price, e.proceeds, e.commission, e.commissionCurrency, e.netCash, e.realizedPnl,
        e.openClose, e.orderId, e.exchange, e.notesCodes, source,
      ];
      const ph = vals.map((v) => { params.push(v); return `$${params.length}`; });
      return `(${ph.join(',')})`;
    });
    const set = COLS.filter((c) => c !== 'trade_id' && c !== 'source').map((c) => `${c} = excluded.${c}`).join(', ');
    const rows = await q<{ inserted: boolean }>(
      `insert into executions (${COLS.join(',')}) values ${values.join(',')}
       on conflict (trade_id) do update set ${set}
       returning (xmax = 0) as inserted`,
      params,
    );
    for (const r of rows) r.inserted ? added++ : updated++;
  }
  return { added, updated };
}

export async function logSync(kind: string, status: 'ok' | 'error', message: string, added = 0, updated = 0) {
  await q(`insert into sync_log (kind, status, message, added, updated) values ($1,$2,$3,$4,$5)`, [kind, status, message, added, updated]);
}

export async function recentSyncs(limit = 10) {
  const rows = await q(`select * from sync_log order by at desc limit $1`, [limit]);
  return rows.map((r) => ({ ...r, at: iso(r.at) })) as { id: number; at: string; kind: string; status: string; message: string; added: number; updated: number }[];
}

export async function loadNotes(): Promise<Map<string, TradeNote>> {
  const rows = await q(`select * from trade_notes`);
  return new Map(
    rows.map((r) => [
      r.trade_key,
      {
        tradeKey: r.trade_key,
        setupId: n(r.setup_id),
        tags: r.tags ?? [],
        mistakes: r.mistakes ?? [],
        rating: n(r.rating),
        stopPrice: n(r.stop_price),
        targetPrice: n(r.target_price),
        notes: r.notes ?? '',
        screenshots: r.screenshots ?? [],
      },
    ]),
  );
}

export async function saveNote(nt: TradeNote) {
  await q(
    `insert into trade_notes (trade_key, setup_id, tags, mistakes, rating, stop_price, target_price, notes, screenshots, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (trade_key) do update set setup_id=$2, tags=$3, mistakes=$4, rating=$5, stop_price=$6,
       target_price=$7, notes=$8, screenshots=$9, updated_at=now()`,
    [nt.tradeKey, nt.setupId, nt.tags, nt.mistakes, nt.rating, nt.stopPrice, nt.targetPrice, nt.notes, nt.screenshots],
  );
}

export async function loadSetups(): Promise<Setup[]> {
  const rows = await q(`select * from setups order by archived, name`);
  return rows.map((r) => ({ id: Number(r.id), name: r.name, description: r.description, rules: r.rules, archived: r.archived }));
}

export async function saveSetup(s: { id?: number | null; name: string; description: string; rules: string; archived?: boolean }) {
  if (s.id) {
    await q(`update setups set name=$2, description=$3, rules=$4, archived=$5 where id=$1`, [s.id, s.name, s.description, s.rules, !!s.archived]);
  } else {
    await q(`insert into setups (name, description, rules) values ($1,$2,$3)`, [s.name, s.description, s.rules]);
  }
}

export async function deleteSetup(id: number) {
  await q(`delete from setups where id=$1`, [id]);
}

export async function loadJournal(): Promise<Map<string, JournalDay>> {
  const rows = await q(`select * from journal_days`);
  return new Map(rows.map((r) => {
    const day = d(r.day)!;
    return [day, { day, plan: r.plan, review: r.review, lessons: r.lessons, mood: n(r.mood), discipline: n(r.discipline) }];
  }));
}

export async function saveJournalDay(j: JournalDay) {
  await q(
    `insert into journal_days (day, plan, review, lessons, mood, discipline, updated_at) values ($1,$2,$3,$4,$5,$6, now())
     on conflict (day) do update set plan=$2, review=$3, lessons=$4, mood=$5, discipline=$6, updated_at=now()`,
    [j.day, j.plan, j.review, j.lessons, j.mood, j.discipline],
  );
}

// ---------- daily plans ----------
export async function loadPlan(day: string): Promise<DayPlan | null> {
  const [r] = await q(`select data from day_plans where day = $1`, [day]);
  return r ? sanitizePlan({ ...r.data, day }) : null;
}

/** All plans, newest first (small: one row per trading day). */
export async function loadPlans(): Promise<DayPlan[]> {
  const rows = await q(`select day, data from day_plans order by day desc`);
  return rows.map((r) => sanitizePlan({ ...r.data, day: d(r.day) })).filter((p): p is DayPlan => !!p);
}

export async function savePlan(p: DayPlan) {
  await q(
    `insert into day_plans (day, data, updated_at) values ($1, $2, now())
     on conflict (day) do update set data = excluded.data, updated_at = now()`,
    [p.day, JSON.stringify(p)],
  );
}

export async function loadPlanDefaults(): Promise<PlanDefaults> {
  const [r] = await q(`select value from settings where key = 'plan_defaults'`);
  return r ? sanitizeDefaults(r.value) : DEFAULTS;
}

export async function savePlanDefaults(v: PlanDefaults) {
  await q(
    `insert into settings (key, value, updated_at) values ('plan_defaults', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(v)],
  );
}
