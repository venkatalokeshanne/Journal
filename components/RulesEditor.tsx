'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { saveRulesAction } from '@/app/actions';
import { ruleText, WEEKDAYS, type RuleHistory, type RuleId, type RulesConfig } from '@/lib/rules';

const fmt = (v: number, ccy: string, sign = true) =>
  (sign && v > 0 ? '+' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 10000 ? 1 : 0 }).format(v);

const WHY: Record<RuleId, string> = {
  no_avg_down: 'Adding to a loser turns a small mistake into a big one.',
  max_loss: 'Your average loss is much bigger than your average win; a hard cap fixes that.',
  max_trades: 'Your P&L per day drops as the number of trades goes up.',
  window: 'Your edge is concentrated in certain hours.',
  after_losses: 'After a losing streak your win rate drops (tilt).',
  max_size: 'Your biggest positions lose the most.',
  weekday: 'One weekday is much worse than the others.',
  blacklist: 'These tickers have consistently lost you money.',
  plan_only: 'Trades you didn’t plan are impulse trades.',
};

function Num({ value, onChange, prefix, step = 1 }: { value: number; onChange: (v: number) => void; prefix?: string; step?: number }) {
  const [t, setT] = useState(String(value));
  useEffect(() => { if (Number(t) !== value) setT(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="num-input" style={{ width: 130 }}>
      {prefix && <span className="prefix">{prefix}</span>}
      <input inputMode="decimal" value={t} step={step} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setT(v); if (v && Number(v) > 0) onChange(Number(v)); }} />
    </div>
  );
}

function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="stepper" style={{ width: 140 }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b className="num">{value}</b>
      <button type="button" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Tickers({ value, onChange, tone }: { value: string[]; onChange: (v: string[]) => void; tone: 'neg' | 'pos' }) {
  const [t, setT] = useState('');
  const add = () => { const s = t.trim().toUpperCase(); if (s && !value.includes(s)) onChange([...value, s]); setT(''); };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pill-input">
        {value.map((s) => (
          <button key={s} type="button" className={`pill ${tone}`} onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove ${s}`}>{s} ✕</button>
        ))}
      </div>
      <div className="add-row" style={{ marginTop: 0 }}>
        <input value={t} onChange={(e) => setT(e.target.value.toUpperCase())} placeholder="Add ticker" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn sm" onClick={add} disabled={!t.trim()}>Add</button>
      </div>
    </div>
  );
}

export function RulesEditor({ initial, suggested, history, ccy, tradeCcy, symbolPnl }: {
  initial: RulesConfig; suggested: boolean; history: RuleHistory[]; ccy: string; tradeCcy: string; symbolPnl: Record<string, number>;
}) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(suggested ? 'idle' : 'saved');
  const first = useRef(true);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus('saving');
    const t = setTimeout(async () => {
      try { const r = await saveRulesAction(c); setStatus(r.ok ? 'saved' : 'error'); router.refresh(); } catch { setStatus('error'); }
    }, 700);
    return () => clearTimeout(t);
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  const up = (patch: Partial<RulesConfig>) => setC((x) => ({ ...x, ...patch }));
  const toggle = (id: RuleId) => up({ disabled: c.disabled.includes(id) ? c.disabled.filter((x) => x !== id) : [...c.disabled, id] });
  const cur = tradeCcy === 'USD' ? '$' : tradeCcy;

  const editor: Record<RuleId, ReactNode> = {
    no_avg_down: null,
    plan_only: <p className="small faint" style={{ margin: 0 }}>Checked only on days you wrote a plan with tickers.</p>,
    max_loss: <div className="row wrap"><span className="small muted">Max loss per trade</span><Num value={c.maxLoss} prefix={cur} onChange={(v) => up({ maxLoss: v })} /></div>,
    max_trades: <div className="row wrap"><span className="small muted">Trades per day</span><Stepper value={c.maxTrades} onChange={(v) => up({ maxTrades: v })} /></div>,
    window: (
      <div className="row wrap">
        <span className="small muted">From</span><input type="time" value={c.windowStart} onChange={(e) => e.target.value && up({ windowStart: e.target.value })} style={{ width: 120 }} />
        <span className="small muted">to</span><input type="time" value={c.windowEnd} onChange={(e) => e.target.value && up({ windowEnd: e.target.value })} style={{ width: 120 }} />
        <span className="small faint">New York time</span>
      </div>
    ),
    after_losses: <div className="row wrap"><span className="small muted">Losses in a row</span><Stepper value={c.afterLosses} onChange={(v) => up({ afterLosses: v })} /></div>,
    max_size: <div className="row wrap"><span className="small muted">Max position (notional)</span><Num value={c.maxSize} prefix={cur} onChange={(v) => up({ maxSize: v })} /></div>,
    weekday: (
      <div className="row wrap">
        <select value={c.weekday ?? ''} onChange={(e) => up({ weekday: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 150 }}>
          <option value="">Off</option>
          {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
        </select>
        <span className="small muted">max trades</span><Stepper value={c.weekdayMax} min={0} onChange={(v) => up({ weekdayMax: v })} />
      </div>
    ),
    blacklist: (
      <div className="stack" style={{ gap: 6 }}>
        <Tickers value={c.blacklist} tone="neg" onChange={(v) => up({ blacklist: v })} />
        {c.blacklist.length > 0 && <p className="small faint" style={{ margin: 0 }}>{c.blacklist.map((s) => `${s} ${fmt(symbolPnl[s] ?? 0, ccy)}`).join(' · ')}</p>}
      </div>
    ),
  };

  const ordered = [...history].sort((a, b) => a.brokenPnl - b.brokenPnl);
  const statusLabel = { idle: 'Suggested from your trades', saving: 'Saving…', saved: '✓ Saved', error: 'Not saved' }[status];

  return (
    <div className="stack">
      <div className="row between wrap">
        <span className={`pill ${status === 'saved' ? 'pos' : status === 'error' ? 'neg' : ''}`}>{statusLabel}</span>
        {suggested && status === 'idle' && <button type="button" className="btn primary sm" onClick={() => saveRulesAction(c).then(() => { setStatus('saved'); router.refresh(); })}>Use these rules</button>}
      </div>

      <div className="rules-grid">
        {ordered.map((h) => {
          const off = c.disabled.includes(h.id);
          const t = ruleText(h.id, c, tradeCcy);
          return (
            <article key={h.id} className={`rule-card ${off ? 'off' : ''}`}>
              <header className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <h2 style={{ fontSize: 16.5 }}>{t.title}</h2>
                  <p className="small muted" style={{ margin: '4px 0 0' }}>{WHY[h.id]}</p>
                </div>
                <button type="button" className={`switch ${off ? '' : 'on'}`} onClick={() => toggle(h.id)} aria-pressed={!off} aria-label={off ? 'Turn rule on' : 'Turn rule off'}><i /></button>
              </header>
              {!off && editor[h.id]}
              {h.daysTraded > 0 ? (
                <>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="mini-stat"><span>{h.id === 'max_loss' ? 'Lost beyond the cap' : 'When broken'}</span><b>{h.brokenTrades} trades</b><em className={h.brokenPnl < 0 ? 'neg' : 'pos'}>{fmt(h.brokenPnl, ccy)}</em></div>
                    <div className="mini-stat"><span>When kept</span><b>{h.keptTrades} trades</b><em className={h.keptPnl < 0 ? 'neg' : 'pos'}>{fmt(h.keptPnl, ccy)}</em></div>
                  </div>
                  {h.id === 'max_loss' && <p className="small faint" style={{ margin: 0 }}>“Lost beyond the cap” is what a stop at your limit would have saved, assuming it filled at the limit (fast moves can gap past a stop).</p>}
                  <div className="row between small">
                    <span className="muted">Broken on {h.daysBroken} of {h.daysTraded} days</span>
                    <span className="dots" aria-label="Last 10 trading days">{h.recent.map((r) => <i key={r.day} title={`${r.day}: ${r.status}`} className={r.status} />)}</span>
                  </div>
                </>
              ) : <p className="small faint" style={{ margin: 0 }}>No history for this rule yet.</p>}
            </article>
          );
        })}

        <article className="rule-card">
          <h2 style={{ fontSize: 16.5 }}>Your own rules</h2>
          <p className="small muted" style={{ margin: 0 }}>Reminders that can’t be checked automatically, e.g. “No trading the first 30 minutes after big news”.</p>
          <div className="stack" style={{ gap: 6 }}>
            {c.custom.map((r) => (
              <div key={r.id} className="check">
                <span className="txt">{r.text}</span>
                <button type="button" className="x" onClick={() => up({ custom: c.custom.filter((x) => x.id !== r.id) })} aria-label="Remove">×</button>
              </div>
            ))}
          </div>
          <div className="add-row">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add a rule"
              onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { e.preventDefault(); up({ custom: [...c.custom, { id: Math.random().toString(36).slice(2, 10), text: custom.trim() }] }); setCustom(''); } }} />
            <button type="button" className="btn sm" disabled={!custom.trim()} onClick={() => { up({ custom: [...c.custom, { id: Math.random().toString(36).slice(2, 10), text: custom.trim() }] }); setCustom(''); }}>Add</button>
          </div>
        </article>

        <article className="rule-card">
          <h2 style={{ fontSize: 16.5 }}>Your best tickers</h2>
          <p className="small muted" style={{ margin: 0 }}>Shown in your plan as a focus list. Not a rule, just where your edge is.</p>
          <Tickers value={c.focus} tone="pos" onChange={(v) => up({ focus: v })} />
          {c.focus.length > 0 && <p className="small faint" style={{ margin: 0 }}>{c.focus.map((s) => `${s} ${fmt(symbolPnl[s] ?? 0, ccy)}`).join(' · ')}</p>}
        </article>
      </div>
    </div>
  );
}
