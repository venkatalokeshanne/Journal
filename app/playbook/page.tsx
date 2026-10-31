import Link from 'next/link';
import { getCtx } from '@/lib/view';
import { computeStats } from '@/lib/engine';
import { money, pct } from '@/lib/format';
import { TopBar, Money } from '@/components/ui';
import { SetupForm } from '@/components/forms';
import { deleteSetupAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function Playbook() {
  const ctx = await getCtx();
  const closed = ctx.trips.filter((t) => t.status === 'CLOSED');
  const tagged = closed.filter((t) => ctx.notes.get(t.key)?.setupId).length;

  return (
    <>
      <TopBar title="Playbook" ctx={ctx} />
      <main className="main stack">
        <div className="page-head">
          <div><h1>Playbook</h1><p className="small muted" style={{ margin: '4px 0 0' }}>Your setups and how each one really performs. {tagged} of {closed.length} trades have a setup.</p></div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
          {ctx.setups.map((su) => {
            const ts = closed.filter((t) => ctx.notes.get(t.key)?.setupId === su.id);
            const s = computeStats(ts, ctx.pnl, ctx.comm);
            const rules = su.rules.split('\n').map((r) => r.trim()).filter(Boolean);
            return (
              <section key={su.id} className="card" style={{ opacity: su.archived ? 0.6 : 1 }}>
                <div className="card-head">
                  <h2>{su.name} {su.archived && <span className="badge">archived</span>}</h2>
                  <Link className="small muted" href={`/trades?setup=${su.id}&status=all`}>{ts.length} trades ›</Link>
                </div>
                {su.description && <p className="small muted" style={{ marginTop: 0 }}>{su.description}</p>}
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  <div><div className="small faint">Net</div><Money v={s.net} ccy={ctx.ccy} compact /></div>
                  <div><div className="small faint">Win %</div><span className="num">{ts.length ? pct(s.winRate, 0) : '—'}</span></div>
                  <div><div className="small faint">PF</div><span className="num">{s.profitFactor?.toFixed(2) ?? '—'}</span></div>
                  <div><div className="small faint">Avg</div><span className={`num ${s.expectancy >= 0 ? 'pos' : 'neg'}`}>{ts.length ? money(s.expectancy, ctx.ccy, { compact: true }) : '—'}</span></div>
                </div>
                {rules.length > 0 && (
                  <ul className="small" style={{ paddingLeft: 18, margin: '12px 0 0' }}>
                    {rules.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
                <details style={{ marginTop: 12 }}>
                  <summary className="small muted">Edit</summary>
                  <div style={{ marginTop: 12 }}>
                    <SetupForm setup={su}>
                      <button formAction={deleteSetupAction} className="btn danger" type="submit">Delete</button>
                    </SetupForm>
                  </div>
                </details>
              </section>
            );
          })}

          <section className="card">
            <div className="card-head"><h2>New setup</h2></div>
            <SetupForm />
          </section>
        </div>
      </main>
    </>
  );
}
