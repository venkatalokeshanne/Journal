import Link from 'next/link';
import { getCtx, summary, RANGES, type SP } from '@/lib/view';
import { maxDrawdown } from '@/lib/engine';
import { insights } from '@/lib/insights';
import { traderScore } from '@/lib/score';
import { money, pct, duration, dateLabel, qty, price } from '@/lib/format';
import { TopBar, PageHead, RangeChips, Kpi, TradeRow, NoData, Money, PnlPill, Avatar } from '@/components/ui';
import { Spark, SemiGauge, Radar } from '@/components/charts';
import { EquityChart, DailyBars } from '@/components/InteractiveCharts';

export const dynamic = 'force-dynamic';

const sqnLabel = (v: number | null) =>
  v == null ? '—' : v < 0 ? 'Losing system' : v < 1.6 ? 'Poor' : v < 2 ? 'Below average' : v < 2.5 ? 'Average' : v < 3 ? 'Good' : v < 5 ? 'Excellent' : 'Superb';
const ICON = { bad: '!', good: '✓', info: 'i' } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx(sp);
  if (!ctx.execs.length) {
    return (<><TopBar title="Overview" /><main className="main"><NoData /></main></>);
  }
  const { closed, stats: s, days } = summary(ctx);
  const realized = days.reduce((a, d) => a + d.pnl, 0);
  const dd = maxDrawdown(days);
  let cum = 0;
  const curve = days.map((d) => ({ date: d.date, value: (cum += d.pnl) }));
  const score = traderScore(s, days, dd);
  const tips = insights(closed, s, days, ctx.pnl, ctx.ccy, ctx.notes).slice(0, 5);
  const open = ctx.trips.filter((t) => t.status === 'OPEN');
  const active = days.filter((d) => Math.abs(d.pnl) > 0.004);
  const best = active.reduce<(typeof days)[0] | null>((a, d) => (!a || d.pnl > a.pnl ? d : a), null);
  const worst = active.reduce<(typeof days)[0] | null>((a, d) => (!a || d.pnl < a.pnl ? d : a), null);
  const rangeLabel = RANGES.find((r) => r.id === ctx.range.id)?.label ?? 'Custom';
  const gross = realized - s.commissions;

  return (
    <>
      <TopBar title="Overview" ctx={ctx} />
      <main className="main">
        <PageHead title="Overview" sub={`${closed.length} closed trades · ${rangeLabel === 'All' ? 'all time' : rangeLabel}`}>
          <RangeChips sp={sp} path="/" current={ctx.range.id} />
        </PageHead>

        <section className={`hero ${realized >= 0 ? 'up' : 'down'}`}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="label">Net realized P&L</div>
              <div className={`big num ${realized >= 0 ? 'pos' : 'neg'}`}>{money(realized, ctx.ccy, { sign: true })}</div>
            </div>
            <Link href="/reports" className="btn sm" style={{ position: 'relative' }}>Reports</Link>
          </div>
          <div className="meta">
            <span className="pill">Gross <b className="num" style={{ color: 'var(--text)' }}>{money(gross, ctx.ccy, { sign: true, compact: true })}</b></span>
            <span className="pill">Fees <b className="num" style={{ color: 'var(--text)' }}>{money(-s.commissions, ctx.ccy, { compact: true })}</b></span>
            <span className="pill">{s.longs} long · {s.shorts} short</span>
          </div>
          <div className="spark"><Spark values={[0, ...curve.map((c) => c.value)]} /></div>
        </section>

        <div className="kpis">
          <Kpi icon="target" label="Win rate" value={pct(s.winRate)} sub={<><span className="pos">{s.wins}W</span> · <span className="neg">{s.losses}L</span></>}
            corner={<SemiGauge value={s.winRate} size={58} />} />
          <Kpi icon="scale" label="Profit factor" value={s.profitFactor ? s.profitFactor.toFixed(2) : '—'} sub="Gross win / gross loss"
            corner={<SemiGauge value={(s.profitFactor ?? 0) / 3} size={58} color={(s.profitFactor ?? 0) >= 1 ? 'var(--pos)' : 'var(--neg)'} />} />
          <Kpi icon="edge" label="Expectancy" value={money(s.expectancy, ctx.ccy, { sign: true })} tone={s.expectancy} sub="Average per trade" />
          <Kpi icon="swap" label="Avg win | loss" value={<span className="pos">{money(s.avgWin, ctx.ccy, { compact: true })}</span>}
            sub={<>vs <span className="neg">{money(s.avgLoss, ctx.ccy, { compact: true })}</span> · ratio {s.winLossRatio?.toFixed(2) ?? '—'}</>} />
          <Kpi icon="quality" label="System quality" value={s.sqn != null ? s.sqn.toFixed(2) : '—'} sub={`SQN · ${sqnLabel(s.sqn)}`} tone={s.sqn ?? undefined} />
          <Kpi icon="down" label="Max drawdown" value={money(dd, ctx.ccy, { compact: true })} tone={dd} sub="Peak to trough, realized" />
          <Kpi icon="fire" label="Max streaks" value={<><span className="pos">{s.maxWinStreak}W</span> <span className="faint">/</span> <span className="neg">{s.maxLossStreak}L</span></>}
            sub={`Now: ${s.currentStreak > 0 ? `${s.currentStreak} wins` : s.currentStreak < 0 ? `${-s.currentStreak} losses` : '—'}`} />
          <Kpi icon="cal" label="Best | worst day"
            value={best ? <Link href={`/journal/${best.date}`} className="pos">{money(best.pnl, ctx.ccy, { sign: true, compact: true })}</Link> : '—'}
            sub={worst ? <Link href={`/journal/${worst.date}`}><span className="neg">{money(worst.pnl, ctx.ccy, { compact: true })}</span> · {dateLabel(worst.date, false)}</Link> : undefined} />
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Equity curve</h3><span className="sub">Cumulative realized P&L</span></div>
            <EquityChart points={curve} ccy={ctx.ccy} />
          </section>
          <section className="card">
            <div className="card-head"><h3>Trader score</h3><span className="pill lg num"><span className="grad-text" style={{ fontWeight: 750 }}>{Math.round(score.total)}</span><span className="faint">/100</span></span></div>
            <div style={{ display: 'grid', placeItems: 'center' }}><Radar parts={score.parts.map((p) => ({ label: p.label, score: p.score }))} /></div>
          </section>
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Daily P&L</h3><Link href="/calendar" className="link">Calendar ›</Link></div>
            <DailyBars data={days.slice(-30).map((d) => ({ date: d.date, value: d.pnl }))} ccy={ctx.ccy} height={260} />
          </section>
          <section className="card">
            <div className="card-head"><h3>Insights</h3><span className="badge accent">AUTO</span></div>
            {tips.length ? tips.map((t, i) => (
              <div key={i} className={`insight ${t.tone}`}><span className="ico">{ICON[t.tone]}</span><div><b>{t.title}</b><p>{t.text}</p></div></div>
            )) : <p className="muted small">Insights appear once you have a few more trades in this range.</p>}
          </section>
        </div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Recent trades</h3><Link href="/trades" className="link">All trades ›</Link></div>
            <div className="list">
              {closed.slice(0, 8).map((t) => <TradeRow key={t.key} t={t} ctx={ctx} note={ctx.notes.get(t.key)} />)}
              {!closed.length && <p className="muted small">No closed trades in this range.</p>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Open positions</h3><span className="pill">{open.length}</span></div>
            {open.length ? (
              <div className="list">
                {open.map((t) => (
                  <Link key={t.key} href={`/trades/${encodeURIComponent(t.key)}`} className="trow">
                    <Avatar symbol={t.symbol} />
                    <div className="info">
                      <div className="sym">{t.symbol}<span className={`badge ${t.direction === 'LONG' ? 'long' : 'short'}`}>{t.direction}</span></div>
                      <div className="meta">{qty(Math.abs(t.openQty))} @ {price(t.entryPrice)} · since {dateLabel(t.openDate, false)}</div>
                    </div>
                    <div className="pnl"><PnlPill v={ctx.pnl(t)} ccy={ctx.ccy} /><span className="small">realized so far</span></div>
                  </Link>
                ))}
              </div>
            ) : <p className="muted small">You’re flat.</p>}
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="statlist">
              <span>Largest win</span><span className="pos">{money(s.largestWin, ctx.ccy)}</span>
              <span>Largest loss</span><span className="neg">{money(s.largestLoss, ctx.ccy)}</span>
              <span>Avg hold · winners</span><span>{duration(s.avgHoldWin)}</span>
              <span>Avg hold · losers</span><span>{duration(s.avgHoldLoss)}</span>
              <span>Commissions</span><Money v={-s.commissions} ccy={ctx.ccy} sign={false} />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
