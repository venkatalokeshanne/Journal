import Link from 'next/link';
import { getCtx, summary, type SP } from '@/lib/view';
import { maxDrawdown } from '@/lib/engine';
import { insights } from '@/lib/insights';
import { traderScore } from '@/lib/score';
import { money, pct, duration, dateLabel, qty, price } from '@/lib/format';
import { TopBar, RangeChips, Kpi, TradeRow, NoData, Money } from '@/components/ui';
import { EquityCurve, PnlBars, Gauge } from '@/components/charts';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx(sp);
  if (!ctx.execs.length) {
    return (<><TopBar title="Dashboard" /><main className="main"><NoData /></main></>);
  }
  const { closed, stats: s, days } = summary(ctx);
  const realized = days.reduce((a, d) => a + d.pnl, 0);
  const dd = maxDrawdown(days);
  let cum = 0;
  const curve = days.map((d) => ({ date: d.date, value: (cum += d.pnl) }));
  const recentDays = days.slice(-40).map((d) => ({ label: d.date, value: d.pnl }));
  const score = traderScore(s, days, dd);
  const tips = insights(closed, s, days, ctx.pnl, ctx.ccy, ctx.notes).slice(0, 5);
  const open = ctx.trips.filter((t) => t.status === 'OPEN');
  const greenDays = days.filter((d) => d.pnl > 0.004).length, redDays = days.filter((d) => d.pnl < -0.004).length;
  const best = days.reduce((a, d) => (d.pnl > (a?.pnl ?? -Infinity) ? d : a), days[0]);
  const worst = days.reduce((a, d) => (d.pnl < (a?.pnl ?? Infinity) ? d : a), days[0]);

  return (
    <>
      <TopBar title="Dashboard" ctx={ctx} />
      <main className="main stack">
        <div className="page-head">
          <h1>Dashboard</h1>
          <RangeChips sp={sp} path="/" current={ctx.range.id} />
        </div>

        <div className="kpis">
          <Kpi hero label="Net realized P&L" value={money(realized, ctx.ccy, { sign: true })} tone={realized}
            sub={`${s.trades} closed trades · fees ${money(-s.commissions, ctx.ccy)} included`} />
          <Kpi label="Win rate" value={pct(s.winRate)} sub={`${s.wins}W · ${s.losses}L${s.breakeven ? ` · ${s.breakeven}BE` : ''}`} />
          <Kpi label="Profit factor" value={s.profitFactor ? s.profitFactor.toFixed(2) : '—'} sub={`${money(s.grossProfit, ctx.ccy, { compact: true })} / ${money(-s.grossLoss, ctx.ccy, { compact: true })}`} />
          <Kpi label="Expectancy / trade" value={money(s.expectancy, ctx.ccy, { sign: true })} tone={s.expectancy} />
          <Kpi label="Avg win / avg loss" value={s.winLossRatio ? s.winLossRatio.toFixed(2) : '—'}
            sub={<><span className="pos">{money(s.avgWin, ctx.ccy, { compact: true })}</span> / <span className="neg">{money(s.avgLoss, ctx.ccy, { compact: true })}</span></>} />
          <Kpi label="Max drawdown" value={money(dd, ctx.ccy)} tone={dd} sub={`${greenDays} green · ${redDays} red days`} />
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h2>Equity curve</h2><span className="small muted">cumulative realized</span></div>
            <EquityCurve points={curve} ccy={ctx.ccy} height={210} />
          </section>
          <section className="card">
            <div className="card-head"><h2>Trader score</h2><Link href="/reports" className="small muted">Details ›</Link></div>
            <div style={{ display: 'grid', placeItems: 'center' }}><Gauge value={score.total} label="out of 100" /></div>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {score.parts.map((p) => (
                <div key={p.label} className="row small">
                  <span className="grow muted">{p.label}</span>
                  <span className="num faint">{p.detail}</span>
                  <div style={{ width: 70, height: 6, borderRadius: 4, background: 'var(--panel-2)' }}>
                    <div style={{ width: `${p.score}%`, height: '100%', borderRadius: 4, background: p.score >= 65 ? 'var(--pos)' : p.score >= 40 ? 'var(--warn)' : 'var(--neg)' }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h2>Daily P&L</h2><Link href="/calendar" className="small muted">Calendar ›</Link></div>
            <PnlBars data={recentDays} />
            <div className="row between small" style={{ marginTop: 10 }}>
              {best && <span>Best day <Link href={`/journal/${best.date}`}><Money v={best.pnl} ccy={ctx.ccy} /></Link> <span className="faint">{dateLabel(best.date, false)}</span></span>}
              {worst && <span>Worst day <Link href={`/journal/${worst.date}`}><Money v={worst.pnl} ccy={ctx.ccy} /></Link> <span className="faint">{dateLabel(worst.date, false)}</span></span>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Insights</h2><span className="badge accent">auto</span></div>
            {tips.length ? tips.map((t, i) => (
              <div key={i} className={`insight ${t.tone}`}><span className="dot" /><div><b>{t.title}</b><p>{t.text}</p></div></div>
            )) : <p className="muted small">Insights appear once you have a few more trades in this range.</p>}
          </section>
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h2>Recent trades</h2><Link href="/trades" className="small muted">All trades ›</Link></div>
            <div className="list">
              {closed.slice(0, 8).map((t) => <TradeRow key={t.key} t={t} ctx={ctx} note={ctx.notes.get(t.key)} />)}
              {!closed.length && <p className="muted small">No closed trades in this range.</p>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Open positions</h2><span className="small muted">{open.length}</span></div>
            {open.length ? (
              <div className="list">
                {open.map((t) => (
                  <Link key={t.key} href={`/trades/${encodeURIComponent(t.key)}`} className="trow">
                    <div className="sym">{t.symbol}<span className={`badge ${t.direction === 'LONG' ? 'long' : 'short'}`}>{t.direction}</span></div>
                    <div className="meta">{qty(Math.abs(t.openQty))} @ {price(t.entryPrice)} · since {dateLabel(t.openDate, false)}</div>
                    <div className="pnl"><Money v={ctx.pnl(t)} ccy={ctx.ccy} /><span className="small faint">realized so far</span></div>
                  </Link>
                ))}
              </div>
            ) : <p className="muted small">You're flat.</p>}
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="grid small" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <span className="muted">Largest win</span><span className="num pos" style={{ textAlign: 'right' }}>{money(s.largestWin, ctx.ccy)}</span>
              <span className="muted">Largest loss</span><span className="num neg" style={{ textAlign: 'right' }}>{money(s.largestLoss, ctx.ccy)}</span>
              <span className="muted">Avg hold (win / loss)</span><span className="num" style={{ textAlign: 'right' }}>{duration(s.avgHoldWin)} / {duration(s.avgHoldLoss)}</span>
              <span className="muted">Streaks (max W / L)</span><span className="num" style={{ textAlign: 'right' }}>{s.maxWinStreak} / {s.maxLossStreak}</span>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
