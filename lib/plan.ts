// Shared by server and client: plan types, validation and plan-vs-reality scoring.

export type LevelKind = 'entry' | 'stop' | 'target' | 'resistance' | 'support' | 'note';
export interface PlanLevel { id: string; kind: LevelKind; price: number | null; label: string }
export interface CheckItem { id: string; text: string; done: boolean }
export interface PlanTicker {
  id: string;
  symbol: string;
  bias: 'LONG' | 'SHORT' | 'WAIT';
  setupId: number | null;
  levels: PlanLevel[];
  checklist: CheckItem[];
  catalyst: string;
  notes: string;
}
export interface DayPlan {
  day: string;
  bias: 'BULL' | 'NEUTRAL' | 'BEAR' | null;
  maxLoss: number | null; // trade currency (e.g. USD)
  maxTrades: number | null;
  focus: string;
  checklist: CheckItem[];
  tickers: PlanTicker[];
}
export interface PlanDefaults { maxLoss: number | null; maxTrades: number | null; checklist: string[] }

export const DEFAULTS: PlanDefaults = {
  maxLoss: null,
  maxTrades: 7,
  checklist: [
    'Checked news, earnings and economic calendar',
    'Marked key levels on my watchlist',
    'I know my max loss for today',
    'Calm and focused, no revenge trading',
  ],
};

export const LEVEL_KINDS: { kind: LevelKind; label: string; color: string }[] = [
  { kind: 'entry', label: 'Entry', color: 'var(--accent)' },
  { kind: 'stop', label: 'Stop', color: 'var(--neg)' },
  { kind: 'target', label: 'Target', color: 'var(--pos)' },
  { kind: 'resistance', label: 'Resistance', color: '#f59e0b' },
  { kind: 'support', label: 'Support', color: '#38bdf8' },
  { kind: 'note', label: 'Level', color: 'var(--muted)' },
];

/** Works on plain http too (crypto.randomUUID needs https). */
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const newCheck = (text: string): CheckItem => ({ id: uid(), text, done: false });

export function emptyPlan(day: string, d: PlanDefaults): DayPlan {
  return { day, bias: null, maxLoss: d.maxLoss, maxTrades: d.maxTrades, focus: '', checklist: d.checklist.map(newCheck), tickers: [] };
}

// ---------- validation (server) ----------
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = <T,>(v: unknown, max: number, f: (x: any) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : [];
const check = (x: any): CheckItem | null =>
  x && typeof x === 'object' ? { id: str(x.id, 40) || uid(), text: str(x.text, 300), done: !!x.done } : null;

export function sanitizePlan(raw: any): DayPlan | null {
  if (!raw || typeof raw !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null;
  return {
    day: raw.day,
    bias: ['BULL', 'NEUTRAL', 'BEAR'].includes(raw.bias) ? raw.bias : null,
    maxLoss: num(raw.maxLoss) != null ? Math.abs(num(raw.maxLoss)!) : null,
    maxTrades: num(raw.maxTrades) != null ? Math.max(0, Math.round(num(raw.maxTrades)!)) : null,
    focus: str(raw.focus, 1000),
    checklist: arr(raw.checklist, 40, check),
    tickers: arr(raw.tickers, 40, (t): PlanTicker | null => {
      const symbol = str(t?.symbol, 15).toUpperCase().replace(/[^A-Z0-9. ]/g, '').trim();
      if (!symbol) return null;
      return {
        id: str(t.id, 40) || uid(),
        symbol,
        bias: ['LONG', 'SHORT', 'WAIT'].includes(t.bias) ? t.bias : 'WAIT',
        setupId: num(t.setupId),
        levels: arr(t.levels, 20, (l): PlanLevel | null =>
          l && typeof l === 'object'
            ? { id: str(l.id, 40) || uid(), kind: LEVEL_KINDS.some((k) => k.kind === l.kind) ? l.kind : 'note', price: num(l.price), label: str(l.label, 80) }
            : null),
        checklist: arr(t.checklist, 30, check),
        catalyst: str(t.catalyst, 500),
        notes: str(t.notes, 2000),
      };
    }),
  };
}

export function sanitizeDefaults(raw: any): PlanDefaults {
  return {
    maxLoss: num(raw?.maxLoss) != null ? Math.abs(num(raw.maxLoss)!) : null,
    maxTrades: num(raw?.maxTrades) != null ? Math.max(0, Math.round(num(raw.maxTrades)!)) : null,
    checklist: Array.isArray(raw?.checklist) ? raw.checklist.map((x: unknown) => str(x, 300)).filter(Boolean).slice(0, 40) : DEFAULTS.checklist,
  };
}

// ---------- maths ----------
export function riskReward(t: PlanTicker) {
  const get = (k: LevelKind) => t.levels.find((l) => l.kind === k && l.price != null)?.price ?? null;
  const entry = get('entry'), stop = get('stop'), target = get('target');
  if (entry == null || stop == null) return null;
  const risk = Math.abs(entry - stop);
  if (!risk) return null;
  return { entry, stop, target, risk, rr: target != null ? Math.abs(target - entry) / risk : null };
}

export interface DayReality {
  trades: number; // round trips opened this day
  dayPnl: number; // realized, trade currency (for max-loss rule)
  bySymbol: Record<string, { n: number; pnl: number }>; // display currency
  rules?: { kept: number; broken: number };
}

export function planVsReality(plan: DayPlan, r: DayReality) {
  const planned = new Set(plan.tickers.map((t) => t.symbol));
  let plannedN = 0, plannedPnl = 0, unplannedN = 0, unplannedPnl = 0;
  const unplannedSymbols: string[] = [];
  for (const [sym, v] of Object.entries(r.bySymbol)) {
    if (planned.has(sym)) { plannedN += v.n; plannedPnl += v.pnl; }
    else { unplannedN += v.n; unplannedPnl += v.pnl; unplannedSymbols.push(sym); }
  }
  const parts: { label: string; score: number; detail: string }[] = [];
  const done = plan.checklist.filter((c) => c.done).length;
  if (plan.checklist.length) parts.push({ label: 'Pre-market checklist', score: (done / plan.checklist.length) * 100, detail: `${done}/${plan.checklist.length}` });
  const tickChecks = plan.tickers.flatMap((t) => t.checklist);
  if (tickChecks.length) {
    const d = tickChecks.filter((c) => c.done).length;
    parts.push({ label: 'Ticker checklists', score: (d / tickChecks.length) * 100, detail: `${d}/${tickChecks.length}` });
  }
  if (plan.maxTrades != null && r.trades > 0) {
    parts.push({ label: 'Max trades', score: r.trades <= plan.maxTrades ? 100 : Math.max(0, 100 - (r.trades - plan.maxTrades) * 25), detail: `${r.trades}/${plan.maxTrades}` });
  }
  if (plan.maxLoss != null && r.trades > 0) {
    parts.push({ label: 'Max daily loss', score: r.dayPnl >= -plan.maxLoss ? 100 : 0, detail: r.dayPnl >= -plan.maxLoss ? 'respected' : 'broken' });
  }
  if (plannedN + unplannedN > 0) {
    parts.push({ label: 'Trades from plan', score: (plannedN / (plannedN + unplannedN)) * 100, detail: `${plannedN}/${plannedN + unplannedN}` });
  }
  if (r.rules && r.trades > 0 && r.rules.kept + r.rules.broken > 0) {
    parts.push({ label: 'My rules kept', score: (r.rules.kept / (r.rules.kept + r.rules.broken)) * 100, detail: `${r.rules.kept}/${r.rules.kept + r.rules.broken}` });
  }
  const score = parts.length ? parts.reduce((a, p) => a + p.score, 0) / parts.length : null;
  return { plannedN, plannedPnl, unplannedN, unplannedPnl, unplannedSymbols, parts, score };
}
