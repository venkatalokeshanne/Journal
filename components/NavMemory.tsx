'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export const NAV_KEY = 'tj_nav_last';
const ROOTS = ['/trades', '/calendar', '/journal', '/reports', '/playbook', '/import', '/coach'];

/** Remembers the last URL (with filters) of each tab so the nav can bring you back to it. */
export function NavMemory() {
  const path = usePathname();
  const sp = useSearchParams();
  useEffect(() => {
    const root = ROOTS.find((r) => path === r || path.startsWith(`${r}/`));
    if (!root) return;
    try {
      const all = JSON.parse(localStorage.getItem(NAV_KEY) || '{}');
      const q = sp.toString();
      all[root] = `${path}${q ? `?${q}` : ''}`;
      localStorage.setItem(NAV_KEY, JSON.stringify(all));
      window.dispatchEvent(new Event('tj-nav'));
    } catch {
      // storage unavailable (private mode): tabs just open fresh
    }
  }, [path, sp]);
  return null;
}
