'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AiPanel } from './AiPanel';
import { appendReviewAction } from '@/app/actions';

export function DebriefPanel({ day, saved, enabled }: { day: string; saved: { content: string; createdAt: string } | null; enabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <AiPanel title="AI debrief" endpoint="/api/ai/debrief" body={{ day }} saved={saved} enabled={enabled}
      cta="Debrief my day" hint="After the close: what went well, what cost you money, whether you followed your plan and rules, and one rule for tomorrow."
      actions={(text) => (
        <>
          <button type="button" className="btn sm" onClick={async () => { const r = await appendReviewAction(day, text); setMsg(r.msg); router.refresh(); }}>Save to my review</button>
          {msg && <span className="small pos">{msg}</span>}
        </>
      )} />
  );
}
