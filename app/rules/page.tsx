import { getCtx, getRules } from '@/lib/view';
import { loadPlans } from '@/lib/data';
import { breaches, ruleHistory, RULE_IDS } from '@/lib/rules';
import { money } from '@/lib/format';
import { TopBar, PageHead, NoData } from '@/components/ui';
import { RulesEditor } from '@/components/RulesEditor';
import type { Trip } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Rules() {
  const ctx = await getCtx();
  if (!ctx.execs.length) return (<><TopBar title="Rules" /><main className="main"><NoData /></main></>);
  const [{ rules, suggested }, plans] = await Promise.all([getRules(ctx), loadPlans()]);
  const planMap = new Map(plans.map((p) => [p.day, p]));
  const history = ruleHistory(rules, ctx.trips, planMap, ctx.pnl);

  // Trades that broke at least one active rule vs. trades that broke none
  const closed = ctx.trips.filter((t) => t.status === 'CLOSED');
  const byDay = new Map<string, Trip[]>();
  for (const t of closed) byDay.set(t.openDate, [...(byDay.get(t.openDate) ?? []), t]);
  const broke = new Set<Trip>();
  for (const [d, ts] of byDay) {
    ts.sort((a, b) => (a.openTime < b.openTime ? -1 : 1));
    for (const id of RULE_IDS) if (!rules.disabled.includes(id)) for (const t of breaches(id, rules, ts, planMap.get(d) ?? null, ctx.pnl) ?? []) broke.add(t);
  }
  const sum = (ts: Trip[]) => ts.reduce((a, t) => a + ctx.pnl(t), 0);
  const bad = closed.filter((t) => broke.has(t)), good = closed.filter((t) => !broke.has(t));
  const symbolPnl: Record<string, number> = {};
  for (const t of closed) symbolPnl[t.symbol] = (symbolPnl[t.symbol] ?? 0) + ctx.pnl(t);

  return (
    <>
      <TopBar title="Rules" ctx={ctx} />
      <main className="main">
        <PageHead title="My rules" sub={`Built from your ${closed.length} trades and checked automatically against every fill`} />
        <section className="hero up" style={{ paddingBottom: 22 }}>
          <div className="label">What your rules are worth</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, position: 'relative' }}>
            <div className="mini-stat"><span>Followed every rule</span><b>{good.length} trades</b><em className={sum(good) >= 0 ? 'pos' : 'neg'} style={{ fontSize: 22 }}>{money(sum(good), ctx.ccy, { sign: true })}</em></div>
            <div className="mini-stat"><span>Broke at least one</span><b>{bad.length} trades</b><em className={sum(bad) >= 0 ? 'pos' : 'neg'} style={{ fontSize: 22 }}>{money(sum(bad), ctx.ccy, { sign: true })}</em></div>
          </div>
          <p className="small muted" style={{ marginBottom: 0, position: 'relative' }}>Rules are sorted by what breaking them has cost you. Change a number and the stats update.</p>
        </section>
        <RulesEditor initial={rules} suggested={suggested} history={history} ccy={ctx.ccy} tradeCcy={ctx.tradeCcy} symbolPnl={symbolPnl} />
      </main>
    </>
  );
}
