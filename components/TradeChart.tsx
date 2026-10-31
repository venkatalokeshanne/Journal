'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, type UTCTimestamp, type SeriesMarker, type Time } from 'lightweight-charts';
import { zonedParts, MARKET_TZ } from '@/lib/time';

interface Leg { time: string; quantity: number; price: number; role: 'open' | 'close' }

/** Shift a UTC timestamp so the chart (which renders UTC) shows New York wall-clock time. */
function toEt(sec: number): number {
  const p = zonedParts(sec * 1000, MARKET_TZ);
  const [y, m, d] = p.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, p.hour, p.minute, p.second) / 1000;
}

export function TradeChart({ symbol, from, to, legs, stop, target, levels = [] }: { symbol: string; from: string; to: string; legs: Leg[]; stop?: number | null; target?: number | null; levels?: { price: number; label: string; color: string }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const legsKey = JSON.stringify(legs) + JSON.stringify(levels);
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; msg?: string; interval?: string }>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;
    let chart: ReturnType<typeof createChart> | null = null;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();

    fetch(`/api/chart?${new URLSearchParams({ symbol, from, to })}`)
      .then((r) => r.json())
      .then((data) => {
        if (disposed || !box.current) return;
        if (!data.candles?.length) { setState({ status: 'error', msg: data.error ?? 'No price data for this period' }); return; }
        const daily = data.interval === '1d';
        chart = createChart(box.current, {
          autoSize: true,
          layout: { background: { color: 'transparent' }, textColor: v('--muted'), fontSize: 11 },
          grid: { vertLines: { color: v('--line') }, horzLines: { color: v('--line') } },
          rightPriceScale: { borderColor: v('--line') },
          timeScale: { borderColor: v('--line'), timeVisible: !daily, secondsVisible: false },
          crosshair: { mode: CrosshairMode.Normal },
        });
        const series = chart.addCandlestickSeries({
          upColor: v('--pos'), downColor: v('--neg'), borderVisible: false, wickUpColor: v('--pos'), wickDownColor: v('--neg'),
        });
        const candles = (data.candles as { time: number; open: number; high: number; low: number; close: number }[])
          .map((c) => ({ ...c, time: toEt(c.time) as UTCTimestamp }));
        series.setData(candles);

        const times = candles.map((c) => c.time as number);
        const snap = (iso: string) => {
          const t = toEt(Math.floor(Date.parse(iso) / 1000));
          let lo = 0, hi = times.length - 1, best = times[0];
          while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] <= t) { best = times[mid]; lo = mid + 1; } else hi = mid - 1; }
          return best;
        };
        const markers: SeriesMarker<Time>[] = legs
          .map((l) => ({
            time: snap(l.time) as UTCTimestamp,
            position: l.quantity > 0 ? ('belowBar' as const) : ('aboveBar' as const),
            color: l.quantity > 0 ? v('--pos') : v('--neg'),
            shape: l.quantity > 0 ? ('arrowUp' as const) : ('arrowDown' as const),
            text: `${l.quantity > 0 ? 'B' : 'S'} ${Math.abs(l.quantity)} @ ${l.price}`,
          }))
          .sort((a, b) => (a.time as number) - (b.time as number));
        series.setMarkers(markers);

        const avg = (ls: Leg[]) => { const q = ls.reduce((s, l) => s + Math.abs(l.quantity), 0); return q ? ls.reduce((s, l) => s + Math.abs(l.quantity) * l.price, 0) / q : null; };
        const entry = avg(legs.filter((l) => l.role === 'open'));
        if (entry) series.createPriceLine({ price: entry, color: v('--accent'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'entry' });
        if (stop) series.createPriceLine({ price: stop, color: v('--neg'), lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'stop' });
        if (target) series.createPriceLine({ price: target, color: v('--pos'), lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'target' });
        for (const l of levels) {
          const color = l.color.startsWith('var(') ? v(l.color.slice(4, -1)) : l.color;
          series.createPriceLine({ price: l.price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `plan ${l.label}` });
        }

        // zoom around the trade
        const first = snap(from), last = snap(to);
        const i0 = Math.max(0, times.indexOf(first) - 30), i1 = Math.min(times.length - 1, times.indexOf(last) + 30);
        chart.timeScale().setVisibleRange({ from: times[i0] as UTCTimestamp, to: times[i1] as UTCTimestamp });
        setState({ status: 'ok', interval: data.interval });
      })
      .catch(() => !disposed && setState({ status: 'error', msg: 'Could not load price data' }));

    return () => { disposed = true; chart?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, from, to, legsKey, stop, target]);

  return (
    <div>
      <div ref={box} className="chart-box" style={{ display: state.status === 'error' ? 'none' : 'block' }} />
      {state.status === 'loading' && <p className="small muted">Loading chart…</p>}
      {state.status === 'error' && <p className="small muted">{state.msg}</p>}
      {state.status === 'ok' && <p className="small faint" style={{ marginTop: 6 }}>{state.interval} bars · New York time · Yahoo Finance data</p>}
    </div>
  );
}
