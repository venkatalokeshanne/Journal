import Link from 'next/link';
import { getCtx, summary, type SP } from '@/lib/view';
import { groupBy, holdBucket, marketParts, maxDrawdown, computeStats, type Bucket } from '@/lib/engine';
import { traderScore } from '@/lib/score';
import { money, pct, monthLabel, WEEKDAY_NAMES, pnlClass } from '@/lib/format';
import { TopBar, RangeChips, NoData, Money } from '@/components/ui';
import { HBars, Radar } from '@/components/charts';

export const dynamic = 'force-dynamic';

function BucketCard({ title, rows, ccy, link }: { title: string; rows: Bucket[]; ccy: string; link?: (b: Bucket) => string }) {
  if (!rows.length) return null;
  return (
    <section className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <HBars ccy={ccy} rows={rows.map((b) => ({ label: b.label, value: b.pnl, sub: `${b.trades} · ${pct(b.wins / b.trades, 0)}` }))} />
      {link && (
        <div className="chips" style={{ marginTop: 8 }}>
          {rows.slice(0, 8).map((b) => <Link key={b.label} className="chip" href={link(b)}>{b.label}</Link>)}
        </div>
      )}
    </section>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx(sp);
  if (!ctx.execs.length) return (<><TopBar title="Reports" /><main className="main"><NoData /></main></>);
  const { closed, stats: s, days } = summary(ctx);
  const dd = maxDrawdown(days);
  const score = traderScore(s, days, dd);
  const P = ctx.pnl;

  const byMonth = groupBy(closed, P, (t) => ({ label: t.closeDate!.slice(0, 7), sort: +t.closeDate!.slice(0, 7).replace('-', '') }));
  const monthRows = [...byMonth].reverse().map((b) => {
    const ts = closed.filter((t) => t.closeDate!.startsWith(b.label));
    return { ...b, st: computeStats(ts, P, ctx.comm) };
  });
  const byWeekday = groupBy(closed, P, (t) => { const w = marketParts(t.openTime).weekday; return { label: WEEKDAY_NAMES[w], sort: (w + 6) % 7 }; });
  const byHour = groupBy(closed, P, (t) => { const h = marketParts(t.openTime).hour; return { label: `${String(h).padStart(2, '0')}:00`, sort: h }; });
  const byHold = groupBy(closed, P, (t) => holdBucket(t.holdSeconds));
  const bySide = groupBy(closed, P, (t) => ({ label: t.direction === 'LONG' ? 'Long' : 'Short', sort: t.direction === 'LONG' ? 0 : 1 }));
  const bySymbol = groupBy(closed, P, (t) => ({ label: t.symbol, sort: 0 })).sort((a, b) => b.pnl - a.pnl);
  const topSym = [...bySymbol.slice(0, 8), ...bySymbol.slice(-8).filter((b) => !bySymbol.slice(0, 8).includes(b))];
  const bySize = groupBy(closed, P, (t) => {
    const v = t.maxPosition * t.entryPrice * t.multiplier;
    const edges = [1000, 5000, 10000, 25000, 50000, Infinity];
    const labels = ['< 1k', '1k–5k', '5k–10k', '10k–25k', '25k–50k', '> 50k'];
    const i = edges.findIndex((e) => v < e);
    return { label: labels[i], sort: i };
  });
  const bySetup = groupBy(closed, P, (t) => {
    const id = ctx.notes.get(t.key)?.setupId;
    const name = id ? ctx.setups.find((x) => x.id === id)?.name : null;
    return { label: name ?? 'No setup', sort: name ? 0 : 1 };
  }).sort((a, b) => b.pnl - a.pnl);
  const tagged = (field: 'tags' | 'mistakes') => {
    const m = new Map<string, Bucket>();
    for (const t of closed) for (const tg of ctx.notes.get(t.key)?.[field] ?? []) {
      const b = m.get(tg) ?? { label: tg, trades: 0, wins: 0, pnl: 0, sort: 0 };
      b.trades++; b.pnl += P(t); if (P(t) > 0.004) b.wins++;
      m.set(tg, b);
    }
    return [...m.values()].sort((a, b) => a.pnl - b.pnl);
  };
  const byTag = tagged('tags');
  const byMistake = tagged('mistakes');
  const rTrades = closed
    .map((t) => { const n = ctx.notes.get(t.key); if (!n?.stopPrice) return null; const risk = Math.abs(t.entryPrice - n.stopPrice) * t.maxPosition * t.multiplier; return risk > 0 ? t.realized / risk : null; })
    .filter((r): r is number => r != null);

  return (
    <>
      <TopBar title="Reports" ctx={ctx} />
      <main className="main">
        <div className="page-head"><h1>Reports</h1><RangeChips sp={sp} path="/reports" current={ctx.range.id} /></div>

        <div className="two">
          <section className="card">
            <div className="card-head"><h3>Performance summary</h3></div>
            <table className="t num">
              <tbody>
                {([
                  ['Net P&L', <Money key="n" v={s.net} ccy={ctx.ccy} />],
                  ['Gross profit / loss', <span key="g"><span className="pos">{money(s.grossProfit, ctx.ccy)}</span> / <span className="neg">{money(s.grossLoss, ctx.ccy)}</span></span>],
                  ['Commissions', money(-s.commissions, ctx.ccy)],
                  ['Trades', `${s.trades} (${s.wins}W / ${s.losses}L / ${s.breakeven}BE)`],
                  ['Win rate', pct(s.winRate)],
                  ['Profit factor', s.profitFactor?.toFixed(2) ?? '—'],
                  ['Expectancy', <Money key="e" v={s.expectancy} ccy={ctx.ccy} />],
                  ['Average win / loss', `${money(s.avgWin, ctx.ccy)} / ${money(s.avgLoss, ctx.ccy)}`],
                  ['Largest win / loss', `${money(s.largestWin, ctx.ccy)} / ${money(s.largestLoss, ctx.ccy)}`],
                  ['Max drawdown', <span key="d" className={pnlClass(dd)}>{money(dd, ctx.ccy)}</span>],
                  ['Max win / loss streak', `${s.maxWinStreak} / ${s.maxLossStreak}`],
                  ['Average R (trades with a stop)', rTrades.length ? `${(rTrades.reduce((a, b) => a + b, 0) / rTrades.length).toFixed(2)}R over ${rTrades.length}` : '—'],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <tr key={k}><td className="muted">{k}</td><td className="r">{v}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <div className="card-head"><h3>Trader score</h3></div>
            <div style={{ display: 'grid', placeItems: 'center' }}><Radar parts={score.parts} /></div>
            <div className="row" style={{ justifyContent: 'center', margin: '4px 0 8px' }}><span className="pill lg"><span className="grad-text" style={{ fontWeight: 750 }}>{Math.round(score.total)}</span><span className="faint">/100</span></span></div>
            <table className="t num" style={{ marginTop: 8 }}>
              <tbody>{score.parts.map((p) => (<tr key={p.label}><td className="muted">{p.label}</td><td className="r">{p.detail}</td><td className="r">{Math.round(p.score)}</td></tr>))}</tbody>
            </table>
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h3>By month</h3></div>
          <div className="scroll-x">
            <table className="t num">
              <thead><tr><th>Month</th><th className="r">Trades</th><th className="r">Win %</th><th className="r">PF</th><th className="r">Fees</th><th className="r">Net</th></tr></thead>
              <tbody>
                {monthRows.map((m) => (
                  <tr key={m.label}>
                    <td><Link href={`/calendar?m=${m.label}`}>{monthLabel(m.label)}</Link></td>
                    <td className="r">{m.trades}</td>
                    <td className="r">{pct(m.st.winRate, 0)}</td>
                    <td className="r">{m.st.profitFactor?.toFixed(2) ?? '—'}</td>
                    <td className="r muted">{money(-m.st.commissions, ctx.ccy, { compact: true })}</td>
                    <td className="r"><Money v={m.pnl} ccy={ctx.ccy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="two even">
          <BucketCard title="Time of day (entry, ET)" rows={byHour} ccy={ctx.ccy} />
          <BucketCard title="Day of week" rows={byWeekday} ccy={ctx.ccy} />
          <BucketCard title="Holding time" rows={byHold} ccy={ctx.ccy} />
          <BucketCard title="Position size (notional)" rows={bySize} ccy={ctx.ccy} />
          <BucketCard title="Long vs short" rows={bySide} ccy={ctx.ccy} />
          <BucketCard title="Setups" rows={bySetup} ccy={ctx.ccy} />
          <BucketCard title="Best & worst symbols" rows={topSym} ccy={ctx.ccy} link={(b) => `/trades?q=${encodeURIComponent(b.label)}`} />
          <BucketCard title="Tags" rows={byTag} ccy={ctx.ccy} link={(b) => `/trades?tag=${encodeURIComponent(b.label)}`} />
          <BucketCard title="Cost of mistakes" rows={byMistake} ccy={ctx.ccy} link={(b) => `/trades?mistake=${encodeURIComponent(b.label)}`} />
        </div>
        {!byMistake.length && <p className="small muted">Tag mistakes on your trades to see what they cost you.</p>}
      </main>
    </>
  );
}
