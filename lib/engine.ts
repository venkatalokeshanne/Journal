import type { Exec, Trip, TripLeg } from './types';
import { zonedParts, MARKET_TZ } from './time';

const EPS = 1e-9;

function cmpExec(a: Exec, b: Exec) {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  const na = Number(a.tradeId), nb = Number(b.tradeId);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.tradeId.localeCompare(b.tradeId);
}

interface Builder {
  first: Exec;
  dir: 1 | -1;
  incomplete: boolean;
  legs: TripLeg[];
  realizedBase: number;
  pos: number;
  maxPos: number;
}

function leg(e: Exec, qty: number, share: number, role: 'open' | 'close', realizedShare: number): TripLeg {
  return {
    tradeId: e.tradeId,
    time: e.time,
    tradeDate: e.tradeDate,
    quantity: qty,
    price: e.price,
    commission: e.commission * share,
    realized: e.realizedPnl * realizedShare,
    role,
    exchange: e.exchange,
    fx: e.fxRateToBase,
  };
}

function finish(b: Builder, open: boolean): Trip {
  const e = b.first;
  const opens = b.legs.filter((l) => l.role === 'open');
  const closes = b.legs.filter((l) => l.role === 'close');
  const wavg = (ls: TripLeg[]) => {
    const q = ls.reduce((s, l) => s + Math.abs(l.quantity), 0);
    return q > EPS ? ls.reduce((s, l) => s + Math.abs(l.quantity) * l.price, 0) / q : null;
  };
  const realized = b.legs.reduce((s, l) => s + l.realized, 0);
  const commission = b.legs.reduce((s, l) => s + l.commission, 0);
  const commissionBase = b.legs.reduce((s, l) => s + l.commission * l.fx, 0);
  const last = b.legs[b.legs.length - 1];
  const openTime = b.legs[0].time;
  const closeTime = open ? null : last.time;
  return {
    key: `${e.accountId}:${e.conid}:${b.legs[0].tradeId}`,
    accountId: e.accountId,
    conid: e.conid,
    symbol: e.symbol,
    underlying: e.underlying,
    description: e.description,
    assetClass: e.assetClass,
    currency: e.currency,
    multiplier: e.multiplier,
    putCall: e.putCall,
    strike: e.strike,
    expiry: e.expiry,
    direction: b.dir === 1 ? 'LONG' : 'SHORT',
    status: open ? 'OPEN' : 'CLOSED',
    incomplete: b.incomplete,
    openTime,
    closeTime,
    openDate: b.legs[0].tradeDate,
    closeDate: open ? null : last.tradeDate,
    holdSeconds: closeTime ? Math.max(0, (Date.parse(closeTime) - Date.parse(openTime)) / 1000) : null,
    maxPosition: b.maxPos,
    openQty: open ? b.pos : 0,
    entryPrice: wavg(opens) ?? wavg(closes) ?? 0,
    exitPrice: wavg(closes),
    realized,
    realizedBase: b.realizedBase,
    commission,
    commissionBase,
    gross: realized - commission,
    legs: b.legs,
  };
}

/**
 * Groups fills into round trips (flat → position → flat) per account + contract.
 * P&L always comes from IBKR's own FIFO realized P&L, so totals match the broker exactly.
 */
export function buildTrips(execs: Exec[], opts: { includeForex?: boolean } = {}): Trip[] {
  const groups = new Map<string, Exec[]>();
  for (const e of execs) {
    if (!opts.includeForex && e.assetClass === 'CASH') continue;
    const k = `${e.accountId}|${e.conid}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(e);
  }

  const trips: Trip[] = [];
  for (const list of groups.values()) {
    list.sort(cmpExec);
    let b: Builder | null = null;

    for (const e of list) {
      const q = e.quantity;
      const oc = (e.openClose ?? '').toUpperCase();
      const closesOnly = oc.includes('C') && !oc.includes('O');

      if (!b) {
        const dir = (closesOnly ? -Math.sign(q) : Math.sign(q)) as 1 | -1;
        b = { first: e, dir, incomplete: false, legs: [], realizedBase: 0, pos: 0, maxPos: 0 };
        if (closesOnly) {
          // We never saw the opening fills (before the imported history): record what IBKR realized.
          b.incomplete = true;
          b.legs.push(leg(e, q, 1, 'close', 1));
          b.realizedBase += e.realizedPnl * e.fxRateToBase;
          b.maxPos = Math.abs(q);
          trips.push(finish(b, false));
          b = null;
          continue;
        }
      }

      if (Math.sign(q) === b.dir) {
        b.legs.push(leg(e, q, 1, 'open', 1));
        b.realizedBase += e.realizedPnl * e.fxRateToBase;
        b.pos += q;
        b.maxPos = Math.max(b.maxPos, Math.abs(b.pos));
        continue;
      }

      // Reducing / closing fill
      if (Math.abs(q) <= Math.abs(b.pos) + EPS || closesOnly) {
        if (Math.abs(q) > Math.abs(b.pos) + EPS) b.incomplete = true; // closed more than we saw opened
        b.legs.push(leg(e, q, 1, 'close', 1));
        b.realizedBase += e.realizedPnl * e.fxRateToBase;
        b.pos += q;
        if (Math.abs(b.pos) <= EPS || Math.sign(b.pos) !== b.dir) {
          trips.push(finish(b, false));
          b = null;
        }
        continue;
      }

      // Flip: close the whole position and open the rest in the other direction.
      const closeQty = -b.pos;
      const share = closeQty / q;
      b.legs.push(leg(e, closeQty, share, 'close', 1));
      b.realizedBase += e.realizedPnl * e.fxRateToBase;
      trips.push(finish(b, false));
      const rest = q - closeQty;
      b = { first: e, dir: Math.sign(rest) as 1 | -1, incomplete: false, legs: [], realizedBase: 0, pos: rest, maxPos: Math.abs(rest) };
      b.legs.push(leg(e, rest, 1 - share, 'open', 0));
    }
    if (b) trips.push(finish(b, true));
  }

  trips.sort((a, b) => ((a.closeTime ?? a.openTime) < (b.closeTime ?? b.openTime) ? 1 : -1));
  return trips;
}

// ---------------- statistics ----------------

export type PnlFn = (t: Trip) => number;

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  net: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  winLossRatio: number | null;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  commissions: number;
  avgHoldWin: number | null;
  avgHoldLoss: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number; // + wins / - losses
  /** Van Tharp's System Quality Number: sqrt(min(n,100)) * mean / stdev of trade P&L. */
  sqn: number | null;
  longs: number;
  shorts: number;
}

const BE = 0.005;

export function computeStats(closed: Trip[], pnl: PnlFn, commission: PnlFn): Stats {
  const chron = [...closed].sort((a, b) => ((a.closeTime ?? '') < (b.closeTime ?? '') ? -1 : 1));
  let wins = 0, losses = 0, be = 0, gp = 0, gl = 0, lw = 0, ll = 0, comm = 0;
  let holdW = 0, holdWn = 0, holdL = 0, holdLn = 0;
  let streak = 0, maxW = 0, maxL = 0;
  for (const t of chron) {
    const p = pnl(t);
    comm += commission(t);
    if (p > BE) {
      wins++; gp += p; lw = Math.max(lw, p);
      if (t.holdSeconds != null) { holdW += t.holdSeconds; holdWn++; }
      streak = streak > 0 ? streak + 1 : 1;
    } else if (p < -BE) {
      losses++; gl += p; ll = Math.min(ll, p);
      if (t.holdSeconds != null) { holdL += t.holdSeconds; holdLn++; }
      streak = streak < 0 ? streak - 1 : -1;
    } else {
      be++;
    }
    maxW = Math.max(maxW, streak);
    maxL = Math.min(maxL, streak);
  }
  const n = chron.length;
  const pnls = chron.map(pnl);
  const mean = n ? pnls.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const avgWin = wins ? gp / wins : 0;
  const avgLoss = losses ? gl / losses : 0;
  return {
    trades: n,
    wins,
    losses,
    breakeven: be,
    winRate: n ? wins / n : 0,
    net: gp + gl,
    grossProfit: gp,
    grossLoss: gl,
    profitFactor: gl < 0 ? gp / -gl : null,
    avgWin,
    avgLoss,
    winLossRatio: avgLoss < 0 ? avgWin / -avgLoss : null,
    expectancy: n ? (gp + gl) / n : 0,
    largestWin: lw,
    largestLoss: ll,
    commissions: comm,
    avgHoldWin: holdWn ? holdW / holdWn : null,
    avgHoldLoss: holdLn ? holdL / holdLn : null,
    maxWinStreak: maxW,
    maxLossStreak: -maxL,
    currentStreak: streak,
    sqn: sd > 0 ? (Math.sqrt(Math.min(n, 100)) * mean) / sd : null,
    longs: chron.filter((t) => t.direction === 'LONG').length,
    shorts: chron.filter((t) => t.direction === 'SHORT').length,
  };
}

export interface DayPnl {
  date: string;
  pnl: number;
  trades: number; // closed trips that day
  wins: number;
  commissions: number;
}

/** Realized P&L per trading day, straight from executions (matches IBKR's daily realized). */
export function dailyPnl(execs: Exec[], closed: Trip[], base: boolean, includeForex = false): DayPnl[] {
  const m = new Map<string, DayPnl>();
  const get = (d: string) => {
    let v = m.get(d);
    if (!v) m.set(d, (v = { date: d, pnl: 0, trades: 0, wins: 0, commissions: 0 }));
    return v;
  };
  for (const e of execs) {
    if (!includeForex && e.assetClass === 'CASH') continue;
    const f = base ? e.fxRateToBase : 1;
    const d = get(e.tradeDate);
    d.pnl += e.realizedPnl * f;
    d.commissions += e.commission * f;
  }
  for (const t of closed) {
    if (!t.closeDate) continue;
    const d = get(t.closeDate);
    d.trades++;
    if ((base ? t.realizedBase : t.realized) > BE) d.wins++;
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function maxDrawdown(days: DayPnl[]) {
  let peak = 0, cum = 0, dd = 0;
  for (const d of days) {
    cum += d.pnl;
    peak = Math.max(peak, cum);
    dd = Math.min(dd, cum - peak);
  }
  return dd;
}

export interface Bucket {
  label: string;
  trades: number;
  wins: number;
  pnl: number;
  sort: number;
}

export function groupBy(trips: Trip[], pnl: PnlFn, keyFn: (t: Trip) => { label: string; sort: number } | null): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const t of trips) {
    const k = keyFn(t);
    if (!k) continue;
    let b = m.get(k.label);
    if (!b) m.set(k.label, (b = { label: k.label, trades: 0, wins: 0, pnl: 0, sort: k.sort }));
    const p = pnl(t);
    b.trades++;
    b.pnl += p;
    if (p > BE) b.wins++;
  }
  return [...m.values()].sort((a, b) => a.sort - b.sort);
}

export const marketParts = (iso: string) => zonedParts(iso, MARKET_TZ);

export const HOLD_BUCKETS: { max: number; label: string }[] = [
  { max: 60, label: '< 1 min' },
  { max: 5 * 60, label: '1–5 min' },
  { max: 15 * 60, label: '5–15 min' },
  { max: 60 * 60, label: '15–60 min' },
  { max: 4 * 3600, label: '1–4 h' },
  { max: 24 * 3600, label: '4–24 h' },
  { max: 7 * 86400, label: '1–7 days' },
  { max: Infinity, label: '> 1 week' },
];

export function holdBucket(sec: number | null) {
  if (sec == null) return null;
  const i = HOLD_BUCKETS.findIndex((b) => sec < b.max);
  return { label: HOLD_BUCKETS[i].label, sort: i };
}
