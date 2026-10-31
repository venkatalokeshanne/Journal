import Link from 'next/link';
import type { ReactNode } from 'react';
import { CcyToggle } from './CcyToggle';
import { MarketStatus } from './MarketStatus';
import { money, pnlClass, dateLabel, marketTime, duration, price, qty } from '@/lib/format';
import { RANGES, qs, type Ctx, type SP } from '@/lib/view';
import type { Trip, TradeNote } from '@/lib/types';

export function TopBar({ title, ctx, right }: { title: string; ctx?: Ctx; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-dot" />{title}</div>
      <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
        <span className="hide-sm"><MarketStatus /></span>
        {right}
        {ctx && <CcyToggle base={ctx.base} baseCcy={ctx.baseCcy} tradeCcy={ctx.tradeCcy} />}
      </div>
    </header>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="small muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function RangeChips({ sp, path, current }: { sp: SP; path: string; current: string }) {
  return (
    <nav className="seg" aria-label="Date range">
      {RANGES.map((r) => (
        <Link key={r.id} href={`${path}${qs(sp, { range: r.id === 'all' ? '' : r.id, from: '', to: '', page: '' })}`} className={current === r.id ? 'on' : ''}>
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

const KPI_ICONS: Record<string, string> = {
  pnl: 'M4 17l5-5 4 4 7-7M14 9h6v6',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  scale: 'M12 4v16M5 8h14M5 8l-2 6h4zM19 8l-2 6h4z',
  edge: 'M5 19L19 5M7 5h12v12',
  down: 'M4 7l5 5 4-4 7 7M14 15h6V9',
  fee: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  count: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  fire: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  quality: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
};

export function KIcon({ name }: { name: keyof typeof KPI_ICONS | string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={KPI_ICONS[name] ?? KPI_ICONS.pnl} />
    </svg>
  );
}

export function Kpi({ label, value, sub, tone, icon, corner, hero }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: number; icon?: string; corner?: ReactNode; hero?: boolean;
}) {
  return (
    <div className={`kpi ${hero ? 'hero' : ''}`}>
      <div className="label">{icon && <KIcon name={icon} />}<span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>{label}</span></div>
      <div className={`value ${tone !== undefined ? pnlClass(tone) : ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {corner && <div className="corner">{corner}</div>}
    </div>
  );
}

export function Money({ v, ccy, sign = true, compact }: { v: number; ccy: string; sign?: boolean; compact?: boolean }) {
  return <span className={`num ${pnlClass(v)}`}>{money(v, ccy, { sign, compact })}</span>;
}

export function PnlPill({ v, ccy, compact, lg }: { v: number; ccy: string; compact?: boolean; lg?: boolean }) {
  return <span className={`pill ${pnlClass(v) === 'flat' ? '' : pnlClass(v)} ${lg ? 'lg' : ''}`}>{money(v, ccy, { sign: true, compact })}</span>;
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ symbol, size }: { symbol: string; size?: number }) {
  const txt = symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
  return (
    <span className="avatar" style={{ ['--h' as string]: hue(symbol), ...(size ? { width: size, height: size, borderRadius: size / 3, fontSize: size * 0.3 } : {}) }}>
      {txt.length > 3 ? txt.slice(0, 3) : txt}
    </span>
  );
}

export function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="stars" aria-label={`${n} of 5`}>{'★'.repeat(n)}<span className="faint">{'★'.repeat(5 - n)}</span></span>;
}

export function TradeRow({ t, ctx, note }: { t: Trip; ctx: Ctx; note?: TradeNote }) {
  const p = ctx.pnl(t);
  const setup = note?.setupId ? ctx.setups.find((s) => s.id === note.setupId)?.name : null;
  const when = t.closeDate && t.closeDate !== t.openDate
    ? `${dateLabel(t.openDate, false)} → ${dateLabel(t.closeDate, false)}`
    : `${dateLabel(t.openDate, false)} · ${marketTime(t.openTime)}${t.closeTime ? `–${marketTime(t.closeTime)}` : ''}`;
  return (
    <Link href={`/trades/${encodeURIComponent(t.key)}`} className="trow">
      <Avatar symbol={t.symbol} />
      <div className="info">
        <div className="sym">
          {t.symbol}
          <span className={`badge ${t.direction === 'LONG' ? 'long' : 'short'}`}>{t.direction === 'LONG' ? '↗ LONG' : '↘ SHORT'}</span>
          {t.status === 'OPEN' && <span className="badge accent">OPEN</span>}
          {t.incomplete && <span className="badge warn" title="Opening fills are before your imported history">PARTIAL</span>}
        </div>
        <div className="meta">{when} · {qty(t.maxPosition)} sh{setup ? ` · ${setup}` : ''}</div>
      </div>
      <div className="cols">
        <div><span>Entry</span>{price(t.entryPrice)}</div>
        <div><span>Exit</span>{price(t.exitPrice)}</div>
        <div><span>Size</span>{qty(t.maxPosition)}</div>
        <div><span>Hold</span>{duration(t.holdSeconds)}</div>
        <div><span>Fees</span>{money(-ctx.comm(t), ctx.ccy)}</div>
      </div>
      <div className="pnl">
        <PnlPill v={p} ccy={ctx.ccy} />
        <span className="small">{note?.rating ? '★'.repeat(note.rating) : duration(t.holdSeconds)}</span>
      </div>
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty-state">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export function NoData() {
  return (
    <Empty title="No trades yet">
      <p>Connect IBKR or upload a Flex report to get started.</p>
      <Link href="/import" className="btn primary">Sync &amp; Import</Link>
    </Empty>
  );
}
