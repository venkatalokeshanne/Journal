import Link from 'next/link';
import { EXTRA_LINKS, ICONS } from '@/components/navItems';
import { TopBar } from '@/components/ui';
import { logout } from '@/app/actions';
import { authEnabled } from '@/lib/auth';

export default function More() {
  return (
    <>
      <TopBar title="More" />
      <main className="main">
        <h1>More</h1>
        <section className="card" style={{ padding: 6 }}>
          {EXTRA_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="row" style={{ padding: '14px 10px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 22, height: 22, color: 'var(--accent)', display: 'inline-flex' }}>{ICONS[l.icon]}</span>
              <span className="grow" style={{ fontWeight: 550 }}>{l.label}</span>
              <span className="faint">›</span>
            </Link>
          ))}
          {authEnabled() && (
            <form action={logout}>
              <button className="row" style={{ all: 'unset', display: 'flex', gap: 10, padding: '14px 10px', cursor: 'pointer', color: 'var(--neg)', width: '100%' }}>Sign out</button>
            </form>
          )}
        </section>
        <p className="small faint">Tip: in your phone browser choose “Add to Home Screen” to use this like an app.</p>
      </main>
    </>
  );
}
