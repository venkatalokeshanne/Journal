'use client';
import { useEffect, useState } from 'react';
import { zonedParts } from '@/lib/time';

/** NYSE regular-session status in New York time (holidays not included). */
function status(now: number) {
  const p = zonedParts(now, 'America/New_York');
  const m = p.hour * 60 + p.minute;
  const weekday = p.weekday >= 1 && p.weekday <= 5;
  if (!weekday) return { label: 'Market closed', tone: 'off' as const, time: p };
  if (m >= 570 && m < 960) return { label: 'Market open', tone: 'on' as const, time: p };
  if (m >= 240 && m < 570) return { label: 'Pre-market', tone: 'pre' as const, time: p };
  if (m >= 960 && m < 1200) return { label: 'After hours', tone: 'pre' as const, time: p };
  return { label: 'Market closed', tone: 'off' as const, time: p };
}

export function MarketStatus() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return null;
  const s = status(now);
  const color = s.tone === 'on' ? 'var(--pos)' : s.tone === 'pre' ? 'var(--warn)' : 'var(--faint)';
  return (
    <span className="pill" title="New York time" style={{ gap: 7 }}>
      <span style={{ width: 7, height: 7, borderRadius: 9, background: color, boxShadow: s.tone === 'on' ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : undefined }} />
      {s.label}
      <span className="faint">{String(s.time.hour).padStart(2, '0')}:{String(s.time.minute).padStart(2, '0')} ET</span>
    </span>
  );
}
