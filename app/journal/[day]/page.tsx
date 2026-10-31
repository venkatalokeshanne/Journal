import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/view';
import { computeStats } from '@/lib/engine';
import { loadJournal } from '@/lib/data';
import { addDays, weekdayOf } from '@/lib/time';
import { dateLabel, money, pct, WEEKDAY_NAMES } from '@/lib/format';
import { TopBar, TradeRow, Kpi } from '@/components/ui';
import { JournalForm } from '@/components/forms';
import { DebriefPanel } from '@/components/DebriefPanel';
import { aiEnabled, loadNote } from '@/lib/ai/run';

export const dynamic = 'force-dynamic';

export default async function JournalDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound();
  const [ctx, journal, debrief] = await Promise.all([getCtx(), loadJournal(), loadNote('debrief', day)]);
  const trips = ctx.trips.filter((t) => t.closeDate === day || (t.status === 'OPEN' && t.openDate === day));
  const closed = trips.filter((t) => t.status === 'CLOSED');
  const realized = ctx.execs
    .filter((e) => e.tradeDate === day && (ctx.includeForex || e.assetClass !== 'CASH'))
    .reduce((s, e) => s + e.realizedPnl * (ctx.base ? e.fxRateToBase : 1), 0);
  const s = computeStats(closed, ctx.pnl, ctx.comm);
  const j = journal.get(day) ?? { day, plan: '', review: '', lessons: '', mood: null, discipline: null };

  return (
    <>
      <TopBar title="Journal" ctx={ctx} />
      <main className="main">
        <div className="row between">
          <Link className="btn sm" href={`/journal/${addDays(day, -1)}`} aria-label="Previous day">‹</Link>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 19 }}>{WEEKDAY_NAMES[weekdayOf(day)]}, {dateLabel(day)}</h1>
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <Link href="/journal" className="small muted">All days</Link>
              <Link href={`/plan/${day}`} className="small" style={{ color: 'var(--accent)' }}>Open plan ›</Link>
            </div>
          </div>
          <Link className="btn sm" href={`/journal/${addDays(day, 1)}`} aria-label="Next day">›</Link>
        </div>

        <div className="kpis">
          <Kpi label="Realized P&L" value={money(realized, ctx.ccy, { sign: true })} tone={realized} />
          <Kpi label="Trades" value={s.trades} sub={`${s.wins}W · ${s.losses}L`} />
          <Kpi label="Win rate" value={s.trades ? pct(s.winRate, 0) : '—'} />
          <Kpi label="Fees" value={money(-s.commissions, ctx.ccy)} />
        </div>

        <DebriefPanel day={day} saved={debrief} enabled={aiEnabled()} />

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Notes for the day</h3></div>
            <JournalForm key={`${day}:${j.review.length}`} j={j} />
          </section>
          <section className="card">
            <div className="card-head"><h3>Trades</h3><Link className="small muted" href={`/trades?day=${day}&status=all`}>Open list ›</Link></div>
            <div className="list">
              {trips.map((t) => <TradeRow key={t.key} t={t} ctx={ctx} note={ctx.notes.get(t.key)} />)}
              {!trips.length && <p className="muted small">No trades closed this day.</p>}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
