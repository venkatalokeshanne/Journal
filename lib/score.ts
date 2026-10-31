import type { Stats, DayPnl } from './engine';

const lerp = (v: number, lo: number, hi: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

export interface ScorePart { label: string; score: number; detail: string }

/** A 0–100 "trader score" from six edge metrics (inspired by TradeZella's Zella score). */
export function traderScore(s: Stats, days: DayPnl[], maxDD: number): { total: number; parts: ScorePart[] } {
  const active = days.filter((d) => Math.abs(d.pnl) > 0.004);
  const green = active.length ? active.filter((d) => d.pnl > 0).length / active.length : 0;
  const ddRatio = s.grossProfit > 0 ? Math.abs(maxDD) / s.grossProfit : 1;
  const recovery = maxDD < 0 ? s.net / Math.abs(maxDD) : s.net > 0 ? 3 : 0;
  const parts: ScorePart[] = [
    { label: 'Win rate', score: lerp(s.winRate, 0.3, 0.7), detail: `${(s.winRate * 100).toFixed(0)}%` },
    { label: 'Profit factor', score: lerp(s.profitFactor ?? (s.grossProfit > 0 ? 3 : 0), 0.5, 2.5), detail: s.profitFactor ? s.profitFactor.toFixed(2) : '—' },
    { label: 'Avg win / loss', score: lerp(s.winLossRatio ?? 0, 0.5, 2.5), detail: s.winLossRatio ? s.winLossRatio.toFixed(2) : '—' },
    { label: 'Green days', score: lerp(green, 0.3, 0.7), detail: `${(green * 100).toFixed(0)}%` },
    { label: 'Drawdown control', score: lerp(1 - ddRatio, 0, 0.9), detail: `${(ddRatio * 100).toFixed(0)}% of profits` },
    { label: 'Recovery factor', score: lerp(recovery, 0, 3), detail: recovery.toFixed(2) },
  ];
  return { total: parts.reduce((a, p) => a + p.score, 0) / parts.length, parts };
}
