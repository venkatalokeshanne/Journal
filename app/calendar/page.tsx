import Link from 'next/link';
import { getCtx, one, type SP } from '@/lib/view';
import { dailyPnl } from '@/lib/engine';
import { money, monthLabel, pnlClass, pct } from '@/lib/format';
import { todayInTz, addDays, weekdayOf } from '@/lib/time';
import { TopBar, NoData, Money } from '@/components/ui';

export const dynamic = 'force-dynamic';

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  if (!ctx.execs.length) return (<><TopBar title="Calendar" /><main className="main"><NoData /></main></>);

  const closed = ctx.trips.filter((t) => t.status === 'CLOSED');
  const days = dailyPnl(ctx.execs, closed, ctx.base, ctx.includeForex);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = todayInTz();
  const lastWithData = days.length ? days[days.length - 1].date.slice(0, 7) : today.slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(one(sp.m)) ? one(sp.m) : lastWithData;

  const first = `${ym}-01`;
  const lead = (weekdayOf(first) + 6) % 7; // Monday-first
  const nDays = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);

  const monthDays = days.filter((d) => d.date.startsWith(ym));
  const mPnl = monthDays.reduce((s, d) => s + d.pnl, 0);
  const mTrades = monthDays.reduce((s, d) => s + d.trades, 0);
  const mWins = monthDays.reduce((s, d) => s + d.wins, 0);
  const green = monthDays.filter((d) => d.pnl > 0.004).length, red = monthDays.filter((d) => d.pnl < -0.004).length;

  const weeks: { label: string; pnl: number; trades: number }[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const wk = cells.slice(i, i + 7).filter(Boolean) as string[];
    const ds = wk.map((d) => byDate.get(d)).filter(Boolean);
    weeks.push({ label: `${wk[0].slice(5)} – ${wk[wk.length - 1].slice(5)}`, pnl: ds.reduce((s, d) => s + d!.pnl, 0), trades: ds.reduce((s, d) => s + d!.trades, 0) });
  }

  // 12-month strip
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(ym, i - 11)).map((m) => ({
    m, pnl: days.filter((d) => d.date.startsWith(m)).reduce((s, d) => s + d.pnl, 0), has: days.some((d) => d.date.startsWith(m)),
  }));

  return (
    <>
      <TopBar title="Calendar" ctx={ctx} />
      <main className="main stack">
        <div className="page-head">
          <h1>{monthLabel(ym)}</h1>
          <div className="row">
            <Link className="btn sm" href={`/calendar?m=${shiftMonth(ym, -1)}`} aria-label="Previous month">‹</Link>
            <Link className="btn sm" href={`/calendar?m=${today.slice(0, 7)}`}>Today</Link>
            <Link className="btn sm" href={`/calendar?m=${shiftMonth(ym, 1)}`} aria-label="Next month">›</Link>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi hero"><div className="label">Month P&L</div><div className={`value num ${pnlClass(mPnl)}`}>{money(mPnl, ctx.ccy, { sign: true })}</div>
            <div className="sub">{mTrades} trades · {mTrades ? pct(mWins / mTrades, 0) : '—'} win rate · {green} green / {red} red days</div></div>
        </div>

        <section className="card" style={{ padding: 10 }}>
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="day empty" />;
              const v = byDate.get(d);
              const cls = v ? (v.pnl > 0.004 ? 'win' : v.pnl < -0.004 ? 'loss' : '') : '';
              const inner = (
                <>
                  <span className="d">{+d.slice(8)}</span>
                  {v && (Math.abs(v.pnl) > 0.004 || v.trades) ? (
                    <span>
                      <span className={`v num ${pnlClass(v.pnl)}`} style={{ display: 'block' }}>{money(v.pnl, ctx.ccy, { compact: true, sign: true })}</span>
                      <span className="n">{v.trades} trade{v.trades === 1 ? '' : 's'}</span>
                    </span>
                  ) : null}
                </>
              );
              return v ? (
                <Link key={d} href={`/journal/${d}`} className={`day ${cls} ${d === today ? 'today' : ''}`}>{inner}</Link>
              ) : (
                <Link key={d} href={`/journal/${d}`} className={`day ${d === today ? 'today' : ''}`} style={{ opacity: 0.6 }}>{inner}</Link>
              );
            })}
          </div>
        </section>

        <div className="two even">
          <section className="card">
            <div className="card-head"><h2>Weeks</h2></div>
            <table className="t num">
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.label}><td className="muted">{w.label}</td><td className="r muted">{w.trades} trades</td><td className="r"><Money v={w.pnl} ccy={ctx.ccy} /></td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <div className="card-head"><h2>Last 12 months</h2></div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {months.map((m) => (
                <Link key={m.m} href={`/calendar?m=${m.m}`} className={`kpi ${m.m === ym ? 'hero' : ''}`} style={{ padding: 8, gridColumn: 'auto', outline: m.m === ym ? '2px solid var(--accent)' : undefined }}>
                  <div className="label">{monthLabel(m.m)}</div>
                  <div className={`num small ${pnlClass(m.pnl)}`} style={{ fontWeight: 650 }}>{m.has ? money(m.pnl, ctx.ccy, { compact: true, sign: true }) : '—'}</div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
