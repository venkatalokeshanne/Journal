// Personal trading rules derived from the trader's own history, checked automatically against their fills.
import type { Trip } from './types';
import { zonedParts, MARKET_TZ } from './time';
import type { DayPlan } from './plan';

export interface RulesConfig {
  maxTrades: number;
  maxLoss: number; // per trade, trade currency
  maxSize: number; // notional per position, trade currency
  windowStart: string; // HH:MM ET
  windowEnd: string;
  afterLosses: number; // stop after N losses in a row
  weekday: number | null; // 0=Sun..6=Sat, extra-careful day
  weekdayMax: number;
  blacklist: string[];
  focus: string[];
  disabled: string[];
  custom: { id: string; text: string }[];
}

export type RuleId = 'no_avg_down' | 'max_loss' | 'max_trades' | 'window' | 'after_losses' | 'max_size' | 'weekday' | 'blacklist' | 'plan_only';
export const RULE_IDS: RuleId[] = ['no_avg_down', 'max_loss', 'max_trades', 'window', 'after_losses', 'max_size', 'weekday', 'blacklist', 'plan_only'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const minutes = (iso: string) => { const p = zonedParts(iso, MARKET_TZ); return p.hour * 60 + p.minute; };
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
const sym = (t: Trip) => (t.assetClass === 'STK' ? t.symbol : t.underlying ?? t.symbol);
const notional = (t: Trip) => t.maxPosition * t.entryPrice * t.multiplier;

/** Added to the position at a worse price than the average entry so far (long: lower, short: higher). */
export function averagedDown(t: Trip) {
  let q = 0, cost = 0;
  for (const l of t.legs) {
    if (l.role !== 'open') continue;
    const aq = Math.abs(l.quantity);
    if (q > 0) {
      const avg = cost / q;
      if ((t.direction === 'LONG' && l.price < avg * 0.998) || (t.direction === 'SHORT' && l.price > avg * 1.002)) return true;
    }
    q += aq; cost += aq * l.price;
  }
  return false;
}

export function ruleText(id: RuleId, c: RulesConfig, ccy: string): { title: string; short: string } {
  const $ = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(v);
  switch (id) {
    case 'no_avg_down': return { title: 'Never add to a losing position', short: 'No averaging down' };
    case 'max_loss': return { title: `Stop out at ${$(c.maxLoss)} loss per trade`, short: `Max loss ${$(c.maxLoss)}/trade` };
    case 'max_trades': return { title: `Max ${c.maxTrades} trades a day`, short: `Max ${c.maxTrades} trades` };
    case 'window': return { title: `Only enter between ${c.windowStart} and ${c.windowEnd} ET`, short: `Enter ${c.windowStart}–${c.windowEnd} ET` };
    case 'after_losses': return { title: `Stop for the day after ${c.afterLosses} losses in a row`, short: `Stop after ${c.afterLosses} losses in a row` };
    case 'max_size': return { title: `Max position size ${$(c.maxSize)}`, short: `Max size ${$(c.maxSize)}` };
    case 'weekday': return c.weekday == null
      ? { title: 'Extra care on your worst weekday', short: 'Worst weekday' }
      : { title: `${WEEKDAYS[c.weekday]}s: max ${c.weekdayMax} trades`, short: `${WEEKDAYS[c.weekday].slice(0, 3)}: max ${c.weekdayMax}` };
    case 'blacklist': return { title: `Don't trade ${c.blacklist.join(', ') || '(no tickers)'}`, short: 'No-trade list' };
    case 'plan_only': return { title: 'Only trade tickers in today’s plan', short: 'Only planned tickers' };
  }
}

/**
 * Trades that broke a rule, given one day's round trips (sorted by entry time) and that day's plan.
 * Returns null when the rule doesn't apply that day.
 */
export function breaches(id: RuleId, c: RulesConfig, day: Trip[], plan: DayPlan | null, pnl: (t: Trip) => number): Trip[] | null {
  switch (id) {
    case 'no_avg_down': return day.filter(averagedDown);
    case 'max_loss': return day.filter((t) => t.status === 'CLOSED' && t.realized < -c.maxLoss);
    case 'max_trades': return day.slice(c.maxTrades);
    case 'window': return day.filter((t) => { const m = minutes(t.openTime); return m < hm(c.windowStart) || m >= hm(c.windowEnd); });
    case 'after_losses': {
      const out: Trip[] = [];
      for (let i = 0; i < day.length; i++) {
        let streak = 0;
        // losses that were already closed when this trade was opened, most recent first
        const before = day.slice(0, i).filter((x) => x.closeTime && x.closeTime <= day[i].openTime).sort((a, b) => (a.closeTime! < b.closeTime! ? 1 : -1));
        for (const x of before) { if (pnl(x) < 0) streak++; else break; }
        if (streak >= c.afterLosses) out.push(day[i]);
      }
      return out;
    }
    case 'max_size': return day.filter((t) => notional(t) > c.maxSize);
    case 'weekday': {
      if (c.weekday == null || !day.length) return null;
      return zonedParts(day[0].openTime, MARKET_TZ).weekday === c.weekday ? day.slice(c.weekdayMax) : null;
    }
    case 'blacklist': return day.filter((t) => c.blacklist.includes(sym(t)));
    case 'plan_only': {
      if (!plan || !plan.tickers.length) return null;
      const ok = new Set(plan.tickers.map((x) => x.symbol));
      return day.filter((t) => !ok.has(sym(t)));
    }
  }
}

function groupByDay(trips: Trip[]) {
  const m = new Map<string, Trip[]>();
  for (const t of trips) { const d = t.openDate; let g = m.get(d); if (!g) m.set(d, (g = [])); g.push(t); }
  for (const g of m.values()) g.sort((a, b) => (a.openTime < b.openTime ? -1 : 1));
  return m;
}

export interface RuleDayStatus { id: string; title: string; short: string; status: 'kept' | 'broken' | 'idle' | 'manual'; detail: string; custom?: boolean }

/** Today's (or any day's) status for every enabled rule. */
export function evaluateDay(c: RulesConfig, trips: Trip[], day: string, plan: DayPlan | null, pnl: (t: Trip) => number, ccy: string): RuleDayStatus[] {
  const dayTrips = (groupByDay(trips.filter((t) => t.openDate === day)).get(day) ?? []);
  const out: RuleDayStatus[] = [];
  for (const id of RULE_IDS) {
    if (c.disabled.includes(id)) continue;
    const txt = ruleText(id, c, ccy);
    const b = breaches(id, c, dayTrips, plan, pnl);
    if (b === null || (!dayTrips.length && id !== 'plan_only')) { out.push({ id, ...txt, status: 'idle', detail: dayTrips.length ? 'Not applicable today' : 'No trades yet' }); continue; }
    if (!dayTrips.length) { out.push({ id, ...txt, status: 'idle', detail: 'No trades yet' }); continue; }
    out.push(b.length
      ? { id, ...txt, status: 'broken', detail: `${b.length}× · ${[...new Set(b.map(sym))].slice(0, 4).join(', ')}` }
      : { id, ...txt, status: 'kept', detail: `${dayTrips.length} trade${dayTrips.length === 1 ? '' : 's'} checked` });
  }
  for (const r of c.custom) out.push({ id: r.id, title: r.text, short: r.text, status: 'manual', detail: '', custom: true });
  return out;
}

export interface RuleHistory {
  id: RuleId;
  brokenTrades: number;
  brokenPnl: number;
  keptTrades: number;
  keptPnl: number;
  daysBroken: number;
  daysTraded: number;
  recent: { day: string; status: 'kept' | 'broken' }[]; // last 10 trading days, oldest first
}

/** How each rule played out historically: P&L of the trades that broke it vs the ones that didn't. */
export function ruleHistory(c: RulesConfig, trips: Trip[], plans: Map<string, DayPlan>, pnl: (t: Trip) => number, from: string | null = null): RuleHistory[] {
  const closed = trips.filter((t) => t.status === 'CLOSED' && (!from || t.openDate >= from));
  const days = groupByDay(closed);
  const dayKeys = [...days.keys()].sort();
  return RULE_IDS.map((id) => {
    let bt = 0, bp = 0, kt = 0, kp = 0, db = 0, dt = 0;
    const statusByDay: { day: string; status: 'kept' | 'broken' }[] = [];
    for (const d of dayKeys) {
      const ts = days.get(d)!;
      const b = breaches(id, c, ts, plans.get(d) ?? null, pnl);
      if (b === null) continue;
      const set = new Set(b);
      dt++;
      if (set.size) db++;
      statusByDay.push({ day: d, status: set.size ? 'broken' : 'kept' });
      for (const t of ts) {
        // For the loss cap, count only the part of each loss beyond the cap (what the stop would have saved).
        const v = id === 'max_loss' && set.has(t) ? pnl(t) * (1 - c.maxLoss / Math.abs(t.realized)) : pnl(t);
        if (set.has(t)) { bt++; bp += v; } else { kt++; kp += v; }
      }
    }
    return { id, brokenTrades: bt, brokenPnl: bp, keptTrades: kt, keptPnl: kp, daysBroken: db, daysTraded: dt, recent: statusByDay.slice(-10) };
  });
}

/** Starting rules tuned to this trader's own history (used until they save their own). */
export function suggestRules(trips: Trip[], pnl: (t: Trip) => number): RulesConfig {
  const closed = trips.filter((t) => t.status === 'CLOSED');
  const bySym = new Map<string, { n: number; p: number }>();
  for (const t of closed) { const v = bySym.get(sym(t)) ?? { n: 0, p: 0 }; v.n++; v.p += pnl(t); bySym.set(sym(t), v); }
  const ranked = [...bySym].filter(([, v]) => v.n >= 4);
  const blacklist = ranked.filter(([, v]) => v.p < -5000).sort((a, b) => a[1].p - b[1].p).slice(0, 6).map(([s]) => s);
  const focus = ranked.filter(([, v]) => v.p > 3000).sort((a, b) => b[1].p - a[1].p).slice(0, 5).map(([s]) => s);
  const wd = new Map<number, number>();
  for (const t of closed) { const w = zonedParts(t.openTime, MARKET_TZ).weekday; wd.set(w, (wd.get(w) ?? 0) + pnl(t)); }
  const worst = [...wd].sort((a, b) => a[1] - b[1])[0];
  return {
    maxTrades: 5,
    maxLoss: 500,
    maxSize: 60000,
    windowStart: '10:00',
    windowEnd: '13:00',
    afterLosses: 2,
    weekday: worst && worst[1] < -5000 ? worst[0] : null,
    weekdayMax: 2,
    blacklist,
    focus,
    disabled: [],
    custom: [],
  };
}

export function sanitizeRules(raw: any, fallback: RulesConfig): RulesConfig {
  const num = (v: unknown, d: number, lo = 0, hi = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const time = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d);
  const syms = (v: unknown, d: string[]) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).toUpperCase().replace(/[^A-Z0-9. ]/g, '').trim()).filter(Boolean))].slice(0, 30) : d);
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    maxTrades: Math.round(num(raw.maxTrades, fallback.maxTrades, 1, 100)),
    maxLoss: num(raw.maxLoss, fallback.maxLoss, 1),
    maxSize: num(raw.maxSize, fallback.maxSize, 100),
    windowStart: time(raw.windowStart, fallback.windowStart),
    windowEnd: time(raw.windowEnd, fallback.windowEnd),
    afterLosses: Math.round(num(raw.afterLosses, fallback.afterLosses, 1, 20)),
    weekday: raw.weekday === null ? null : Number.isInteger(raw.weekday) && raw.weekday >= 0 && raw.weekday <= 6 ? raw.weekday : fallback.weekday,
    weekdayMax: Math.round(num(raw.weekdayMax, fallback.weekdayMax, 0, 100)),
    blacklist: syms(raw.blacklist, fallback.blacklist),
    focus: syms(raw.focus, fallback.focus),
    disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((x: unknown) => RULE_IDS.includes(x as RuleId)) : [],
    custom: Array.isArray(raw.custom)
      ? raw.custom.slice(0, 20).map((r: any) => ({ id: String(r?.id || Math.random().toString(36).slice(2, 10)).slice(0, 40), text: String(r?.text ?? '').slice(0, 200).trim() })).filter((r: { text: string }) => r.text)
      : [],
  };
}
