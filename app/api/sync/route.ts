import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { fetchFlexStatement, parseFlex } from '@/lib/flex';
import { upsertExecutions, logSync } from '@/lib/data';
import { addDays, todayInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ymd = (d: string) => d.replace(/-/g, '');

export async function POST(req: Request) {
  const token = process.env.IBKR_FLEX_TOKEN?.trim();
  const queryId = process.env.IBKR_FLEX_QUERY_ID?.trim();
  if (!token || !queryId) {
    return NextResponse.json({ ok: false, msg: 'Add IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID to .env.local, then restart the app.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'backfill' ? 'backfill' : 'recent';

  try {
    if (mode === 'recent') {
      const xml = await fetchFlexStatement({ token, queryId });
      const { execs, fromDate, toDate } = parseFlex(xml);
      const r = await upsertExecutions(execs, 'flex-sync');
      const msg = `${execs.length} fills from ${fromDate ?? '?'} to ${toDate ?? '?'}: ${r.added} new, ${r.updated} refreshed`;
      await logSync('sync', 'ok', msg, r.added, r.updated);
      revalidatePath('/', 'layout');
      return NextResponse.json({ ok: true, msg, ...r });
    }

    // Backfill older history in 365-day windows (IBKR's maximum per request).
    const start = String(body?.from ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ ok: false, msg: 'Pick a start date' }, { status: 400 });
    const today = todayInTz();
    let from = start, added = 0, updated = 0, windows = 0;
    while (from <= today) {
      const to = addDays(from, 364) < today ? addDays(from, 364) : today;
      const xml = await fetchFlexStatement({ token, queryId, from: ymd(from), to: ymd(to) });
      const st = parseFlex(xml);
      if (st.fromDate && st.fromDate !== from) {
        throw new Error(`IBKR ignored the custom dates (returned ${st.fromDate} to ${st.toDate}). Download older periods as CSV from IBKR and upload them below.`);
      }
      const r = await upsertExecutions(st.execs, 'flex-backfill');
      added += r.added; updated += r.updated; windows++;
      from = addDays(to, 1);
      if (from <= today) await new Promise((res) => setTimeout(res, 3000)); // IBKR rate limit
    }
    const msg = `Backfilled ${windows} period(s) from ${start}: ${added} new, ${updated} refreshed`;
    await logSync('backfill', 'ok', msg, added, updated);
    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, msg, added, updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync(mode, 'error', msg).catch(() => {});
    return NextResponse.json({ ok: false, msg }, { status: 502 });
  }
}
