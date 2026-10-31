'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const fmt = (v: number, ccy: string, compact = false) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(v);
const sign = (v: number, ccy: string, compact = false) => (v > 0 ? '+' : '') + fmt(v, ccy, compact);
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** Smooth monotone-ish path through points (Catmull-Rom → Bézier, clamped). */
function smooth(pts: [number, number][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Tracks the element's real pixel width so SVG text is never stretched. */
function useWidth(fallback = 800) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Cumulative P&L: green above zero, red below, with crosshair tooltip. */
export function EquityChart({ points, ccy, height = 240 }: { points: { date: string; value: number }[]; ccy: string; height?: number }) {
  const id = useId().replace(/:/g, '');
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, PL = 52, PR = 8, PT = 10, PB = 24;

  const geo = useMemo(() => {
    const vals = points.map((p) => p.value);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const pad = (hi - lo) * 0.08 || 1;
    const min = lo - (lo < 0 ? pad : 0), max = hi + pad;
    const x = (i: number) => PL + (i / Math.max(1, points.length - 1)) * (W - PL - PR);
    const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);
    const pts = points.map((p, i) => [x(i), y(p.value)] as [number, number]);
    return { x, y, pts, ticks: niceTicks(min, max), zero: y(0), line: smooth(pts) };
  }, [points, H, W]);

  if (points.length < 2) return <div className="muted small" style={{ height, display: 'grid', placeItems: 'center' }}>Not enough data yet</div>;

  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((sx - PL) / (W - PL - PR)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const area = `${geo.line}L${geo.pts[geo.pts.length - 1][0]},${geo.zero}L${geo.pts[0][0]},${geo.zero}Z`;
  const h = hover != null ? points[hover] : null;
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div ref={box} style={{ position: 'relative', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Equity curve">
        <defs>
          <linearGradient id={`up${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--pos)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--pos)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`dn${id}`} x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor="var(--neg)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--neg)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`a${id}`}><rect x="0" y="0" width={W} height={geo.zero} /></clipPath>
          <clipPath id={`b${id}`}><rect x="0" y={geo.zero} width={W} height={H} /></clipPath>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? '' : '3 5'} vectorEffect="non-scaling-stroke" />
            <text x={PL - 8} y={geo.y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">{fmt(t, ccy, true)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#up${id})`} clipPath={`url(#a${id})`} />
        <path d={area} fill={`url(#dn${id})`} clipPath={`url(#b${id})`} />
        <path d={geo.line} fill="none" stroke="var(--pos)" strokeWidth="2.2" clipPath={`url(#a${id})`} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={geo.line} fill="none" stroke="var(--neg)" strokeWidth="2.2" clipPath={`url(#b${id})`} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {labelIdx.map((i, k) => (
          <text key={i} x={geo.pts[i][0]} y={H - 6} fontSize="11" fill="var(--faint)" textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{shortDate(points[i].date)}</text>
        ))}
        {h && hover != null && (
          <g>
            <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={PT} y2={H - PB} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r="4.5" fill={h.value >= 0 ? 'var(--pos)' : 'var(--neg)'} stroke="var(--bg)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div className="tip" style={{ left: `${(geo.pts[hover][0] / W) * 100}%`, top: `${(geo.pts[hover][1] / H) * 100}%` }}>
          <span className="muted">{shortDate(h.date)}</span>
          <b className={h.value >= 0 ? 'pos' : 'neg'}>{sign(h.value, ccy)}</b>
        </div>
      )}
    </div>
  );
}

/** Daily P&L bars with tooltip. */
export function DailyBars({ data, ccy, height = 170 }: { data: { date: string; value: number }[]; ccy: string; height?: number }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;
  const H = height, PB = 20;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasNeg = data.some((d) => d.value < 0), hasPos = data.some((d) => d.value > 0);
  const zero = hasNeg && hasPos ? (H - PB) * (Math.max(...data.map((d) => d.value), 0) / (Math.max(...data.map((d) => d.value), 0) - Math.min(...data.map((d) => d.value), 0))) : hasNeg ? 2 : H - PB - 2;
  const scale = (hasNeg && hasPos ? H - PB - 4 : H - PB - 6) / (hasNeg && hasPos ? Math.max(...data.map((d) => d.value)) - Math.min(...data.map((d) => d.value)) : max);
  const bw = W / data.length;
  const h = hover != null ? data[hover] : null;
  return (
    <div ref={box} style={{ position: 'relative', touchAction: 'pan-y' }} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Daily P&L">
        <line x1="0" x2={W} y1={zero} y2={zero} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const bh = Math.max(2, Math.abs(d.value) * scale);
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={i * bw} width={bw} y={0} height={H} fill="transparent" />
              <rect x={i * bw + bw * 0.18} width={bw * 0.64} y={d.value >= 0 ? zero - bh : zero} height={bh} rx={Math.min(4, bw * 0.25)}
                fill={d.value >= 0 ? 'var(--pos)' : 'var(--neg)'} opacity={hover == null || hover === i ? 0.95 : 0.35} />
            </g>
          );
        })}
        <text x="2" y={H - 4} fontSize="11" fill="var(--faint)">{shortDate(data[0].date)}</text>
        <text x={W - 2} y={H - 4} fontSize="11" fill="var(--faint)" textAnchor="end">{shortDate(data[data.length - 1].date)}</text>
      </svg>
      {h && hover != null && (
        <div className="tip" style={{ left: `${((hover + 0.5) * bw / W) * 100}%`, top: `${((h.value >= 0 ? zero - Math.abs(h.value) * scale : zero) / H) * 100}%` }}>
          <span className="muted">{shortDate(h.date)}</span>
          <b className={h.value >= 0 ? 'pos' : 'neg'}>{sign(h.value, ccy)}</b>
        </div>
      )}
    </div>
  );
}
