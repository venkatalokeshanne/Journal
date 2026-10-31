'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ICONS, MAIN, EXTRA } from './navItems';
import { NAV_KEY } from './NavMemory';

/** Last visited URL per tab, so switching tabs keeps your filters, month, page... */
function useLastUrls() {
  const [last, setLast] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => { try { setLast(JSON.parse(localStorage.getItem(NAV_KEY) || '{}')); } catch { /* ignore */ } };
    read();
    window.addEventListener('tj-nav', read);
    return () => window.removeEventListener('tj-nav', read);
  }, []);
  return (href: string) => (href === '/' || href === '/plan' ? href : last[href] ?? href);
}

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  const to = useLastUrls();
  if (path.startsWith('/login')) return null;
  return (
    <nav className="sidenav">
      <div className="brand"><span className="brand-dot" />Trade Journal</div>
      {[...MAIN, ...EXTRA].map((l) => (
        <Link key={l.href} href={to(l.href)} className={isActive(path, l.href) ? 'active' : ''}>
          {ICONS[l.icon]}
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** True while a text field is focused (phone keyboard open), so the tab bar can get out of the way. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const isText = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
      return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(el.type);
    };
    const onIn = (e: FocusEvent) => { if (isText(e.target)) { clearTimeout(t); setTyping(true); } };
    // small delay so moving between fields doesn't make the bar flicker
    const onOut = () => { clearTimeout(t); t = setTimeout(() => setTyping(isText(document.activeElement)), 120); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { clearTimeout(t); document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);
  return typing;
}

export function BottomNav() {
  const path = usePathname();
  const to = useLastUrls();
  const typing = useTyping();
  if (path.startsWith('/login')) return null;
  const moreActive = path.startsWith('/more') || EXTRA.some((l) => isActive(path, l.href));
  return (
    <nav className={`bottomnav ${typing ? 'away' : ''}`} aria-hidden={typing}>
      {MAIN.map((l) => (
        <Link key={l.href} href={to(l.href)} className={isActive(path, l.href) ? 'active' : ''}>
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

