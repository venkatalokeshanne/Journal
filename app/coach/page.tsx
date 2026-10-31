import { TopBar, PageHead } from '@/components/ui';
import { CoachChat } from '@/components/CoachChat';
import { WeeklyReview } from '@/components/WeeklyReview';
import { getCtx, one, type SP } from '@/lib/view';
import { aiEnabled, listNotes, monthSpend, monthlyLimit } from '@/lib/ai/run';
import { addDays, todayInTz, weekdayOf } from '@/lib/time';
import { dateLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Coach({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [ctx, weekly, spend] = await Promise.all([getCtx(), listNotes('weekly', 20), monthSpend()]);
  const enabled = aiEnabled();
  const today = todayInTz();
  const thisMonday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(thisMonday, -7 * i)).map((m, i) => ({
    monday: m, label: i === 0 ? 'This week' : i === 1 ? 'Last week' : dateLabel(m, false),
  }));
  // default to last week when this week has no trades yet
  if (!ctx.trips.some((t) => (t.closeDate ?? '') >= thisMonday)) weeks.push(weeks.shift()!);
  const saved = Object.fromEntries(weekly.map((w) => [w.ref, { content: w.content, createdAt: w.createdAt }]));
  const limit = monthlyLimit();

  return (
    <>
      <TopBar title="Coach" ctx={ctx} />
      <main className="main">
        <PageHead title="Coach" sub="Your AI trading coach, using your own trades, plans and notes" />
        <div className="two">
          <section className="card chat-card">
            <div className="card-head"><h3><span className="ai-spark">✦</span> Ask your coach</h3></div>
            <CoachChat enabled={enabled} initialQuestion={one(sp.q) || undefined} />
          </section>
          <div className="stack">
            <WeeklyReview weeks={weeks} saved={saved} enabled={enabled} />
            <section className="card">
              <div className="card-head"><h3>AI spend this month</h3><span className="pill">{spend.calls} requests</span></div>
              <div className="row between"><b className="num" style={{ fontSize: 22 }}>${spend.cost.toFixed(spend.cost < 1 ? 3 : 2)}</b><span className="small muted">limit ${limit.toFixed(2)}</span></div>
              <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, (spend.cost / limit) * 100)}%`, background: spend.cost >= limit ? 'var(--neg)' : 'var(--grad)' }} /></div>
              <p className="small faint" style={{ marginBottom: 0 }}>Daily features use Claude Haiku 5.5 (about $0.001 each); the weekly review uses Claude Sonnet 5.5. Change the cap with <code>AI_MONTHLY_LIMIT_USD</code>.</p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
