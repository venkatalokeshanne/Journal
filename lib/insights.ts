import { groupBy, holdBucket, marketParts, type PnlFn, type Stats, type DayPnl } from './engine';
import { WEEKDAY_NAMES, duration, money, pct } from './format';
import type { Trip, TradeNote } from './types';

export interface Insight {
  tone: 'good' | 'bad' | 'info';
  title: string;
  text: string;
}

const MIN = 5; // minimum trades before a pattern is worth mentioning

/** Plain-language patterns found in the trades, ordered by importance. */
export function insights(closed: Trip[], stats: Stats, days: DayPnl[], pnl: PnlFn, ccy: string, notes: Map<string, TradeNote>): Insight[] {
  const out: Insight[] = [];
  if (closed.length < MIN) return out;
  const m = (v: number) => money(v, ccy, { sign: true });

  // Losers held longer than winners
  if (stats.avgHoldWin && stats.avgHoldLoss && stats.avgHoldLoss > stats.avgHoldWin * 1.5) {
    out.push({
      tone: 'bad',
      title: 'Losers held too long',
      text: `You hold losing trades ${duration(stats.avgHoldLoss)} on average vs ${duration(stats.avgHoldWin)} for winners. Cutting losers faster usually lifts expectancy the most.`,
    });
  }

  // Average loss bigger than average win while win rate isn't high enough
  if (stats.winLossRatio != null && stats.winLossRatio < 1 && stats.winRate < 1 / (1 + stats.winLossRatio)) {
    const needed = 1 / (1 + stats.winLossRatio);
    out.push({
      tone: 'bad',
      title: 'Losses outweigh wins',
      text: `Your average loss is ${(1 / stats.winLossRatio).toFixed(1)}× your average win. At that ratio you need a ${pct(needed)} win rate to break even; you have ${pct(stats.winRate)}.`,
    });
  }

  // Big-loss concentration
  const losers = closed.map(pnl).filter((p) => p < 0).sort((a, b) => a - b);
  if (losers.length >= MIN) {
    const top = losers.slice(0, Math.max(1, Math.round(losers.length * 0.1)));
    const share = top.reduce((s, p) => s + p, 0) / losers.reduce((s, p) => s + p, 0);
    if (share > 0.4) {
      out.push({
        tone: 'bad',
        title: 'A few trades cause most losses',
        text: `Your worst ${top.length} trade${top.length > 1 ? 's' : ''} (${pct(top.length / losers.length, 0)} of losers) caused ${pct(share, 0)} of all losses. A hard max-loss per trade would protect you.`,
      });
    }
  }

  // Revenge trading: trades opened within 30 min after a losing trade closed
  const chron = [...closed].sort((a, b) => (a.openTime < b.openTime ? -1 : 1));
  const lossCloses = closed.filter((t) => pnl(t) < 0).map((t) => Date.parse(t.closeTime!));
  const after = chron.filter((t) => {
    const o = Date.parse(t.openTime);
    return lossCloses.some((c) => o > c && o - c <= 30 * 60 * 1000);
  });
  if (after.length >= MIN) {
    const avgAfter = after.reduce((s, t) => s + pnl(t), 0) / after.length;
    if (avgAfter < stats.expectancy && avgAfter < 0) {
      out.push({
        tone: 'bad',
        title: 'Trading right after a loss hurts',
        text: `${after.length} trades opened within 30 min of a loss averaged ${m(avgAfter)} vs ${m(stats.expectancy)} overall. Consider a cool-down after a loss.`,
      });
    }
  }

  // Overtrading: busiest days vs others
  const active = days.filter((d) => d.trades > 0);
  if (active.length >= 10) {
    const counts = active.map((d) => d.trades).sort((a, b) => a - b);
    const p75 = counts[Math.floor(counts.length * 0.75)];
    const busy = active.filter((d) => d.trades > p75);
    const calm = active.filter((d) => d.trades <= p75);
    if (busy.length >= 3 && calm.length >= 3) {
      const avgBusy = busy.reduce((s, d) => s + d.pnl, 0) / busy.length;
      const avgCalm = calm.reduce((s, d) => s + d.pnl, 0) / calm.length;
      if (avgBusy < avgCalm && avgBusy < 0) {
        out.push({
          tone: 'bad',
          title: 'Overtrading days lose money',
          text: `Days with more than ${p75} trades averaged ${m(avgBusy)}; other days ${m(avgCalm)}. A daily trade limit of ${p75} could help.`,
        });
      }
    }
  }

  // Best / worst hour and weekday
  const byHour = groupBy(closed, pnl, (t) => {
    const h = marketParts(t.openTime).hour;
    return { label: `${String(h).padStart(2, '0')}:00`, sort: h };
  }).filter((b) => b.trades >= MIN);
  if (byHour.length >= 2) {
    const worst = byHour.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    const best = byHour.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    if (worst.pnl < 0) out.push({ tone: 'bad', title: `Worst hour: ${worst.label} ET`, text: `${worst.trades} trades opened in this hour lost ${m(worst.pnl)} in total (win rate ${pct(worst.wins / worst.trades, 0)}).` });
    if (best.pnl > 0) out.push({ tone: 'good', title: `Best hour: ${best.label} ET`, text: `${best.trades} trades opened in this hour made ${m(best.pnl)} (win rate ${pct(best.wins / best.trades, 0)}).` });
  }
  const byDay = groupBy(closed, pnl, (t) => {
    const w = marketParts(t.openTime).weekday;
    return { label: WEEKDAY_NAMES[w], sort: w };
  }).filter((b) => b.trades >= MIN);
  if (byDay.length >= 2) {
    const worst = byDay.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    if (worst.pnl < 0) out.push({ tone: 'bad', title: `Worst weekday: ${worst.label}`, text: `${worst.trades} trades, ${m(worst.pnl)} in total.` });
  }

  // Long vs short
  const longs = closed.filter((t) => t.direction === 'LONG'), shorts = closed.filter((t) => t.direction === 'SHORT');
  if (longs.length >= MIN && shorts.length >= MIN) {
    const lp = longs.reduce((s, t) => s + pnl(t), 0), sp = shorts.reduce((s, t) => s + pnl(t), 0);
    if ((lp < 0) !== (sp < 0)) {
      const [good, bad] = lp > sp ? ['Long', 'Short'] : ['Short', 'Long'];
      out.push({ tone: 'info', title: `${good} side works, ${bad.toLowerCase()} doesn't`, text: `Longs: ${m(lp)} over ${longs.length} trades. Shorts: ${m(sp)} over ${shorts.length} trades.` });
    }
  }

  // Hold-time sweet spot
  const byHold = groupBy(closed, pnl, (t) => holdBucket(t.holdSeconds)).filter((b) => b.trades >= MIN);
  if (byHold.length >= 2) {
    const best = byHold.reduce((a, b) => (b.pnl / b.trades > a.pnl / a.trades ? b : a));
    if (best.pnl > 0) out.push({ tone: 'good', title: `Best holding time: ${best.label}`, text: `${best.trades} trades averaged ${m(best.pnl / best.trades)} each.` });
  }

  // Commission drag
  if (stats.grossProfit > 0 && -stats.commissions > 0.15 * stats.grossProfit) {
    out.push({ tone: 'bad', title: 'Commissions are a big drag', text: `You paid ${money(-stats.commissions, ccy)} in commissions, ${pct(-stats.commissions / stats.grossProfit, 0)} of your winning trades' profit.` });
  }

  // Cost of tagged mistakes
  const mistakeCost = new Map<string, { n: number; pnl: number }>();
  for (const t of closed) {
    for (const mk of notes.get(t.key)?.mistakes ?? []) {
      const v = mistakeCost.get(mk) ?? { n: 0, pnl: 0 };
      v.n++; v.pnl += pnl(t);
      mistakeCost.set(mk, v);
    }
  }
  const worstMistake = [...mistakeCost.entries()].sort((a, b) => a[1].pnl - b[1].pnl)[0];
  if (worstMistake && worstMistake[1].pnl < 0) {
    out.push({ tone: 'bad', title: `Costliest mistake: ${worstMistake[0]}`, text: `${worstMistake[1].n} trades tagged with it lost ${m(worstMistake[1].pnl)}.` });
  }

  const order = { bad: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
