import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { loadExecutions } from '@/lib/data';
import { buildTrips } from '@/lib/engine';

export const dynamic = 'force-dynamic';

/** Fill-level totals for a date range, for reconciling against IBKR statements. */
export async function GET(req: Request) {
  try { await requireUser(); } catch { return NextResponse.json({ error: 'Not signed in' }, { status: 401 }); }
  const u = new URL(req.url);
  const from = u.searchParams.get('from') ?? '0000-00-00';
  const to = u.searchParams.get('to') ?? '9999-99-99';
  const all = await loadExecutions();
  const execs = all.filter((e) => e.tradeDate >= from && e.tradeDate <= to && e.assetClass !== 'CASH');
  const sum = (f: (e: (typeof execs)[0]) => number) => Math.round(execs.reduce((s, e) => s + f(e), 0) * 100) / 100;
  const open = buildTrips(all)
    .filter((t) => t.status === 'OPEN')
    .map((t) => ({ symbol: t.symbol, quantity: t.openQty }));
  return NextResponse.json({
    from, to,
    fills: execs.length,
    realized: sum((e) => e.realizedPnl),
    commissions: sum((e) => e.commission),
    realizedBase: sum((e) => e.realizedPnl * e.fxRateToBase),
    open,
  });
}
