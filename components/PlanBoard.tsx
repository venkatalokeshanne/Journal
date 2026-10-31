'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { savePlanAction, savePlanDefaultsAction } from '@/app/actions';
import { AiPanel } from './AiPanel';
import {
  LEVEL_KINDS, newCheck, planVsReality, riskReward, uid,
  type CheckItem, type DayPlan, type DayReality, type LevelKind, type PlanDefaults, type PlanTicker,
} from '@/lib/plan';

type SetupLite = { id: number; name: string; rules: string };

const fmtMoney = (v: number, ccy: string, sign = false) =>
  (sign && v > 0 ? '+' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(v);
const fmtPrice = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 });
const dayTitle = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const shift = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

// ---------------- small inputs ----------------
function NumInput({ value, onChange, placeholder, prefix }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; prefix?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { if ((value == null ? '' : String(value)) !== text && Number(text) !== value) setText(value == null ? '' : String(value)); /* external change */ }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="num-input">
      {prefix && <span className="prefix">{prefix}</span>}
      <input inputMode="decimal" value={text} placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
          setText(t);
          onChange(t === '' || t === '.' ? null : Number(t));
        }} />
    </div>
  );
}

function Checklist({ items, onChange, addLabel = 'Add item' }: { items: CheckItem[]; onChange: (v: CheckItem[]) => void; addLabel?: string }) {
  const [text, setText] = useState('');
  const done = items.filter((i) => i.done).length;
  const add = () => { const t = text.trim(); if (t) onChange([...items, newCheck(t)]); setText(''); };
  return (
    <div className="checklist">
      {items.length > 0 && (
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <div className="meter grow"><i style={{ width: `${(done / items.length) * 100}%`, background: done === items.length ? 'var(--pos)' : 'var(--grad)' }} /></div>
          <span className="small muted num">{done}/{items.length}</span>
        </div>
      )}
      {items.map((it) => (
        <div key={it.id} className={`check ${it.done ? 'done' : ''}`}>
          <button type="button" className="box" aria-pressed={it.done} aria-label={it.done ? 'Uncheck' : 'Check'}
            onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}>
            {it.done && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </button>
          <span className="txt" onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}>{it.text}</span>
          <button type="button" className="x" aria-label="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id))}>×</button>
        </div>
      ))}
      <div className="add-row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={addLabel}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn sm" onClick={add} disabled={!text.trim()}>Add</button>
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T | null; options: { v: T; label: string; tone?: string }[]; onChange: (v: T | null) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} style={value === o.v && o.tone ? { background: o.tone, color: '#fff' } : undefined}
          onClick={() => onChange(value === o.v ? null : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

// ---------------- ticker card ----------------
function TickerCard({ t, setups, reality, ccy, day, onChange, onRemove }: {
  t: PlanTicker; setups: SetupLite[]; reality?: { n: number; pnl: number }; ccy: string; day: string;
  onChange: (t: PlanTicker) => void; onRemove: () => void;
}) {
  const [edit, setEdit] = useState(t.levels.length === 0);
  const rr = riskReward(t);
  const ladder = [...t.levels].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
  const setLevel = (id: string, patch: Partial<PlanTicker['levels'][0]>) => onChange({ ...t, levels: t.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addLevel = (kind: LevelKind) => onChange({ ...t, levels: [...t.levels, { id: uid(), kind, price: null, label: '' }] });
  const pickSetup = (id: number | null) => {
    const s = setups.find((x) => x.id === id);
    const have = new Set(t.checklist.map((c) => c.text.toLowerCase()));
    const rules = (s?.rules ?? '').split('\n').map((r) => r.trim()).filter((r) => r && !have.has(r.toLowerCase()));
    onChange({ ...t, setupId: id, checklist: [...t.checklist, ...rules.map(newCheck)] });
  };
  const biasTone = t.bias === 'LONG' ? 'var(--pos)' : t.bias === 'SHORT' ? 'var(--neg)' : undefined;

  return (
    <article className="tcard" style={{ ['--h' as string]: hue(t.symbol) }}>
      <header className="tcard-head">
        <span className="avatar" style={{ ['--h' as string]: hue(t.symbol) }}>{t.symbol.replace(/[^A-Z0-9]/g, '').slice(0, 3)}</span>
        <div className="grow">
          <div className="sym">{t.symbol}</div>
          <div className="small muted">{setups.find((s) => s.id === t.setupId)?.name ?? (t.catalyst || 'No setup yet')}</div>
        </div>
        <Seg value={t.bias} onChange={(v) => onChange({ ...t, bias: v ?? 'WAIT' })}
          options={[{ v: 'LONG', label: 'Long', tone: 'var(--pos)' }, { v: 'SHORT', label: 'Short', tone: 'var(--neg)' }, { v: 'WAIT', label: 'Wait' }]} />
      </header>

      {rr && (
        <div className="rr-strip" style={{ borderColor: biasTone }}>
          <div><span>Entry</span><b>{fmtPrice(rr.entry)}</b></div>
          <div><span>Stop</span><b className="neg">{fmtPrice(rr.stop)}</b></div>
          <div><span>Target</span><b className="pos">{rr.target != null ? fmtPrice(rr.target) : '—'}</b></div>
          <div><span>R:R</span><b className={rr.rr != null && rr.rr >= 2 ? 'pos' : rr.rr != null && rr.rr < 1 ? 'neg' : ''}>{rr.rr != null ? `1:${rr.rr.toFixed(1)}` : '—'}</b></div>
        </div>
      )}

      {!edit && ladder.length > 0 && (
        <div className="ladder">
          {ladder.map((l) => {
            const k = LEVEL_KINDS.find((x) => x.kind === l.kind)!;
            return (
              <div key={l.id} className="lvl">
                <i style={{ background: k.color }} />
                <span className="k">{k.label}</span>
                <span className="lab">{l.label}</span>
                <b className="num">{l.price != null ? fmtPrice(l.price) : '—'}</b>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <div className="stack" style={{ gap: 10 }}>
          {t.levels.map((l) => (
            <div key={l.id} className="lvl-edit">
              <select value={l.kind} onChange={(e) => setLevel(l.id, { kind: e.target.value as LevelKind })}>
                {LEVEL_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <NumInput value={l.price} onChange={(v) => setLevel(l.id, { price: v })} placeholder="Price" />
              <input className="lvl-note" value={l.label} onChange={(e) => setLevel(l.id, { label: e.target.value })} placeholder="Note (e.g. PDH)" />
              <button type="button" className="btn icon sm" aria-label="Remove level" onClick={() => onChange({ ...t, levels: t.levels.filter((x) => x.id !== l.id) })}>×</button>
            </div>
          ))}
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {LEVEL_KINDS.map((k) => (
              <button key={k.kind} type="button" className="chip" onClick={() => addLevel(k.kind)}>
                <span style={{ width: 8, height: 8, borderRadius: 9, background: k.color, marginRight: 6 }} />{k.label}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <div className="field"><label>Setup</label>
              <select value={t.setupId ?? ''} onChange={(e) => pickSetup(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Catalyst</label><input value={t.catalyst} onChange={(e) => onChange({ ...t, catalyst: e.target.value })} placeholder="Earnings, news, gap…" /></div>
            <div className="field full"><label>Plan notes</label>
              <textarea value={t.notes} onChange={(e) => onChange({ ...t, notes: e.target.value })} style={{ minHeight: 70 }} placeholder="If it reclaims VWAP, long the first pullback…" /></div>
          </div>
        </div>
      )}

      {!edit && t.notes && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}

      <Checklist items={t.checklist} onChange={(c) => onChange({ ...t, checklist: c })} addLabel="Add a condition before entry" />

      <footer className="tcard-foot">
        {reality ? (
          <Link className={`pill ${reality.pnl > 0.004 ? 'pos' : reality.pnl < -0.004 ? 'neg' : ''}`} href={`/trades?q=${encodeURIComponent(t.symbol)}&day=${day}&status=all`}>
            Traded {reality.n}× · {fmtMoney(reality.pnl, ccy, true)}
          </Link>
        ) : <span className="pill">Not traded</span>}
        <div className="row" style={{ gap: 6 }}>
          {edit && <button type="button" className="btn sm danger" onClick={onRemove}>Remove</button>}
          <button type="button" className="btn sm" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</button>
        </div>
      </footer>
    </article>
  );
}

// ---------------- board ----------------
export function PlanBoard({ initial, isNew, defaults, previous, reality, setups, recentSymbols, ccy, tradeCcy, today, aiEnabled, aiCheck }: {
  initial: DayPlan; isNew: boolean; defaults: PlanDefaults; previous: DayPlan | null; reality: DayReality;
  setups: SetupLite[]; recentSymbols: string[]; ccy: string; tradeCcy: string; today: string;
  aiEnabled: boolean; aiCheck: { content: string; createdAt: string } | null;
}) {
  const [plan, setPlan] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error' | 'idle'>(isNew ? 'idle' : 'saved');
  const [sym, setSym] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus('dirty');
    const t = setTimeout(async () => {
      setStatus('saving');
      try {
        const r = await savePlanAction(plan);
        setStatus(r.ok ? 'saved' : 'error');
      } catch { setStatus('error'); }
    }, 650);
    return () => clearTimeout(t);
  }, [plan]);

  const up = (patch: Partial<DayPlan>) => setPlan((p) => ({ ...p, ...patch }));
  const upTicker = (id: string, t: PlanTicker) => setPlan((p) => ({ ...p, tickers: p.tickers.map((x) => (x.id === id ? t : x)) }));
  const addTicker = (s: string) => {
    const symbol = s.trim().toUpperCase().replace(/[^A-Z0-9. ]/g, '');
    if (!symbol) return;
    setSym('');
    setPlan((p) => p.tickers.some((t) => t.symbol === symbol) ? p
      : { ...p, tickers: [{ id: uid(), symbol, bias: 'WAIT', setupId: null, levels: [], checklist: [], catalyst: '', notes: '' }, ...p.tickers] });
  };
  const copyPrevious = () => {
    if (!previous) return;
    setPlan((p) => ({
      ...p,
      bias: p.bias ?? previous.bias,
      maxLoss: p.maxLoss ?? previous.maxLoss,
      maxTrades: p.maxTrades ?? previous.maxTrades,
      tickers: [
        ...p.tickers,
        ...previous.tickers.filter((t) => !p.tickers.some((x) => x.symbol === t.symbol)).map((t) => ({
          ...t, id: uid(), levels: t.levels.map((l) => ({ ...l, id: uid() })), checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })),
        })),
      ],
    }));
  };
  const saveDefaults = async () => {
    const r = await savePlanDefaultsAction({ maxLoss: plan.maxLoss, maxTrades: plan.maxTrades, checklist: plan.checklist.map((c) => c.text) });
    setToast(r.msg);
    setTimeout(() => setToast(null), 2500);
  };

  const pvr = useMemo(() => planVsReality(plan, reality), [plan, reality]);
  const hasTrades = reality.trades > 0;
  const lossUsed = plan.maxLoss ? Math.max(0, -reality.dayPnl) / plan.maxLoss : 0;
  const statusLabel = { saved: 'Saved', saving: 'Saving…', dirty: 'Editing…', error: 'Not saved', idle: 'Draft' }[status];
  const isPast = plan.day < today;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{dayTitle(plan.day)}</h1>
          <p className="small muted">{plan.day === today ? 'Today’s game plan' : isPast ? 'Past plan · compare with what happened' : 'Plan ahead'}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill ${status === 'saved' ? 'pos' : status === 'error' ? 'neg' : ''}`}>{status === 'saved' ? '✓ ' : ''}{statusLabel}</span>
          <Link className="btn icon sm" href={`/plan/${shift(plan.day, -1)}`} aria-label="Previous day">‹</Link>
          {plan.day !== today && <Link className="btn sm" href={`/plan/${today}`}>Today</Link>}
          <Link className="btn icon sm" href={`/plan/${shift(plan.day, 1)}`} aria-label="Next day">›</Link>
        </div>
      </div>

      {plan.tickers.length === 0 && previous && previous.tickers.length > 0 && (
        <div className="banner">
          <div><b>Start from your last plan?</b><span className="small muted"> {previous.tickers.length} tickers from {dayTitle(previous.day)}</span></div>
          <button type="button" className="btn primary sm" onClick={copyPrevious}>Copy watchlist</button>
        </div>
      )}

      <div className="plan-grid">
        <div className="plan-side">
          <section className="card o1">
            <div className="card-head"><h3>Day rules</h3>
              <button type="button" className="link" onClick={saveDefaults} style={{ background: 'none', border: 0, cursor: 'pointer' }}>Save as default</button></div>
            <div className="stack" style={{ gap: 14 }}>
              <div className="field"><label>Market bias</label>
                <Seg value={plan.bias} onChange={(v) => up({ bias: v })}
                  options={[{ v: 'BULL', label: '▲ Bullish', tone: 'var(--pos)' }, { v: 'NEUTRAL', label: 'Neutral' }, { v: 'BEAR', label: '▼ Bearish', tone: 'var(--neg)' }]} />
              </div>
              <div className="form-grid">
                <div className="field"><label>Max trades</label>
                  <div className="stepper">
                    <button type="button" onClick={() => up({ maxTrades: Math.max(0, (plan.maxTrades ?? 1) - 1) })}>−</button>
                    <b className="num">{plan.maxTrades ?? '—'}</b>
                    <button type="button" onClick={() => up({ maxTrades: (plan.maxTrades ?? 0) + 1 })}>+</button>
                  </div>
                </div>
                <div className="field"><label>Max daily loss</label>
                  <NumInput value={plan.maxLoss} onChange={(v) => up({ maxLoss: v })} placeholder="e.g. 500" prefix={tradeCcy === 'USD' ? '$' : tradeCcy} />
                </div>
              </div>
              <div className="field"><label>Focus for today</label>
                <input value={plan.focus} onChange={(e) => up({ focus: e.target.value })} placeholder="Only A+ setups. No trades after a 2nd loss." />
              </div>
              {hasTrades && (
                <div className="stack" style={{ gap: 10 }}>
                  {plan.maxTrades != null && (
                    <div>
                      <div className="row between small"><span className="muted">Trades taken</span><b className={reality.trades > plan.maxTrades ? 'neg' : ''}>{reality.trades} / {plan.maxTrades}</b></div>
                      <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (reality.trades / Math.max(1, plan.maxTrades)) * 100)}%`, background: reality.trades > plan.maxTrades ? 'var(--neg)' : 'var(--grad)' }} /></div>
                    </div>
                  )}
                  {plan.maxLoss != null && (
                    <div>
                      <div className="row between small"><span className="muted">Day P&L vs max loss</span>
                        <b className={reality.dayPnl >= 0 ? 'pos' : lossUsed >= 1 ? 'neg' : ''}>{fmtMoney(reality.dayPnl, tradeCcy, true)} / −{fmtMoney(plan.maxLoss, tradeCcy)}</b></div>
                      <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, lossUsed * 100)}%`, background: lossUsed >= 1 ? 'var(--neg)' : lossUsed > 0.6 ? 'var(--warn)' : 'var(--pos)' }} /></div>
                    </div>
                  )}
                </div>
              )}
              {toast && <div className="toast ok">{toast}</div>}
            </div>
          </section>

          <section className="card o2">
            <div className="card-head"><h3>Pre-market checklist</h3></div>
            <Checklist items={plan.checklist} onChange={(c) => up({ checklist: c })} addLabel="Add a checklist item" />
          </section>

          <AiPanel className="o5" title="AI plan check" endpoint="/api/ai/plan" body={{ day: plan.day }} saved={aiCheck} enabled={aiEnabled}
            cta="Check my plan" hint="Before the open: finds missing stops, weak risk-to-reward, levels that contradict your bias, and tickers or times where your own history loses money." />

          <section className="card o6">
            <div className="card-head"><h3>{hasTrades ? 'Plan vs reality' : 'Readiness'}</h3>
              {pvr.score != null && <span className="pill lg"><span className="grad-text" style={{ fontWeight: 750 }}>{Math.round(pvr.score)}</span><span className="faint">/100</span></span>}</div>
            {hasTrades && (
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
                <div className="mini-stat"><span>Planned</span><b>{pvr.plannedN} trades</b><em className={pvr.plannedPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(pvr.plannedPnl, ccy, true)}</em></div>
                <div className="mini-stat"><span>Unplanned</span><b>{pvr.unplannedN} trades</b><em className={pvr.unplannedPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(pvr.unplannedPnl, ccy, true)}</em></div>
              </div>
            )}
            <div className="stack" style={{ gap: 9 }}>
              {pvr.parts.map((p) => (
                <div key={p.label}>
                  <div className="row between small"><span className="muted">{p.label}</span><b>{p.detail}</b></div>
                  <div className="meter" style={{ marginTop: 5 }}><i style={{ width: `${p.score}%`, background: p.score >= 80 ? 'var(--pos)' : p.score >= 50 ? 'var(--warn)' : 'var(--neg)' }} /></div>
                </div>
              ))}
              {!pvr.parts.length && <p className="small muted" style={{ margin: 0 }}>Add a checklist and tickers. Once you trade, this compares your trades with your plan.</p>}
            </div>
            {pvr.unplannedSymbols.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="small muted" style={{ marginBottom: 6 }}>Traded but not in plan</div>
                <div className="chips" style={{ flexWrap: 'wrap' }}>
                  {pvr.unplannedSymbols.map((s) => <Link key={s} className="chip" href={`/trades?q=${encodeURIComponent(s)}&day=${plan.day}&status=all`}>{s}</Link>)}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="plan-main">
          <section className="card add-ticker o3">
            <div className="row" style={{ gap: 8 }}>
              <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="Add ticker to watchlist (e.g. NVDA)" autoCapitalize="characters"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTicker(sym); } }} />
              <button type="button" className="btn primary" onClick={() => addTicker(sym)} disabled={!sym.trim()}>Add</button>
            </div>
            {recentSymbols.length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                {recentSymbols.filter((s) => !plan.tickers.some((t) => t.symbol === s)).map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => addTicker(s)}>+ {s}</button>
                ))}
              </div>
            )}
          </section>

          {plan.tickers.length === 0 ? (
            <div className="card empty-state o4">
              <h2>No tickers yet</h2>
              <p>Add the stocks you’re watching today, mark entry, stop and target levels, and the conditions you need before entering.</p>
            </div>
          ) : (
            <div className="tgrid o4">
              {plan.tickers.map((t) => (
                <TickerCard key={t.id} t={t} setups={setups} reality={reality.bySymbol[t.symbol]} ccy={ccy} day={plan.day}
                  onChange={(nt) => upTicker(t.id, nt)} onRemove={() => setPlan((p) => ({ ...p, tickers: p.tickers.filter((x) => x.id !== t.id) }))} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
