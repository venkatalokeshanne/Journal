import Link from 'next/link';
import { getCtx, one, qs, type SP } from '@/lib/view';
import { dailyPnl } from '@/lib/engine';
import { loadJournal } from '@/lib/data';
import { todayInTz } from '@/lib/time';
import { dateLabel, WEEKDAY_NAMES } from '@/lib/format';
import { weekdayOf } from '@/lib/time';
import { TopBar, PnlPill, PageHead } from '@/components/ui';

export const dynamic = 'force-dynamic';
const PAGE = 30;

export default async function JournalList({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [ctx, journal] = await Promise.all([getCtx(), loadJournal()]);
  const closed = ctx.trips.filter((t) => t.status === 'CLOSED');
  const days = dailyPnl(ctx.execs, closed, ctx.base, ctx.includeForex);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const all = [...new Set([...days.map((d) => d.date), ...journal.keys()])].sort().reverse();
  const today = todayInTz();
  const page = Math.max(1, parseInt(one(sp.page) || '1', 10) || 1);
  const shown = all.slice((page - 1) * PAGE, page * PAGE);
  const journaled = [...journal.values()].filter((j) => j.plan || j.review || j.lessons).length;

  return (
    <>
      <TopBar title="Journal" ctx={ctx} />
      <main className="main">
        <PageHead title="Journal" sub={`${journaled} of ${days.length} trading days reviewed`}>
          <Link className="btn primary" href={`/journal/${today}`}>＋ Today’s entry</Link>
        </PageHead>
        <section className="card" style={{ padding: '6px 8px' }}>
          <div className="list">
            {shown.map((d) => {
              const v = byDate.get(d), j = journal.get(d);
              const snippet = j?.review || j?.plan || j?.lessons;
              return (
                <Link key={d} href={`/journal/${d}`} className="trow">
                  <span className="datebox"><small>{WEEKDAY_NAMES[weekdayOf(d)]}</small>{+d.slice(8)}</span>
                  <div className="info">
                    <div className="sym">{dateLabel(d)}
                      {j?.mood ? <span>{['😣', '🙁', '😐', '🙂', '😄'][j.mood - 1]}</span> : null}
                      {!snippet && v && <span className="badge warn">TO REVIEW</span>}
                      {snippet && <span className="badge long">REVIEWED</span>}
                    </div>
                    <div className="meta">{snippet ? snippet.slice(0, 90) : v ? `${v.trades} trade${v.trades === 1 ? '' : 's'}` : 'No trades'}</div>
                  </div>
                  <div className="pnl">{v ? <PnlPill v={v.pnl} ccy={ctx.ccy} /> : <span className="faint">—</span>}</div>
                </Link>
              );
            })}
            {!shown.length && <p className="muted" style={{ padding: 16 }}>No days yet. Start with today’s plan.</p>}
          </div>
        </section>
        {all.length > PAGE && (
          <div className="row between">
            {page > 1 ? <Link className="btn" href={`/journal${qs(sp, { page: page - 1 })}`}>‹ Newer</Link> : <span />}
            <span className="small muted">Page {page} of {Math.ceil(all.length / PAGE)}</span>
            {page * PAGE < all.length ? <Link className="btn" href={`/journal${qs(sp, { page: page + 1 })}`}>Older ›</Link> : <span />}
          </div>
        )}
      </main>
    </>
  );
}
