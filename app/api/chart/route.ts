import { NextResponse } from 'next/server';

/** Price bars for the trade chart (free Yahoo Finance data). Interval depends on how old/long the trade is. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const raw = (u.searchParams.get('symbol') ?? '').trim().toUpperCase();
  const from = Date.parse(u.searchParams.get('from') ?? '');
  const to = Date.parse(u.searchParams.get('to') ?? '') || from;
  if (!/^[A-Z0-9 .\-]{1,15}$/.test(raw) || !Number.isFinite(from)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const symbol = raw.replace(/[ .]/g, '-');
  const now = Date.now();
  const H = 3600e3, D = 24 * H;
  const age = (now - from) / D, span = (to - from) / D;

  let interval: string, p1: number, p2: number;
  if (age < 6.5 && span < 1) { interval = '1m'; p1 = from - 2 * H; p2 = to + 2 * H; }
  else if (age < 58 && span < 4) { interval = '5m'; p1 = from - 8 * H; p2 = to + 8 * H; }
  else if (age < 700 && span < 25) { interval = '60m'; p1 = from - 6 * D; p2 = to + 4 * D; }
  else { interval = '1d'; p1 = from - 90 * D; p2 = to + 30 * D; }
  p2 = Math.min(p2, now);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(p1 / 1000)}&period2=${Math.floor(p2 / 1000)}&interval=${interval}&includePrePost=true`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: interval === '1d' ? 86400 : 3600 } });
    if (!r.ok) return NextResponse.json({ error: `price data unavailable (${r.status})` }, { status: 502 });
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const qd = res?.indicators?.quote?.[0] ?? {};
    const candles = ts
      .map((t, i) => ({ time: t, open: qd.open?.[i], high: qd.high?.[i], low: qd.low?.[i], close: qd.close?.[i] }))
      .filter((c) => [c.open, c.high, c.low, c.close].every((v) => typeof v === 'number'));
    return NextResponse.json({ interval, candles });
  } catch {
    return NextResponse.json({ error: 'price data unavailable' }, { status: 502 });
  }
}
