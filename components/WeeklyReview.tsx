'use client';
import { useState } from 'react';
import { AiPanel } from './AiPanel';

export function WeeklyReview({ weeks, saved, enabled }: { weeks: { monday: string; label: string }[]; saved: Record<string, { content: string; createdAt: string }>; enabled: boolean }) {
  const [monday, setMonday] = useState(weeks[0]?.monday);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {weeks.map((w) => <button key={w.monday} type="button" className={monday === w.monday ? 'on' : ''} onClick={() => setMonday(w.monday)}>{w.label}{saved[w.monday] ? ' ✓' : ''}</button>)}
      </div>
      <AiPanel key={monday} title="Weekly review" endpoint="/api/ai/weekly" body={{ monday }} saved={saved[monday] ?? null} enabled={enabled}
        cta="Write my weekly review" hint="A deeper review of the week: numbers vs your previous 4 weeks, best decisions, costliest mistakes, patterns and 3 focus rules. Uses the stronger model (about $0.02)." />
    </div>
  );
}
