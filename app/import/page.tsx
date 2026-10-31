import { q } from '@/lib/db';
import { recentSyncs } from '@/lib/data';
import { dateLabel } from '@/lib/format';
import { TopBar } from '@/components/ui';
import { SyncButtons, UploadBox } from '@/components/ImportPanel';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const [[info], logs] = await Promise.all([
    q<{ n: number; first: string | null; last: string | null; symbols: number }>(
      `select count(*)::int as n, min(trade_date)::text as first, max(trade_date)::text as last, count(distinct symbol)::int as symbols from executions`,
    ),
    recentSyncs(12),
  ]);
  const configured = !!(process.env.IBKR_FLEX_TOKEN && process.env.IBKR_FLEX_QUERY_ID);

  return (
    <>
      <TopBar title="Sync & Import" />
      <main className="main stack">
        <h1>Sync &amp; Import</h1>

        <div className="kpis">
          <div className="kpi"><div className="label">Fills stored</div><div className="value num">{info.n.toLocaleString()}</div></div>
          <div className="kpi"><div className="label">Symbols</div><div className="value num">{info.symbols}</div></div>
          <div className="kpi"><div className="label">First trade</div><div className="value">{dateLabel(info.first)}</div></div>
          <div className="kpi"><div className="label">Last trade</div><div className="value">{dateLabel(info.last)}</div></div>
        </div>

        <div className="two even">
          <section className="card">
            <div className="card-head"><h2>Interactive Brokers</h2>
              <span className={`badge ${configured ? 'long' : 'warn'}`}>{configured ? `Query ${process.env.IBKR_FLEX_QUERY_ID}` : 'not configured'}</span></div>
            {!configured && <p className="small muted">Add <code>IBKR_FLEX_TOKEN</code> and <code>IBKR_FLEX_QUERY_ID</code> to <code>.env.local</code> and restart. See README.</p>}
            <SyncButtons configured={configured} firstDate={info.first ?? '2024-01-01'} />
          </section>
          <section className="card">
            <div className="card-head"><h2>Upload Flex reports</h2></div>
            <p className="small muted" style={{ marginTop: 0 }}>IBKR Activity Flex Query output (CSV or XML) with the Trades section at Execution level. Re-importing the same file is safe: duplicates are skipped.</p>
            <UploadBox />
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h2>History</h2></div>
          <div className="list">
            {logs.map((l) => (
              <div key={l.id} className="trow" style={{ gridTemplateColumns: '1fr' }}>
                <div className="sym small"><span className={`badge ${l.status === 'ok' ? 'long' : 'short'}`}>{l.kind}</span>
                  <span className="muted">{new Date(l.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                <div className="small" style={{ whiteSpace: 'normal', color: 'var(--muted)' }}>{l.message}</div>
              </div>
            ))}
            {!logs.length && <p className="small muted">Nothing synced yet.</p>}
          </div>
        </section>
      </main>
    </>
  );
}
