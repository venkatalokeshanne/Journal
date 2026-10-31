import Link from 'next/link';
import { getCtx, one, qs, type SP } from '@/lib/view';
import { computeStats } from '@/lib/engine';
import { money, pct } from '@/lib/format';
import { TopBar, RangeChips, TradeRow, NoData } from '@/components/ui';

export const dynamic = 'force-dynamic';
const PAGE = 40;

export default async function Trades({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx(sp);
  if (!ctx.execs.length) return (<><TopBar title="Trades" /><main className="main"><NoData /></main></>);

  const f = {
    q: one(sp.q).trim().toUpperCase(),
    side: one(sp.side),
    result: one(sp.result),
    status: one(sp.status) || 'closed',
    setup: one(sp.setup),
    tag: one(sp.tag),
    mistake: one(sp.mistake),
    day: one(sp.day),
    sort: one(sp.sort) || 'date',
  };

  let list = ctx.trips.filter((t) => {
    if (f.status === 'closed' && t.status !== 'CLOSED') return false;
    if (f.status === 'open' && t.status !== 'OPEN') return false;
    const d = t.closeDate ?? t.openDate;
    if (f.day ? d !== f.day : !ctx.inRange(d)) return false;
    if (f.q && !t.symbol.toUpperCase().includes(f.q) && !(t.underlying ?? '').toUpperCase().includes(f.q)) return false;
    if (f.side && t.direction !== f.side) return false;
    const p = ctx.pnl(t);
    if (f.result === 'win' && !(p > 0.004)) return false;
    if (f.result === 'loss' && !(p < -0.004)) return false;
    const n = ctx.notes.get(t.key);
    if (f.setup && String(n?.setupId ?? '') !== f.setup) return false;
    if (f.tag && !n?.tags.includes(f.tag)) return false;
    if (f.mistake && !n?.mistakes.includes(f.mistake)) return false;
    return true;
  });

  const sorters: Record<string, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
    date: (a, b) => ((b.closeTime ?? b.openTime) > (a.closeTime ?? a.openTime) ? 1 : -1),
    oldest: (a, b) => ((a.closeTime ?? a.openTime) > (b.closeTime ?? b.openTime) ? 1 : -1),
    best: (a, b) => ctx.pnl(b) - ctx.pnl(a),
    worst: (a, b) => ctx.pnl(a) - ctx.pnl(b),
    hold: (a, b) => (b.holdSeconds ?? 0) - (a.holdSeconds ?? 0),
    size: (a, b) => b.maxPosition * b.entryPrice - a.maxPosition * a.entryPrice,
  };
  list = list.sort(sorters[f.sort] ?? sorters.date);

  const s = computeStats(list.filter((t) => t.status === 'CLOSED'), ctx.pnl, ctx.comm);
  const page = Math.max(1, parseInt(one(sp.page) || '1', 10) || 1);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);

  const allTags = [...new Set([...ctx.notes.values()].flatMap((n) => n.tags))].sort();
  const allMistakes = [...new Set([...ctx.notes.values()].flatMap((n) => n.mistakes))].sort();
  const activeFilters = ['q', 'side', 'result', 'setup', 'tag', 'mistake', 'day'].filter((k) => one(sp[k])).length + (f.status !== 'closed' ? 1 : 0);

  return (
    <>
      <TopBar title="Trades" ctx={ctx} />
      <main className="main stack">
        <div className="page-head">
          <h1>Trades</h1>
          <RangeChips sp={sp} path="/trades" current={f.day ? 'custom' : ctx.range.id} />
        </div>

        <details className="card">
          <summary className="row between">
            <h2>Filters {activeFilters ? <span className="badge accent">{activeFilters}</span> : null}</h2>
            <span className="small muted">Sort · {f.sort}</span>
          </summary>
          <form className="form-grid" style={{ marginTop: 12 }} method="get">
            {['range', 'from', 'to'].map((k) => one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null)}
            <div className="field full"><label>Symbol</label><input name="q" defaultValue={one(sp.q)} placeholder="e.g. NVDA" autoCapitalize="characters" /></div>
            <div className="field"><label>Status</label>
              <select name="status" defaultValue={f.status}><option value="closed">Closed</option><option value="open">Open</option><option value="all">All</option></select></div>
            <div className="field"><label>Side</label>
              <select name="side" defaultValue={f.side}><option value="">Any</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></div>
            <div className="field"><label>Result</label>
              <select name="result" defaultValue={f.result}><option value="">Any</option><option value="win">Winners</option><option value="loss">Losers</option></select></div>
            <div className="field"><label>Sort</label>
              <select name="sort" defaultValue={f.sort}>
                <option value="date">Newest</option><option value="oldest">Oldest</option><option value="best">Best P&L</option>
                <option value="worst">Worst P&L</option><option value="hold">Longest hold</option><option value="size">Largest size</option>
              </select></div>
            <div className="field"><label>Setup</label>
              <select name="setup" defaultValue={f.setup}><option value="">Any</option>{ctx.setups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="field"><label>Tag</label>
              <select name="tag" defaultValue={f.tag}><option value="">Any</option>{allTags.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div className="field full"><label>Mistake</label>
              <select name="mistake" defaultValue={f.mistake}><option value="">Any</option>{allMistakes.map((x) => <option key={x}>{x}</option>)}</select></div>
            {f.day && <input type="hidden" name="day" value={f.day} />}
            <div className="row full">
              <button className="btn primary grow" type="submit">Apply</button>
              <Link className="btn" href="/trades">Reset</Link>
            </div>
          </form>
        </details>

        <div className="kpis">
          <div className="kpi"><div className="label">Trades</div><div className="value num">{list.length}</div></div>
          <div className="kpi"><div className="label">Net P&L</div><div className={`value num ${s.net >= 0 ? 'pos' : 'neg'}`}>{money(s.net, ctx.ccy, { sign: true })}</div></div>
          <div className="kpi"><div className="label">Win rate</div><div className="value num">{pct(s.winRate)}</div></div>
          <div className="kpi"><div className="label">Profit factor</div><div className="value num">{s.profitFactor ? s.profitFactor.toFixed(2) : '—'}</div></div>
          <div className="kpi"><div className="label">Expectancy</div><div className={`value num ${s.expectancy >= 0 ? 'pos' : 'neg'}`}>{money(s.expectancy, ctx.ccy, { sign: true })}</div></div>
          <div className="kpi"><div className="label">Fees</div><div className="value num">{money(-s.commissions, ctx.ccy)}</div></div>
        </div>

        {f.day && (
          <div className="row between card" style={{ padding: 12 }}>
            <span>Showing trades closed on <b>{f.day}</b></span>
            <Link className="btn sm" href={`/journal/${f.day}`}>Day journal</Link>
          </div>
        )}

        <section className="card" style={{ padding: '4px 12px' }}>
          <div className="list">
            {shown.map((t) => <TradeRow key={t.key} t={t} ctx={ctx} note={ctx.notes.get(t.key)} />)}
            {!shown.length && <p className="muted" style={{ padding: 16 }}>No trades match these filters.</p>}
          </div>
        </section>

        {pages > 1 && (
          <div className="row between">
            {page > 1 ? <Link className="btn" href={`/trades${qs(sp, { page: page - 1 })}`}>‹ Newer</Link> : <span />}
            <span className="small muted">Page {page} of {pages}</span>
            {page < pages ? <Link className="btn" href={`/trades${qs(sp, { page: page + 1 })}`}>Older ›</Link> : <span />}
          </div>
        )}
      </main>
    </>
  );
}
