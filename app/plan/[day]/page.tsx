import { notFound } from 'next/navigation';
import { getCtx, getRules } from '@/lib/view';
import { evaluateDay } from '@/lib/rules';
import { loadPlan, loadPlanDefaults, loadPlans } from '@/lib/data';
import { emptyPlan, type DayReality } from '@/lib/plan';
import { todayInTz } from '@/lib/time';
import { TopBar } from '@/components/ui';
import { PlanBoard } from '@/components/PlanBoard';
import { aiEnabled, loadNote } from '@/lib/ai/run';

export const dynamic = 'force-dynamic';

export default async function PlanDay({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound();
  const [ctx, saved, defaults, plans, aiCheck] = await Promise.all([getCtx(), loadPlan(day), loadPlanDefaults(), loadPlans(), loadNote('plan', day)]);
  const previous = plans.find((p) => p.day < day && p.tickers.length > 0) ?? null;

  // What actually happened that day (round trips opened that day)
  const bySymbol: DayReality['bySymbol'] = {};
  const dayTrips = ctx.trips.filter((t) => t.openDate === day);
  for (const t of dayTrips) {
    const s = t.assetClass === 'STK' ? t.symbol : t.underlying ?? t.symbol;
    const v = (bySymbol[s] ??= { n: 0, pnl: 0 });
    v.n++;
    v.pnl += ctx.pnl(t);
  }
  const dayPnl = ctx.execs
    .filter((e) => e.tradeDate === day && (ctx.includeForex || e.assetClass !== 'CASH'))
    .reduce((s, e) => s + e.realizedPnl, 0);

  const { rules } = await getRules(ctx);
  const ruleStatus = evaluateDay(rules, ctx.trips, day, saved, (t) => t.realized, ctx.tradeCcy);
  const symbolPnl: Record<string, number> = {};
  for (const t of ctx.trips) if (t.status === 'CLOSED') symbolPnl[t.symbol] = (symbolPnl[t.symbol] ?? 0) + ctx.pnl(t);
  const recentSymbols = [...new Set(ctx.trips.slice(0, 80).map((t) => t.symbol))].slice(0, 12);

  return (
    <>
      <TopBar title="Plan" ctx={ctx} />
      <main className="main">
        <PlanBoard
          key={day}
          initial={saved ?? emptyPlan(day, defaults)}
          isNew={!saved}
          defaults={defaults}
          previous={previous}
          reality={{ trades: dayTrips.length, dayPnl, bySymbol, rules: { kept: ruleStatus.filter((r) => r.status === 'kept').length, broken: ruleStatus.filter((r) => r.status === 'broken').length } }}
          ruleStatus={ruleStatus}
          focus={rules.focus}
          blacklist={rules.blacklist}
          symbolPnl={symbolPnl}
          setups={ctx.setups.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name, rules: s.rules }))}
          recentSymbols={recentSymbols}
          ccy={ctx.ccy}
          tradeCcy={ctx.tradeCcy}
          today={todayInTz()}
          aiEnabled={aiEnabled()}
          aiCheck={aiCheck}
        />
      </main>
    </>
  );
}
