import Link from 'next/link';
import type { ReactNode } from 'react';
import { CcyToggle } from './CcyToggle';
import { money, pnlClass, dateLabel, marketTime, duration, price, qty } from '@/lib/format';
import { RANGES, qs, type Ctx, type SP } from '@/lib/view';
import type { Trip, TradeNote } from '@/lib/types';

export function TopBar({ title, ctx, right }: { title: string; ctx?: Ctx; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-dot" />{title}</div>
      <div className="row" style={{ marginLeft: 'auto' }}>
        {right}
        {ctx && <CcyToggle base={ctx.base} baseCcy={ctx.baseCcy} tradeCcy={ctx.tradeCcy} />}
      </div>
    </header>
  );
}

export function RangeChips({ sp, path, current }: { sp: SP; path: string; current: string }) {
  return (
    <div className="chips">
      {RANGES.map((r) => (
        <Link key={r.id} href={`${path}${qs(sp, { range: r.id === 'all' ? '' : r.id, from: '', to: '', page: '' })}`} className={`chip ${current === r.id ? 'on' : ''}`}>
          {r.label}
        </Link>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, hero }: { label: string; value: ReactNode; sub?: ReactNode; tone?: number; hero?: boolean }) {
  return (
    <div className={`kpi ${hero ? 'hero' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value num ${tone !== undefined ? pnlClass(tone) : ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Money({ v, ccy, sign = true, compact }: { v: number; ccy: string; sign?: boolean; compact?: boolean }) {
  return <span className={`num ${pnlClass(v)}`}>{money(v, ccy, { sign, compact })}</span>;
}

export function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="stars" aria-label={`${n} of 5`}>{'★'.repeat(n)}<span className="faint">{'★'.repeat(5 - n)}</span></span>;
}

export function TradeRow({ t, ctx, note }: { t: Trip; ctx: Ctx; note?: TradeNote }) {
  const p = ctx.pnl(t);
  const setup = note?.setupId ? ctx.setups.find((s) => s.id === note.setupId)?.name : null;
  return (
    <Link href={`/trades/${encodeURIComponent(t.key)}`} className="trow">
      <div className="sym">
        {t.symbol}
        <span className={`badge ${t.direction === 'LONG' ? 'long' : 'short'}`}>{t.direction}</span>
        {t.status === 'OPEN' && <span className="badge accent">OPEN</span>}
        {t.incomplete && <span className="badge warn" title="Opening fills are before your imported history">PARTIAL</span>}
      </div>
      <div className="meta">
        {t.closeDate && t.closeDate !== t.openDate
          ? `${dateLabel(t.openDate, false)} ${marketTime(t.openTime)} → ${dateLabel(t.closeDate, false)} ${marketTime(t.closeTime)}`
          : `${dateLabel(t.openDate, false)} · ${marketTime(t.openTime)}–${t.closeTime ? marketTime(t.closeTime) : 'now'}`} · {qty(t.maxPosition)} sh
        {setup ? ` · ${setup}` : ''}
      </div>
      <div className="cols num">
        <div><span>Entry</span>{price(t.entryPrice)}</div>
        <div><span>Exit</span>{price(t.exitPrice)}</div>
        <div><span>Size</span>{qty(t.maxPosition)}</div>
        <div><span>Hold</span>{duration(t.holdSeconds)}</div>
        <div><span>Fees</span>{money(-ctx.comm(t), ctx.ccy)}</div>
      </div>
      <div className="pnl">
        <Money v={p} ccy={ctx.ccy} />
        <span className="small faint">{note?.rating ? '★'.repeat(note.rating) : duration(t.holdSeconds)}</span>
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
