'use client';
import { useActionState, useState, type ReactNode } from 'react';
import { saveTradeNote, saveJournal, saveSetupAction, login } from '@/app/actions';
import type { Setup, TradeNote, JournalDay } from '@/lib/types';

type Res = { ok: boolean; msg: string } | null;

function Status({ state }: { state: Res }) {
  if (!state) return null;
  return <div className={`toast ${state.ok ? 'ok' : 'err'}`} role="status">{state.msg}</div>;
}

function Scale({ name, value, labels }: { name: string; value: number | null; labels: string[] }) {
  const [v, setV] = useState<number | null>(value);
  return (
    <div className="chips">
      <input type="hidden" name={name} value={v ?? ''} />
      {labels.map((l, i) => (
        <button key={l} type="button" className={`chip ${v === i + 1 ? 'on' : ''}`} onClick={() => setV(v === i + 1 ? null : i + 1)}>{l}</button>
      ))}
    </div>
  );
}

const COMMON_MISTAKES = ['FOMO entry', 'No stop', 'Moved stop', 'Oversized', 'Revenge trade', 'Exited early', 'Held loser too long', 'Chased', 'Off-plan', 'Averaged down'];
const COMMON_TAGS = ['A+ setup', 'Breakout', 'Pullback', 'Reversal', 'Gap', 'News', 'Earnings', 'Trend', 'Scalp', 'Swing'];

function TagField({ name, label, value, suggestions }: { name: string; label: string; value: string[]; suggestions: string[] }) {
  const [items, setItems] = useState<string[]>(value);
  const [text, setText] = useState('');
  const add = (t: string) => { const x = t.trim(); if (x && !items.includes(x)) setItems([...items, x]); setText(''); };
  return (
    <div className="field full">
      <label>{label}</label>
      <input type="hidden" name={name} value={items.join(',')} />
      <div className="pill-input">
        {items.map((t) => (
          <button key={t} type="button" className="chip on" onClick={() => setItems(items.filter((x) => x !== t))} aria-label={`Remove ${t}`}>{t} ✕</button>
        ))}
      </div>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type and press Enter"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } }} onBlur={() => text && add(text)} />
      <div className="chips">
        {suggestions.filter((s) => !items.includes(s)).slice(0, 12).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => add(s)}>+ {s}</button>
        ))}
      </div>
    </div>
  );
}

export function TradeNoteForm({ tradeKey, note, setups, knownTags, knownMistakes }: {
  tradeKey: string; note: TradeNote | undefined; setups: Setup[]; knownTags: string[]; knownMistakes: string[];
}) {
  const [state, action, pending] = useActionState<Res, FormData>(saveTradeNote, null);
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="key" value={tradeKey} />
      <div className="field full"><label>Setup</label>
        <select name="setupId" defaultValue={note?.setupId ?? ''}>
          <option value="">—</option>
          {setups.filter((s) => !s.archived || s.id === note?.setupId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="field full"><label>Execution rating</label>
        <Scale name="rating" value={note?.rating ?? null} labels={['1', '2', '3', '4', '5']} />
      </div>
      <div className="field"><label>Planned stop</label><input name="stop" inputMode="decimal" defaultValue={note?.stopPrice ?? ''} placeholder="for R-multiple" /></div>
      <div className="field"><label>Planned target</label><input name="target" inputMode="decimal" defaultValue={note?.targetPrice ?? ''} /></div>
      <TagField name="tags" label="Tags" value={note?.tags ?? []} suggestions={[...new Set([...knownTags, ...COMMON_TAGS])]} />
      <TagField name="mistakes" label="Mistakes" value={note?.mistakes ?? []} suggestions={[...new Set([...knownMistakes, ...COMMON_MISTAKES])]} />
      <div className="field full"><label>Notes</label><textarea name="notes" defaultValue={note?.notes ?? ''} placeholder="Why did you take it? What did you see? What would you do differently?" /></div>
      <div className="field full"><label>Screenshot links (one per line)</label><textarea name="screenshots" defaultValue={(note?.screenshots ?? []).join('\n')} style={{ minHeight: 60 }} placeholder="https://www.tradingview.com/x/..." /></div>
      <div className="row full"><button className="btn primary grow" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button></div>
      <div className="full"><Status state={state} /></div>
    </form>
  );
}

export function JournalForm({ j }: { j: JournalDay }) {
  const [state, action, pending] = useActionState<Res, FormData>(saveJournal, null);
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="day" value={j.day} />
      <div className="field full"><label>Pre-market plan</label><textarea name="plan" defaultValue={j.plan} placeholder="Market context, watchlist, levels, max loss for the day…" /></div>
      <div className="field full"><label>Review</label><textarea name="review" defaultValue={j.review} placeholder="What happened? Did you follow the plan?" /></div>
      <div className="field full"><label>Lessons</label><textarea name="lessons" defaultValue={j.lessons} style={{ minHeight: 70 }} /></div>
      <div className="field full"><label>Mood</label><Scale name="mood" value={j.mood} labels={['😣', '🙁', '😐', '🙂', '😄']} /></div>
      <div className="field full"><label>Discipline</label><Scale name="discipline" value={j.discipline} labels={['1', '2', '3', '4', '5']} /></div>
      <div className="row full"><button className="btn primary grow" disabled={pending}>{pending ? 'Saving…' : 'Save day'}</button></div>
      <div className="full"><Status state={state} /></div>
    </form>
  );
}

export function SetupForm({ setup, children }: { setup?: Setup; children?: ReactNode }) {
  const [state, action, pending] = useActionState<Res, FormData>(saveSetupAction, null);
  return (
    <form action={action} className="form-grid">
      {setup && <input type="hidden" name="id" value={setup.id} />}
      <div className="field full"><label>Name</label><input name="name" defaultValue={setup?.name} required placeholder="e.g. Opening range breakout" /></div>
      <div className="field full"><label>Description</label><textarea name="description" defaultValue={setup?.description} style={{ minHeight: 60 }} /></div>
      <div className="field full"><label>Rules / checklist (one per line)</label><textarea name="rules" defaultValue={setup?.rules} placeholder={'Price above VWAP\nVolume > 2× average\nStop below range low'} /></div>
      {setup && <label className="row full small"><input type="checkbox" name="archived" defaultChecked={setup.archived} style={{ width: 20, minHeight: 20 }} /> Archived</label>}
      <div className="row full"><button className="btn primary grow" disabled={pending}>{pending ? 'Saving…' : setup ? 'Save setup' : 'Add setup'}</button>{children}</div>
      <div className="full"><Status state={state} /></div>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<Res, FormData>(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <div className="input-icon">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
          <input id="email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@example.com" autoFocus required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="input-icon">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
          <input id="password" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="••••••••" required />
          <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      <button className="btn primary" style={{ minHeight: 50, fontSize: 15.5 }} disabled={pending}>
        {pending ? 'Signing in…' : <>Sign in <span aria-hidden>→</span></>}
      </button>
      <Status state={state} />
    </form>
  );
}
