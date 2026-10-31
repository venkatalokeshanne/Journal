'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ICONS, MAIN, EXTRA } from './navItems';

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  if (path.startsWith('/login')) return null;
  return (
    <nav className="sidenav">
      <div className="brand"><span className="brand-dot" />Trade Journal</div>
      {[...MAIN, ...EXTRA].map((l) => (
        <Link key={l.href} href={l.href} className={isActive(path, l.href) ? 'active' : ''}>
          {ICONS[l.icon]}
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith('/login')) return null;
  const moreActive = path.startsWith('/more') || EXTRA.some((l) => isActive(path, l.href));
  return (
    <nav className="bottomnav">
      {MAIN.map((l) => (
        <Link key={l.href} href={l.href} className={isActive(path, l.href) ? 'active' : ''}>
          {ICONS[l.icon]}
          {l.label}
        </Link>
      ))}
      <Link href="/more" className={moreActive ? 'active' : ''}>
        {ICONS.more}
        More
      </Link>
    </nav>
  );
}

