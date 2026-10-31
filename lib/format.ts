import { zonedParts, MARKET_TZ } from './time';

const moneyFmt = new Map<string, Intl.NumberFormat>();
export function money(v: number, ccy: string, opts: { sign?: boolean; compact?: boolean } = {}) {
  const key = `${ccy}|${opts.compact}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: ccy,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    });
    moneyFmt.set(key, f);
  }
  const s = f.format(Math.abs(v) < 0.005 ? 0 : v);
  return opts.sign && v > 0.004 ? `+${s}` : s;
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export function qty(v: number) {
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function price(v: number | null | undefined) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: abs < 1 ? 5 : abs < 10 ? 4 : 2 });
}

export function duration(sec: number | null | undefined) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dateLabel(d: string | null | undefined, withYear = true) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}${withYear ? `, ${y}` : ''}`;
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Time in New York (market) time, e.g. "09:31". */
export function marketTime(iso: string | null | undefined, withSeconds = false) {
  if (!iso) return '—';
  const p = zonedParts(iso, MARKET_TZ);
  const hh = String(p.hour).padStart(2, '0'), mm = String(p.minute).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${String(p.second).padStart(2, '0')}` : `${hh}:${mm}`;
}

export const pnlClass = (v: number) => (v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'flat');
