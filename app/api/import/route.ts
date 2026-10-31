import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { parseFlex } from '@/lib/flex';
import { upsertExecutions, logSync } from '@/lib/data';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ ok: false, msg: 'Choose at least one file' }, { status: 400 });

  const results: string[] = [];
  let added = 0, updated = 0;
  for (const file of files) {
    if (file.size > MAX_BYTES) { results.push(`${file.name}: too large`); continue; }
    try {
      const { execs } = parseFlex(await file.text());
      if (!execs.length) { results.push(`${file.name}: no IBKR trades found (is it a Flex Trades report?)`); continue; }
      const r = await upsertExecutions(execs, `file:${file.name}`);
      added += r.added; updated += r.updated;
      results.push(`${file.name}: ${execs.length} fills, ${r.added} new`);
    } catch (e) {
      results.push(`${file.name}: ${e instanceof Error ? e.message : 'could not read'}`);
    }
  }
  const msg = results.join(' · ');
  await logSync('upload', added + updated > 0 ? 'ok' : 'error', msg, added, updated);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: added + updated > 0, msg, added, updated });
}
