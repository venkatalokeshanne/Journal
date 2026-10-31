'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { Md } from './Md';

export type AiEvent = { t: 'text'; v: string } | { t: 'status'; v: string } | { t: 'error'; v: string } | { t: 'done'; cost: number };

/** POSTs to an AI endpoint and yields its newline-delimited JSON events as they stream in. */
export async function* aiStream(url: string, body: unknown, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    yield { t: 'error', v: res.status === 401 ? 'Your session expired. Sign in again.' : `Request failed (${res.status})` };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) { try { yield JSON.parse(line) as AiEvent; } catch { /* skip partial */ } }
    }
  }
}

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function AiPanel({ title, endpoint, body, saved, enabled, cta, hint, actions, className = '' }: {
  title: string; endpoint: string; body: unknown; saved: { content: string; createdAt: string } | null; enabled: boolean;
  cta: string; hint: string; actions?: (text: string) => ReactNode; className?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(saved?.content ?? '');
  const [at, setAt] = useState(saved?.createdAt ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true); setErr(null); setStatus('Thinking…'); setText(''); setCost(null);
    let got = '';
    try {
      for await (const e of aiStream(endpoint, body, abort.current.signal)) {
        if (e.t === 'text') { got += e.v; setText(got); setStatus(null); }
        else if (e.t === 'status') setStatus(e.v);
        else if (e.t === 'error') setErr(e.v);
        else if (e.t === 'done') { setCost(e.cost); setAt(new Date().toISOString()); }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr('Connection lost. Try again.');
    } finally {
      setBusy(false); setStatus(null);
      if (!got && saved) setText(saved.content);
      router.refresh();
    }
  };

  return (
    <section className={`card ai-card ${className}`}>
      <div className="card-head">
        <h3><span className="ai-spark">✦</span> {title}</h3>
        {at && !busy && <span className="small faint">{ago(at)}{cost != null ? ` · $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}` : ''}</span>}
      </div>
      {!enabled ? (
        <p className="small muted" style={{ margin: 0 }}>AI is off. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart to turn it on.</p>
      ) : (
        <>
          {!text && !busy && !err && <p className="small muted" style={{ marginTop: 0 }}>{hint}</p>}
          {status && <div className="ai-status"><span className="dotpulse" />{status}</div>}
          {text && <Md text={text} />}
          {err && <div className="toast err" style={{ marginTop: 10 }}>{err}</div>}
          <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
            <button type="button" className={`btn ${text ? '' : 'primary'} sm`} onClick={run} disabled={busy}>
              {busy ? 'Working…' : text ? '↻ Regenerate' : `✦ ${cta}`}
            </button>
            {text && !busy && actions?.(text)}
          </div>
        </>
      )}
    </section>
  );
}
