'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Res = { ok: boolean; msg: string } | null;

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<Res>(null);
  const run = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label); setRes(null);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({ ok: false, msg: `Error ${r.status}` }));
      setRes({ ok: !!j.ok, msg: j.msg ?? (j.ok ? 'Done' : 'Failed') });
      router.refresh();
    } catch {
      setRes({ ok: false, msg: 'Network error' });
    } finally {
      setBusy(null);
    }
  };
  return { busy, res, run };
}

export function SyncButtons({ configured, firstDate }: { configured: boolean; firstDate: string }) {
  const { busy, res, run } = useCall();
  const [from, setFrom] = useState(firstDate);
  const post = (body: object) => () => fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (
    <div className="stack" style={{ gap: 12 }}>
      <button className="btn primary" disabled={!configured || !!busy} onClick={() => run('sync', post({ mode: 'recent' }))}>
        {busy === 'sync' ? 'Syncing with IBKR… (up to a minute)' : 'Sync now (last 365 days)'}
      </button>
      <details>
        <summary className="small muted">Backfill older history ›</summary>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="grow" />
          <button className="btn" disabled={!configured || !!busy} onClick={() => run('backfill', post({ mode: 'backfill', from }))}>
            {busy === 'backfill' ? 'Working…' : 'Backfill'}
          </button>
        </div>
        <p className="small faint">Fetches year by year from this date. If IBKR doesn’t allow custom dates for your query, upload CSV files instead.</p>
      </details>
      {res && <div className={`toast ${res.ok ? 'ok' : 'err'}`}>{res.msg}</div>}
    </div>
  );
}

export function UploadBox() {
  const { busy, res, run } = useCall();
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input ref={input} type="file" accept=".csv,.xml,.txt,text/csv,text/xml" multiple
        onChange={(e) => setNames([...(e.target.files ?? [])].map((f) => f.name))} />
      <button className="btn" disabled={!names.length || !!busy}
        onClick={() => run('upload', () => {
          const fd = new FormData();
          for (const f of input.current?.files ?? []) fd.append('files', f);
          return fetch('/api/import', { method: 'POST', body: fd });
        })}>
        {busy ? 'Importing…' : names.length ? `Import ${names.length} file${names.length > 1 ? 's' : ''}` : 'Choose files first'}
      </button>
      {res && <div className={`toast ${res.ok ? 'ok' : 'err'}`}>{res.msg}</div>}
    </div>
  );
}
