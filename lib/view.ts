import 'server-only';
import { cookies } from 'next/headers';
import { loadExecutions, loadNotes, loadSetups } from './data';
import { buildTrips, computeStats, dailyPnl, type PnlFn } from './engine';
import { todayInTz, addDays } from './time';
import type { Exec, Trip, TradeNote, Setup } from './types';

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export const RANGES = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
] as const;

export function resolveRange(sp: SP): { from: string | null; to: string | null; id: string } {
  const from = one(sp.from), to = one(sp.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { from: from || null, to: to || null, id: 'custom' };
  }
  const id = one(sp.range) || 'all';
  const today = todayInTz();
  switch (id) {
    case '7d': return { from: addDays(today, -6), to: null, id };
    case '30d': return { from: addDays(today, -29), to: null, id };
    case '90d': return { from: addDays(today, -89), to: null, id };
    case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: null, id };
    case '1y': return { from: addDays(today, -364), to: null, id };
    default: return { from: null, to: null, id: 'all' };
  }
}

export interface Ctx {
  execs: Exec[];
  trips: Trip[]; // all trips
  notes: Map<string, TradeNote>;
  setups: Setup[];
  base: boolean;
  ccy: string;
  baseCcy: string;
  tradeCcy: string;
  multiCurrency: boolean;
  pnl: PnlFn;
  comm: PnlFn;
  range: { from: string | null; to: string | null; id: string };
  inRange: (d: string | null) => boolean;
  includeForex: boolean;
}

export async function getCtx(sp: SP = {}): Promise<Ctx> {
  const [execs, notes, setups, jar] = await Promise.all([loadExecutions(), loadNotes(), loadSetups(), cookies()]);
  const includeForex = process.env.INCLUDE_FOREX === 'true';
  const trips = buildTrips(execs, { includeForex });
  const currencies = [...new Set(trips.map((t) => t.currency))];
  const baseCcy = (process.env.BASE_CURRENCY || 'USD').toUpperCase();
  const tradeCcy = currencies.length === 1 ? currencies[0] : 'USD';
  const mode = jar.get('tj_ccy')?.value;
  const base = mode === 'base' || (mode !== 'trade' && currencies.length > 1);
  const range = resolveRange(sp);
  const inRange = (d: string | null) => !!d && (!range.from || d >= range.from) && (!range.to || d <= range.to);
  return {
    execs,
    trips,
    notes,
    setups,
    base,
    ccy: base ? baseCcy : tradeCcy,
    baseCcy,
    tradeCcy,
    multiCurrency: currencies.length > 1,
    pnl: base ? (t) => t.realizedBase : (t) => t.realized,
    comm: base ? (t) => t.commissionBase : (t) => t.commission,
    range,
    inRange,
    includeForex,
  };
}

export function closedInRange(c: Ctx) {
  return c.trips.filter((t) => t.status === 'CLOSED' && c.inRange(t.closeDate));
}

export function summary(c: Ctx) {
  const closed = closedInRange(c);
  const stats = computeStats(closed, c.pnl, c.comm);
  const days = dailyPnl(c.execs.filter((e) => c.inRange(e.tradeDate)), closed, c.base, c.includeForex);
  return { closed, stats, days };
}

/** Builds a query string from the current params with overrides (undefined/'' removes a key). */
export function qs(sp: SP, over: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s) p.set(k, s);
  }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
