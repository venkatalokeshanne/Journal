import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/view';
import { loadPlan } from '@/lib/data';
import { LEVEL_KINDS } from '@/lib/plan';
import { money, price, qty, duration, dateLabel, marketTime, pnlClass } from '@/lib/format';
import { TopBar, Kpi, Money, Avatar } from '@/components/ui';
import { TradeChart } from '@/components/TradeChart';
import { TradeNoteForm } from '@/components/forms';

export const dynamic = 'force-dynamic';

export default async function TradePage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const ctx = await getCtx();
  const idx = ctx.trips.findIndex((t) => t.key === key);
  if (idx < 0) notFound();
  const t = ctx.trips[idx];
  const note = ctx.notes.get(t.key);
  const dayPlan = await loadPlan(t.openDate);
  const planTicker = dayPlan?.tickers.find((x) => x.symbol === t.symbol || x.symbol === t.underlying) ?? null;
  const planLevels = (planTicker?.levels ?? [])
    .filter((l) => l.price != null)
    .map((l) => { const k = LEVEL_KINDS.find((x) => x.kind === l.kind)!; return { price: l.price!, label: l.label || k.label.toLowerCase(), color: k.color }; });
  const p = ctx.pnl(t);
  const fx = t.realized !== 0 ? t.realizedBase / t.realized : t.legs[0]?.fx ?? 1;
  const conv = (v: number) => (ctx.base ? v * fx : v);

  // R-multiple from planned stop
  let r: number | null = null, risk: number | null = null;
  if (note?.stopPrice && t.entryPrice) {
    risk = Math.abs(t.entryPrice - note.stopPrice) * t.maxPosition * t.multiplier;
    if (risk > 0) r = t.realized / risk;
  }
  // MFE-style context: how much of the move was captured vs. planned target
  const planned = note?.targetPrice && note?.stopPrice ? Math.abs(note.targetPrice - t.entryPrice) / Math.abs(t.entryPrice - note.stopPrice) : null;

  const newer = ctx.trips[idx - 1], older = ctx.trips[idx + 1];
  const knownTags = [...new Set([...ctx.notes.values()].flatMap((n) => n.tags))];
  const knownMistakes = [...new Set([...ctx.notes.values()].flatMap((n) => n.mistakes))];
  const chartable = ['STK', 'ETF'].includes(t.assetClass) || t.assetClass === 'STK';
  let pos = 0;

  return (
    <>
      <TopBar title={t.symbol} ctx={ctx} />
      <main className="main">
        <div className="row between">
          <Link href="/trades" className="small muted">‹ Trades</Link>
          <div className="row">
            {newer && <Link className="btn sm" href={`/trades/${encodeURIComponent(newer.key)}`} aria-label="Newer trade">‹</Link>}
            {older && <Link className="btn sm" href={`/trades/${encodeURIComponent(older.key)}`} aria-label="Older trade">›</Link>}
          </div>
        </div>

        <div className={`hero ${p >= 0 ? 'up' : 'down'}`} style={{ paddingBottom: 20 }}>
          <div className="row between wrap" style={{ position: 'relative' }}>
            <div>
              <div className="row" style={{ gap: 10 }}>
                <Avatar symbol={t.symbol} size={46} />
                <h1>{t.symbol}</h1>
                <span className={`badge ${t.direction === 'LONG' ? 'long' : 'short'}`}>{t.direction}</span>
                {t.status === 'OPEN' && <span className="badge accent">OPEN</span>}
                {t.assetClass !== 'STK' && <span className="badge">{t.assetClass}</span>}
                {dayPlan && (planTicker
                  ? <Link href={`/plan/${t.openDate}`} className="badge long">IN PLAN</Link>
                  : <Link href={`/plan/${t.openDate}`} className="badge warn">NOT IN PLAN</Link>)}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {t.description} · {dateLabel(t.openDate)} {marketTime(t.openTime)} → {t.closeTime ? `${dateLabel(t.closeDate)} ${marketTime(t.closeTime)}` : 'still open'} ET
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`num ${pnlClass(p)}`} style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em' }}>{money(p, ctx.ccy, { sign: true })}</div>
              <div className="small muted">{t.status === 'OPEN' ? 'realized so far' : 'net, after fees'}{r != null ? ` · ${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : ''}</div>
            </div>
          </div>
          {t.incomplete && (
            <p className="toast err small" style={{ marginTop: 12, background: 'rgba(245,176,65,.13)', color: 'var(--warn)' }}>
              Some opening fills happened before your imported history, so entry price and size are partial. The P&L is IBKR’s own figure and is correct.
            </p>
          )}
        </div>

        <div className="kpis six">
          <Kpi icon="edge" label="Avg entry" value={price(t.entryPrice)} />
          <Kpi icon="swap" label="Avg exit" value={price(t.exitPrice)} />
          <Kpi icon="count" label="Max size" value={qty(t.maxPosition)} sub={`${money(t.maxPosition * t.entryPrice * t.multiplier, t.currency, { compact: true })} notional`} />
          <Kpi icon="cal" label="Hold time" value={duration(t.holdSeconds)} />
          <Kpi icon="fee" label="Gross / fees" value={money(conv(t.gross), ctx.ccy, { sign: true })} tone={t.gross} sub={`fees ${money(-ctx.comm(t), ctx.ccy)}`} />
          <Kpi icon="target" label="R-multiple" value={r != null ? `${r.toFixed(2)}R` : '—'} tone={r ?? undefined}
            sub={risk ? `risk ${money(conv(risk), ctx.ccy)}${planned ? ` · planned ${planned.toFixed(1)}R` : ''}` : 'set a stop below'} />
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Chart</h3></div>
            {chartable ? (
              <TradeChart symbol={t.underlying && t.assetClass !== 'STK' ? t.underlying : t.symbol} from={t.openTime} to={t.closeTime ?? new Date().toISOString()}
                legs={t.legs.map((l) => ({ time: l.time, quantity: l.quantity, price: l.price, role: l.role }))}
                stop={note?.stopPrice} target={note?.targetPrice} levels={planLevels} />
            ) : <p className="small muted">Charts are available for stocks.</p>}
          </section>

          <section className="card">
            <div className="card-head"><h3>Journal this trade</h3></div>
            <TradeNoteForm tradeKey={t.key} note={note} setups={ctx.setups} knownTags={knownTags} knownMistakes={knownMistakes} />
          </section>
        </div>

        {!!note?.screenshots.length && (
          <section className="card">
            <div className="card-head"><h3>Screenshots</h3></div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {note.screenshots.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Trade screenshot" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head"><h3>Executions</h3><span className="small muted">{t.legs.length} fills · times ET</span></div>
          <div className="scroll-x">
            <table className="t legs num">
              <thead><tr><th>Time</th><th>Side</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Position</th><th className="r">Fee</th><th className="r">Realized</th></tr></thead>
              <tbody>
                {t.legs.map((l, i) => {
                  pos += l.quantity;
                  return (
                    <tr key={`${l.tradeId}-${i}`}>
                      <td>{dateLabel(l.tradeDate, false)} {marketTime(l.time, true)}</td>
                      <td className={l.quantity > 0 ? 'pos' : 'neg'}>{l.quantity > 0 ? 'BUY' : 'SELL'}</td>
                      <td className="r">{qty(Math.abs(l.quantity))}</td>
                      <td className="r">{price(l.price)}</td>
                      <td className="r">{qty(pos)}</td>
                      <td className="r">{money(-(ctx.base ? l.commission * l.fx : l.commission), ctx.ccy)}</td>
                      <td className="r"><Money v={ctx.base ? l.realized * l.fx : l.realized} ccy={ctx.ccy} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
