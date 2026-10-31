import { LoginForm } from '@/components/forms';
import { MarketStatus } from '@/components/MarketStatus';

export const metadata = { title: 'Sign in · Trade Journal' };

/** Decorative equity curve for the brand panel (illustration only, not your data). */
function HeroChart() {
  const pts = [8, 14, 11, 20, 18, 27, 24, 33, 30, 41, 37, 49, 45, 58, 54, 66, 62, 74, 71, 84];
  const W = 420, H = 170;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (W - 12), H - 10 - (v / 90) * (H - 20)]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="lgLine" x1="0" x2="1">
          <stop offset="0%" stopColor="#8d7dff" />
          <stop offset="100%" stopColor="#2dd4ef" />
        </linearGradient>
        <linearGradient id="lgFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8d7dff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2dd4ef" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="3 6" />)}
      <path d={`${line}L${xy[xy.length - 1][0]},${H}L0,${H}Z`} fill="url(#lgFill)" />
      <path d={line} fill="none" stroke="url(#lgLine)" strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="5" fill="#2dd4ef" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}

const FEATURES = [
  { t: 'Synced with IBKR', d: 'Flex Web Service, every fill' },
  { t: 'Matches your broker', d: 'P&L and fees to the cent' },
  { t: 'Learn from patterns', d: 'Calendar, reports, insights' },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <main className="login">
      <section className="login-brand">
        <div className="row between">
          <div className="brand"><span className="brand-dot" />Trade Journal</div>
          <span className="hide-sm"><MarketStatus /></span>
        </div>
        <div className="login-copy">
          <h1>Your trading,<br /><span className="grad-text">measured.</span></h1>
          <p>Every Interactive Brokers trade, matched to the cent. Review your day, spot your patterns, trade better.</p>
        </div>
        <div className="login-visual">
          <div className="login-chart"><HeroChart /></div>
          <div className="float-chip a"><span className="dot pos" />Equity curve</div>
          <div className="float-chip b"><span className="dot accent" />Win rate · Profit factor</div>
        </div>
        <ul className="login-features">
          {FEATURES.map((f) => (
            <li key={f.t}><span className="tick">✓</span><div><b>{f.t}</b><span>{f.d}</span></div></li>
          ))}
        </ul>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <h2>Welcome back</h2>
            <p>Sign in to your journal</p>
          </div>
          {denied && <div className="toast err">This account isn’t allowed to use this journal.</div>}
          <LoginForm />
          <p className="login-foot">🔒 Private journal · only approved accounts can sign in</p>
        </div>
      </section>
    </main>
  );
}
