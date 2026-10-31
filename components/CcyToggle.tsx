'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** Switches between the trade currency (e.g. USD) and the account base currency (e.g. EUR). */
export function CcyToggle({ base, baseCcy, tradeCcy }: { base: boolean; baseCcy: string; tradeCcy: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (baseCcy === tradeCcy) return null;
  const set = (mode: 'base' | 'trade') => {
    document.cookie = `tj_ccy=${mode}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <div className="seg" style={{ opacity: pending ? 0.6 : 1 }} aria-label="Currency">
      <button type="button" className={!base ? 'on' : ''} onClick={() => set('trade')}>{tradeCcy}</button>
      <button type="button" className={base ? 'on' : ''} onClick={() => set('base')}>{baseCcy}</button>
    </div>
  );
}
