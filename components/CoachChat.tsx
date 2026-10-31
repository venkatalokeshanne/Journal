'use client';
import { useEffect, useRef, useState } from 'react';
import { aiStream } from './AiPanel';
import { Md } from './Md';

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean };
const KEY = 'tj_coach_chat';

import { SUGGESTIONS } from '@/lib/ai/suggestions';

export function CoachChat({ enabled, initialQuestion }: { enabled: boolean; initialQuestion?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, status]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: 'user', content: question }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setBusy(true); setStatus('Thinking…');
    let answer = '';
    try {
      for await (const e of aiStream('/api/ai/chat', { messages: history })) {
        if (e.t === 'text') { answer += e.v; setStatus(null); setMsgs([...history, { role: 'assistant', content: answer }]); }
        else if (e.t === 'status') setStatus(e.v);
        else if (e.t === 'error') { answer = answer || e.v; setMsgs([...history, { role: 'assistant', content: answer, error: true }]); }
      }
    } catch {
      setMsgs([...history, { role: 'assistant', content: 'Connection lost. Try again.', error: true }]);
    } finally {
      setBusy(false); setStatus(null);
    }
  };

  useEffect(() => {
    if (initialQuestion && enabled && !asked.current) { asked.current = true; send(initialQuestion); }
  }, [initialQuestion, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) {
    return <p className="small muted">AI is off. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart to turn it on.</p>;
  }

  return (
    <div className="chat">
      {msgs.length === 0 && (
        <div className="chat-empty">
          <div className="ai-orb">✦</div>
          <b>Ask anything about your trading</b>
          <p className="small muted">Answers use your real IBKR trades, plans and notes.</p>
          <div className="chips" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        </div>
      )}
      <div className="chat-log">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>
            {m.role === 'assistant' ? (m.content ? <Md text={m.content} /> : null) : m.content}
          </div>
        ))}
        {status && <div className="ai-status"><span className="dotpulse" />{status}</div>}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach…" disabled={busy} />
        <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send">↑</button>
      </form>
      {msgs.length > 0 && !busy && (
        <button type="button" className="link" style={{ background: 'none', border: 0, cursor: 'pointer', alignSelf: 'center', marginTop: 8 }} onClick={() => setMsgs([])}>New conversation</button>
      )}
    </div>
  );
}
