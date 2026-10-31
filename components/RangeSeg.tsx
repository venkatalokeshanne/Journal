'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** Date-range selector; the choice is remembered for every tab (cookie), not just this page. */
export function RangeSeg({ ranges, current, keep }: { ranges: { id: string; label: string }[]; current: string; keep: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const pick = (id: string) => {
    document.cookie = `tj_range=${id}; path=/; max-age=31536000; samesite=lax`;
    const target = `${path}${keep}`;
    start(() => {
      if (`${location.pathname}${location.search}` === target) router.refresh();
      else router.push(target);
    });
  };
  return (
    <nav className="seg" aria-label="Date range" style={{ opacity: pending ? 0.6 : 1 }}>
      {ranges.map((r) => (
        <button key={r.id} type="button" className={current === r.id ? 'on' : ''} onClick={() => pick(r.id)}>{r.label}</button>
      ))}
    </nav>
  );
}
