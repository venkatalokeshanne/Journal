import 'server-only';
import { computeStats, dailyPnl, groupBy, holdBucket, marketParts, maxDrawdown, type PnlFn } from '../engine';
import { insights } from '../insights';
import { addDays } from '../time';
import { duration, money, pct, WEEKDAY_NAMES } from '../format';
import { planVsReality, riskReward, type DayPlan } from '../plan';
import type { Ctx } from '../view';
import type { JournalDay, Trip } from '../types';

// Compact, factual text the model reads. Everything is computed here; the model only explains it.

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const closed = (ctx: Ctx) => ctx.trips.filter((t) => t.status === 'CLOSED');
const between = (t: Trip, from?: string | null, to?: string | null) => {
  const d = t.closeDate ?? t.openDate;
  return (!from || d >= from) && (!to || d <= to);
};
const sym = (t: Trip) => (t.assetClass === 'STK' ? t.symbol : t.underlying ?? t.symbol);

function m(ctx: Ctx, v: number, sign = true) {
  return money(v, ctx.ccy, { sign });
}

export function statsLine(ctx: Ctx, trips: Trip[]) {
  const s = computeStats(trips, ctx.pnl, ctx.comm);
  if (!s.trades) return 'no closed trades';
  return [
    `${s.trades} trades`, `net ${m(ctx, s.net)}`, `win rate ${pct(s.winRate, 0)}`,
    `profit factor ${s.profitFactor?.toFixed(2) ?? 'n/a'}`, `avg win ${m(ctx, s.avgWin, false)}`, `avg loss ${m(ctx, s.avgLoss, false)}`,
    `expectancy ${m(ctx, s.expectancy)}`, `fees ${m(ctx, -s.commissions, false)}`,
    `avg hold win ${duration(s.avgHoldWin)} / loss ${duration(s.avgHoldLoss)}`,
  ].join(', ');
}

export function tripLine(ctx: Ctx, t: Trip, extra = '') {
  const n = ctx.notes.get(t.key);
  const ps = marketParts(t.openTime);
  const bits = [
    `${t.openDate} ${String(ps.hour).padStart(2, '0')}:${String(ps.minute).padStart(2, '0')}ET`,
    t.symbol, t.direction, `size ${t.maxPosition}`,
    `entry ${t.entryPrice.toFixed(2)}`, t.exitPrice != null ? `exit ${t.exitPrice.toFixed(2)}` : 'open',
    `hold ${duration(t.holdSeconds)}`, `P&L ${m(ctx, ctx.pnl(t))}`,
  ];
  if (n?.setupId) bits.push(`setup "${ctx.setups.find((s) => s.id === n.setupId)?.name ?? '?'}"`);
  if (n?.tags.length) bits.push(`tags ${n.tags.join('/')}`);
  if (n?.mistakes.length) bits.push(`mistakes ${n.mistakes.join('/')}`);
  if (n?.rating) bits.push(`self-rating ${n.rating}/5`);
  if (n?.stopPrice) bits.push(`planned stop ${n.stopPrice}`);
  if (n?.notes) bits.push(`note "${n.notes.slice(0, 160).replace(/\s+/g, ' ')}"`);
  return `- ${bits.join(' | ')}${extra}`;
}

/** The trader's baseline: who they are as a trader, from all their data. */
export function profile(ctx: Ctx) {
  const all = closed(ctx);
  const recent = all.filter((t) => between(t, addDays(new Date().toISOString().slice(0, 10), -90)));
  const s = computeStats(all, ctx.pnl, ctx.comm);
  const days = dailyPnl(ctx.execs, all, ctx.base, ctx.includeForex);
  const tips = insights(all, s, days, ctx.pnl, ctx.ccy, ctx.notes);
  const byHour = groupBy(all, ctx.pnl, (t) => ({ label: `${String(marketParts(t.openTime).hour).padStart(2, '0')}h`, sort: marketParts(t.openTime).hour }));
  const byDay = groupBy(all, ctx.pnl, (t) => ({ label: WEEKDAY_NAMES[marketParts(t.openTime).weekday], sort: (marketParts(t.openTime).weekday + 6) % 7 }));
  const bySide = groupBy(all, ctx.pnl, (t) => ({ label: t.direction, sort: 0 }));
  const fmtB = (bs: ReturnType<typeof groupBy>) => bs.map((b) => `${b.label} ${b.trades}t ${m(ctx, b.pnl)} (${pct(b.wins / b.trades, 0)})`).join('; ');
  return [
    `Currency: ${ctx.ccy}. Times: New York.`,
    `All time (${all[all.length - 1]?.openDate ?? '?'} to ${all[0]?.closeDate ?? '?'}): ${statsLine(ctx, all)}, max drawdown ${m(ctx, maxDrawdown(days), false)}.`,
    `Last 90 days: ${statsLine(ctx, recent)}.`,
    `By entry hour: ${fmtB(byHour)}.`,
    `By weekday: ${fmtB(byDay)}.`,
    `Long vs short: ${fmtB(bySide)}.`,
    tips.length ? `Known patterns:\n${tips.map((t) => `- ${t.title}: ${t.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function symbolHistory(ctx: Ctx, symbol: string, limit = 5) {
  const ts = closed(ctx).filter((t) => sym(t) === symbol);
  if (!ts.length) return `${symbol}: never traded before.`;
  return `${symbol} history: ${statsLine(ctx, ts)}. Last ${Math.min(limit, ts.length)}:\n${ts.slice(0, limit).map((t) => tripLine(ctx, t)).join('\n')}`;
}

function planText(ctx: Ctx, p: DayPlan | null) {
  if (!p) return 'No plan was written for this day.';
  const lines = [
    `Bias ${p.bias ?? 'not set'} | max trades ${p.maxTrades ?? 'not set'} | max daily loss ${p.maxLoss != null ? money(p.maxLoss, ctx.tradeCcy) : `not set (it is set in ${ctx.tradeCcy})`} | focus "${p.focus || '-'}"`,
    `Pre-market checklist: ${p.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('; ') || 'none'}`,
  ];
  for (const t of p.tickers) {
    const rr = riskReward(t);
    lines.push(
      `Ticker ${t.symbol} bias ${t.bias}; levels ${t.levels.map((l) => `${l.kind}${l.label ? `(${l.label})` : ''} ${l.price ?? '?'}`).join(', ') || 'none'}` +
      `${rr ? `; R:R ${rr.rr != null ? `1:${rr.rr.toFixed(1)}` : 'no target'}` : '; no entry/stop'}` +
      `${t.setupId ? `; setup "${ctx.setups.find((s) => s.id === t.setupId)?.name ?? '?'}"` : ''}` +
      `${t.catalyst ? `; catalyst "${t.catalyst}"` : ''}${t.notes ? `; notes "${t.notes.slice(0, 200)}"` : ''}` +
      `; conditions ${t.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join(', ') || 'none'}`,
    );
  }
  return lines.join('\n');
}

export function dayContext(ctx: Ctx, day: string, plan: DayPlan | null, journal: JournalDay | undefined) {
  const trips = ctx.trips.filter((t) => t.openDate === day || t.closeDate === day);
  const bySymbol: Record<string, { n: number; pnl: number }> = {};
  for (const t of trips.filter((x) => x.openDate === day)) { const v = (bySymbol[sym(t)] ??= { n: 0, pnl: 0 }); v.n++; v.pnl += ctx.pnl(t); }
  const dayPnl = ctx.execs.filter((e) => e.tradeDate === day && e.assetClass !== 'CASH').reduce((s, e) => s + e.realizedPnl, 0);
  const realizedShown = ctx.execs.filter((e) => e.tradeDate === day && e.assetClass !== 'CASH').reduce((s, e) => s + e.realizedPnl * (ctx.base ? e.fxRateToBase : 1), 0);
  const pvr = plan ? planVsReality(plan, { trades: trips.filter((t) => t.openDate === day).length, dayPnl, bySymbol }) : null;
  const planned = new Set(plan?.tickers.map((t) => t.symbol) ?? []);
  return [
    `DAY ${day} (${WEEKDAY_NAMES[marketParts(`${day}T16:00:00Z`).weekday]}). Realized P&L ${m(ctx, realizedShown)}. Round trips closed this day: ${statsLine(ctx, trips.filter((t) => t.status === 'CLOSED' && t.closeDate === day))} (a round trip's P&L includes partial exits on earlier days).`,
    `PLAN:\n${planText(ctx, plan)}`,
    pvr ? `PLAN VS REALITY: planned ${pvr.plannedN} trades ${m(ctx, pvr.plannedPnl)}, unplanned ${pvr.unplannedN} trades ${m(ctx, pvr.unplannedPnl)}${pvr.unplannedSymbols.length ? ` (${pvr.unplannedSymbols.join(', ')})` : ''}; checks: ${pvr.parts.map((p) => `${p.label} ${p.detail}`).join(', ')}; discipline score ${pvr.score != null ? Math.round(pvr.score) : 'n/a'}/100.` : '',
    `TRADES (chronological):\n${[...trips].sort((a, b) => (a.openTime < b.openTime ? -1 : 1)).map((t) => tripLine(ctx, t, plan ? (planned.has(sym(t)) ? ' | IN PLAN' : ' | NOT IN PLAN') : '')).join('\n') || 'none'}`,
    journal && (journal.plan || journal.review || journal.lessons) ? `TRADER'S OWN NOTES: plan "${journal.plan}" review "${journal.review}" lessons "${journal.lessons}" mood ${journal.mood ?? '-'}/5 discipline ${journal.discipline ?? '-'}/5` : '',
  ].filter(Boolean).join('\n\n');
}

export function planContext(ctx: Ctx, plan: DayPlan) {
  const hours = groupBy(closed(ctx), ctx.pnl, (t) => ({ label: `${marketParts(t.openTime).hour}h`, sort: marketParts(t.openTime).hour }));
  const wd = WEEKDAY_NAMES[marketParts(`${plan.day}T16:00:00Z`).weekday];
  const wdStats = closed(ctx).filter((t) => WEEKDAY_NAMES[marketParts(t.openTime).weekday] === wd);
  return [
    `PLAN FOR ${plan.day} (${wd}):\n${planText(ctx, plan)}`,
    `Trader's history on ${wd}s: ${statsLine(ctx, wdStats)}.`,
    `By entry hour: ${hours.map((b) => `${b.label} ${m(ctx, b.pnl)}`).join('; ')}.`,
    plan.tickers.length ? `HISTORY OF PLANNED TICKERS:\n${plan.tickers.map((t) => symbolHistory(ctx, t.symbol, 3)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function tradeContext(ctx: Ctx, t: Trip, plan: DayPlan | null) {
  const pt = plan?.tickers.find((x) => x.symbol === sym(t));
  const legs = t.legs.map((l) => {
    const p = marketParts(l.time);
    return `- ${l.tradeDate} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')} ${l.quantity > 0 ? 'BUY' : 'SELL'} ${Math.abs(l.quantity)} @ ${l.price} (${l.role}) realized net of fees ${m(ctx, ctx.base ? l.realized * l.fx : l.realized)}`;
  });
  const sameSetup = (() => {
    const id = ctx.notes.get(t.key)?.setupId;
    if (!id) return '';
    const ts = closed(ctx).filter((x) => ctx.notes.get(x.key)?.setupId === id);
    return `Same setup overall: ${statsLine(ctx, ts)}.`;
  })();
  const bucket = holdBucket(t.holdSeconds);
  const sameHold = bucket ? closed(ctx).filter((x) => holdBucket(x.holdSeconds)?.label === bucket.label) : [];
  return [
    `TRADE: ${tripLine(ctx, t)}`,
    `Net P&L ${m(ctx, ctx.pnl(t))} = gross ${m(ctx, ctx.base ? t.gross * (t.realized ? t.realizedBase / t.realized : 1) : t.gross)} minus fees ${m(ctx, -ctx.comm(t), false)}. All P&L figures in this data are already after fees; never subtract fees again.${t.incomplete ? ' (opening fills are before imported history)' : ''}`,
    `FILLS:\n${legs.join('\n')}`,
    pt ? `IT WAS IN THE PLAN: bias ${pt.bias}; levels ${pt.levels.map((l) => `${l.kind} ${l.price ?? '?'}`).join(', ')}; conditions ${pt.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join(', ') || 'none'}` : plan ? 'NOT IN THAT DAY\'S PLAN.' : 'No plan that day.',
    symbolHistory(ctx, sym(t), 5),
    sameSetup,
    bucket ? `Trades with a similar hold (${bucket.label}): ${statsLine(ctx, sameHold)}.` : '',
  ].filter(Boolean).join('\n\n');
}

export function weekContext(ctx: Ctx, monday: string, plans: DayPlan[], journal: Map<string, JournalDay>) {
  const sunday = addDays(monday, 6);
  const week = closed(ctx).filter((t) => between(t, monday, sunday));
  const prior = closed(ctx).filter((t) => between(t, addDays(monday, -28), addDays(monday, -1)));
  const days = dailyPnl(ctx.execs.filter((e) => e.tradeDate >= monday && e.tradeDate <= sunday), week, ctx.base, ctx.includeForex);
  const lines = days.map((d) => {
    const p = plans.find((x) => x.day === d.date);
    const j = journal.get(d.date);
    return `- ${d.date}: ${m(ctx, d.pnl)}, ${d.trades} trades${p ? `, plan: ${p.tickers.map((t) => t.symbol).join('/') || 'no tickers'} (max ${p.maxTrades ?? '-'})` : ', no plan'}${j?.review ? `, own review "${j.review.slice(0, 160)}"` : ''}`;
  });
  const mistakes = new Map<string, { n: number; pnl: number }>();
  for (const t of week) for (const mk of ctx.notes.get(t.key)?.mistakes ?? []) { const v = mistakes.get(mk) ?? { n: 0, pnl: 0 }; v.n++; v.pnl += ctx.pnl(t); mistakes.set(mk, v); }
  const best = [...week].sort((a, b) => ctx.pnl(b) - ctx.pnl(a)).slice(0, 3);
  const worst = [...week].sort((a, b) => ctx.pnl(a) - ctx.pnl(b)).slice(0, 3);
  return [
    `WEEK ${monday} to ${sunday}: realized P&L ${m(ctx, days.reduce((a, d) => a + d.pnl, 0))} (sum of the days below; this is the week's true result).`,
    `Round trips closed this week: ${statsLine(ctx, week)}. Note: a round trip's P&L includes any partial exits made before this week, so it can differ from the realized P&L.`,
    `Previous 4 weeks for comparison (round trips closed): ${statsLine(ctx, prior)}; realized P&L ${m(ctx, ctx.execs.filter((e) => e.assetClass !== 'CASH' && e.tradeDate >= addDays(monday, -28) && e.tradeDate < monday).reduce((a, e) => a + e.realizedPnl * (ctx.base ? e.fxRateToBase : 1), 0))}.`,
    `DAYS:\n${lines.join('\n') || 'no trading days'}`,
    `BEST TRADES:\n${best.map((t) => tripLine(ctx, t)).join('\n') || '-'}`,
    `WORST TRADES:\n${worst.map((t) => tripLine(ctx, t)).join('\n') || '-'}`,
    mistakes.size ? `TAGGED MISTAKES: ${[...mistakes].map(([k, v]) => `${k} ${v.n}x ${m(ctx, v.pnl)}`).join('; ')}` : 'No mistakes tagged this week.',
  ].join('\n\n');
}

// ---------------- tools for "Ask your journal" ----------------

const BY = ['hour', 'weekday', 'symbol', 'side', 'month', 'hold_time', 'setup', 'tag', 'mistake', 'plan'] as const;

export const TOOLS = [
  {
    name: 'get_overview',
    description: 'Performance summary (net P&L, win rate, profit factor, averages, fees, hold times) for a date range. Omit dates for all time.',
    input_schema: { type: 'object' as const, properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, additionalProperties: false },
  },
  {
    name: 'get_breakdown',
    description: 'P&L, trade count and win rate grouped by a dimension: hour (entry hour, New York), weekday, symbol, side (long/short), month, hold_time, setup, tag, mistake, plan (planned vs unplanned vs no plan).',
    input_schema: {
      type: 'object' as const,
      properties: { by: { type: 'string', enum: [...BY] }, from: { type: 'string' }, to: { type: 'string' }, top: { type: 'integer', description: 'max rows, default 15' } },
      required: ['by'], additionalProperties: false,
    },
  },
  {
    name: 'find_trades',
    description: 'List individual round-trip trades with times, size, prices, P&L, setup, tags, mistakes and notes. Filter and sort them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string' }, side: { type: 'string', enum: ['LONG', 'SHORT'] }, result: { type: 'string', enum: ['win', 'loss'] },
        from: { type: 'string' }, to: { type: 'string' }, sort: { type: 'string', enum: ['recent', 'best', 'worst', 'largest'] },
        limit: { type: 'integer', description: 'default 10, max 30' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_day',
    description: 'Everything about one trading day: plan, plan-vs-reality, every trade, and the trader\'s own journal notes.',
    input_schema: { type: 'object' as const, properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'], additionalProperties: false },
  },
];

export function runTool(ctx: Ctx, plans: DayPlan[], journal: Map<string, JournalDay>, name: string, raw: unknown): string {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const from = isDate(a.from) ? a.from : null, to = isDate(a.to) ? a.to : null;
  const pool = closed(ctx).filter((t) => between(t, from, to));
  const P: PnlFn = ctx.pnl;
  switch (name) {
    case 'get_overview': {
      const days = dailyPnl(ctx.execs.filter((e) => (!from || e.tradeDate >= from) && (!to || e.tradeDate <= to)), pool, ctx.base, ctx.includeForex);
      const green = days.filter((d) => d.pnl > 0).length, red = days.filter((d) => d.pnl < 0).length;
      return `${from ?? 'start'} to ${to ?? 'today'}: ${statsLine(ctx, pool)}; ${green} green / ${red} red days; max drawdown ${m(ctx, maxDrawdown(days), false)}.`;
    }
    case 'get_breakdown': {
      const by = String(a.by);
      const planMap = new Map(plans.map((p) => [p.day, new Set(p.tickers.map((t) => t.symbol))]));
      const key = (t: Trip): { label: string; sort: number } | null => {
        const n = ctx.notes.get(t.key);
        switch (by) {
          case 'hour': { const h = marketParts(t.openTime).hour; return { label: `${String(h).padStart(2, '0')}:00`, sort: h }; }
          case 'weekday': { const w = marketParts(t.openTime).weekday; return { label: WEEKDAY_NAMES[w], sort: (w + 6) % 7 }; }
          case 'symbol': return { label: sym(t), sort: 0 };
          case 'side': return { label: t.direction, sort: 0 };
          case 'month': return { label: (t.closeDate ?? t.openDate).slice(0, 7), sort: +(t.closeDate ?? t.openDate).slice(0, 7).replace('-', '') };
          case 'hold_time': return holdBucket(t.holdSeconds);
          case 'setup': return { label: n?.setupId ? ctx.setups.find((s) => s.id === n.setupId)?.name ?? '?' : 'no setup', sort: 0 };
          case 'plan': { const s = planMap.get(t.openDate); return { label: !s ? 'no plan that day' : s.has(sym(t)) ? 'planned' : 'unplanned', sort: 0 }; }
          default: return null;
        }
      };
      let rows;
      if (by === 'tag' || by === 'mistake') {
        const mm = new Map<string, { label: string; trades: number; wins: number; pnl: number; sort: number }>();
        for (const t of pool) for (const k of (by === 'tag' ? ctx.notes.get(t.key)?.tags : ctx.notes.get(t.key)?.mistakes) ?? []) {
          const v = mm.get(k) ?? { label: k, trades: 0, wins: 0, pnl: 0, sort: 0 };
          v.trades++; v.pnl += P(t); if (P(t) > 0) v.wins++; mm.set(k, v);
        }
        rows = [...mm.values()];
        if (!rows.length) return `No trades have ${by}s recorded in this range.`;
      } else {
        rows = groupBy(pool, P, key);
      }
      if (['symbol', 'setup', 'tag', 'mistake', 'plan'].includes(by)) rows.sort((x, y) => y.pnl - x.pnl);
      const top = Math.min(40, Math.max(1, Number(a.top) || 15));
      const list = rows.length > top && by === 'symbol' ? [...rows.slice(0, Math.ceil(top / 2)), ...rows.slice(-Math.floor(top / 2))] : rows.slice(0, top);
      return list.map((b) => `${b.label}: ${b.trades} trades, ${m(ctx, b.pnl)}, win rate ${pct(b.wins / b.trades, 0)}, avg ${m(ctx, b.pnl / b.trades)}`).join('\n') || 'No trades in this range.';
    }
    case 'find_trades': {
      let ts = pool;
      if (typeof a.symbol === 'string' && a.symbol) ts = ts.filter((t) => sym(t) === a.symbol!.toString().toUpperCase());
      if (a.side === 'LONG' || a.side === 'SHORT') ts = ts.filter((t) => t.direction === a.side);
      if (a.result === 'win') ts = ts.filter((t) => P(t) > 0);
      if (a.result === 'loss') ts = ts.filter((t) => P(t) < 0);
      const sorters: Record<string, (x: Trip, y: Trip) => number> = {
        recent: (x, y) => ((y.closeTime ?? '') > (x.closeTime ?? '') ? 1 : -1),
        best: (x, y) => P(y) - P(x), worst: (x, y) => P(x) - P(y),
        largest: (x, y) => y.maxPosition * y.entryPrice - x.maxPosition * x.entryPrice,
      };
      ts = [...ts].sort(sorters[String(a.sort)] ?? sorters.recent);
      const limit = Math.min(30, Math.max(1, Number(a.limit) || 10));
      return ts.length ? `${ts.length} matching trades (showing ${Math.min(limit, ts.length)}):\n${ts.slice(0, limit).map((t) => tripLine(ctx, t)).join('\n')}` : 'No matching trades.';
    }
    case 'get_day': {
      if (!isDate(a.date)) return 'Invalid date, use YYYY-MM-DD.';
      return dayContext(ctx, a.date, plans.find((p) => p.day === a.date) ?? null, journal.get(a.date));
    }
    default:
      return `Unknown tool ${name}.`;
  }
}
