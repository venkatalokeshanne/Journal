import { money } from '@/lib/format';

/** Cumulative P&L area chart (pure SVG, scales to any width). */
export function EquityCurve({ points, ccy, height = 200 }: { points: { date: string; value: number }[]; ccy: string; height?: number }) {
  if (points.length < 2) return <div className="muted small" style={{ height, display: 'grid', placeItems: 'center' }}>Not enough data yet</div>;
  const W = 600, H = height, P = 6;
  const vals = points.map((p) => p.value);
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - 2 * P);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const zero = y(0);
  const last = vals[vals.length - 1];
  const color = last >= 0 ? 'var(--pos)' : 'var(--neg)';
  const id = `eq${Math.round(Math.abs(last * 100)) % 9973}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Cumulative P&L">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P} x2={W - P} y1={zero} y2={zero} stroke="var(--line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={`${line}L${x(points.length - 1)},${zero}L${x(0)},${zero}Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="row between small faint num" style={{ marginTop: 6 }}>
        <span>{points[0].date}</span>
        <span>min {money(min, ccy, { compact: true })} · max {money(max, ccy, { compact: true })}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

/** Vertical bars around zero (e.g. daily P&L). */
export function PnlBars({ data, height = 140 }: { data: { label: string; value: number }[]; height?: number }) {
  if (!data.length) return null;
  const W = 600, H = height;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasNeg = data.some((d) => d.value < 0), hasPos = data.some((d) => d.value > 0);
  const zero = hasNeg && hasPos ? H / 2 : hasNeg ? 4 : H - 4;
  const scale = (hasNeg && hasPos ? H / 2 - 4 : H - 8) / max;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="P&L by day">
      <line x1="0" x2={W} y1={zero} y2={zero} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      {data.map((d, i) => {
        const h = Math.max(1, Math.abs(d.value) * scale);
        return (
          <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={d.value >= 0 ? zero - h : zero} height={h} rx={Math.min(3, bw * 0.2)}
            fill={d.value >= 0 ? 'var(--pos)' : 'var(--neg)'}>
            <title>{`${d.label}: ${d.value.toFixed(2)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Horizontal bars for breakdown tables (by hour, weekday, symbol, ...). */
export function HBars({ rows, ccy }: { rows: { label: string; value: number; sub?: string }[]; ccy: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const hasNeg = rows.some((r) => r.value < 0);
  const zeroPct = hasNeg ? 50 : 0;
  return (
    <div>
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * (hasNeg ? 50 : 100);
        const left = r.value >= 0 ? zeroPct : zeroPct - w;
        return (
          <div className="hbar" key={r.label}>
            <div className="lbl" title={r.label}>{r.label}</div>
            <div className="track">
              {hasNeg && <div className="zero" style={{ left: '50%' }} />}
              <div className="fill" style={{ left: `${left}%`, width: `${w}%`, background: r.value >= 0 ? 'var(--pos)' : 'var(--neg)', opacity: 0.85 }} />
            </div>
            <div className={`val num ${r.value >= 0 ? 'pos' : 'neg'}`}>
              {money(r.value, ccy, { sign: true, compact: Math.abs(r.value) >= 10000 })}
              {r.sub && <div className="small faint">{r.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Semi-circle gauge, 0–100. */
export function Gauge({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 52, c = Math.PI * r;
  const color = v >= 65 ? 'var(--pos)' : v >= 40 ? 'var(--warn)' : 'var(--neg)';
  return (
    <svg viewBox="0 0 130 78" width="100%" style={{ maxWidth: 220 }} role="img" aria-label={`${label} ${Math.round(v)} of 100`}>
      <path d="M13 68 A52 52 0 0 1 117 68" fill="none" stroke="var(--panel-2)" strokeWidth="11" strokeLinecap="round" />
      <path d="M13 68 A52 52 0 0 1 117 68" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} />
      <text x="65" y="60" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">{Math.round(v)}</text>
      <text x="65" y="75" textAnchor="middle" fontSize="9" fill="var(--muted)">{label}</text>
    </svg>
  );
}

/** Small area sparkline for the hero card. */
export function Spark({ values, height = 84 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const W = 400, H = height;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, 4 + (1 - (v - min) / span) * (H - 8)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const up = values[values.length - 1] >= values[0];
  const c = up ? 'var(--pos)' : 'var(--neg)';
  const id = `sp${up ? 'u' : 'd'}${values.length}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Semicircle gauge (0..1) used inside KPI cards. */
export function SemiGauge({ value, color, size = 74, children }: { value: number; color?: string; size?: number; children?: React.ReactNode }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 30, c = Math.PI * r;
  const col = color ?? (v >= 0.6 ? 'var(--pos)' : v >= 0.4 ? 'var(--warn)' : 'var(--neg)');
  return (
    <svg viewBox="0 0 74 44" width={size} height={(size * 44) / 74} aria-hidden>
      <path d="M7 38 A30 30 0 0 1 67 38" fill="none" stroke="var(--surface-3)" strokeWidth="7" strokeLinecap="round" />
      <path d="M7 38 A30 30 0 0 1 67 38" fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />
      {children}
    </svg>
  );
}

/** Radar chart for the trader score (values 0..100). */
export function Radar({ parts, size = 230 }: { parts: { label: string; score: number }[]; size?: number }) {
  const n = parts.length, cx = 120, cy = 112, R = 76;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const ring = (f: number) => parts.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const shape = parts.map((p, i) => pt(i, (R * Math.max(4, p.score)) / 100).map((v) => v.toFixed(1)).join(',')).join(' ');
  return (
    <svg viewBox="-40 0 320 228" width="100%" style={{ maxWidth: size + 60 }} role="img" aria-label="Trader score breakdown">
      <defs>
        <linearGradient id="radarFill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8d7dff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2dd4ef" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="var(--line-strong)" strokeWidth="1" />)}
      {parts.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />; })}
      <polygon points={shape} fill="url(#radarFill)" stroke="#8d7dff" strokeWidth="1.8" strokeLinejoin="round" />
      {parts.map((p, i) => { const [x, y] = pt(i, (R * Math.max(4, p.score)) / 100); return <circle key={i} cx={x} cy={y} r="3.2" fill="#fff" stroke="#8d7dff" strokeWidth="1.5" />; })}
      {parts.map((p, i) => {
        const [x, y] = pt(i, R + 20);
        return (
          <text key={p.label} x={x} y={y} textAnchor={Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'} fontSize="10" fill="var(--muted)">
            {p.label}<tspan x={x} dy="12" fill="var(--faint)">{Math.round(p.score)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
