/**
 * Checks the import + trade engine against real IBKR Flex files, using an in-memory Postgres.
 * Usage: npm run verify -- <flex.csv|flex.xml> [more files...]
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { setClient } from '../lib/db';
import { parseFlex } from '../lib/flex';
import { upsertExecutions, loadExecutions } from '../lib/data';
import { buildTrips, computeStats, dailyPnl } from '../lib/engine';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Pass one or more IBKR Flex CSV/XML files.');
  process.exit(1);
}

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

const pg = new PGlite();
setClient({ query: (t, p) => pg.query(t, p as any[]) as any });

let parsedCount = 0;
let fifoTotal = 0;
for (const f of files) {
  const { execs } = parseFlex(readFileSync(f, 'utf8'));
  parsedCount += execs.length;
  fifoTotal += execs.filter((e) => e.assetClass !== 'CASH').reduce((s, e) => s + e.realizedPnl, 0);
  const r1 = await upsertExecutions(execs, 'verify');
  const r2 = await upsertExecutions(execs, 'verify'); // importing twice must not duplicate
  check(`import ${f.split(/[\\/]/).pop()}`, r1.added === new Set(execs.map((e) => e.tradeId)).size && r2.added === 0, `added ${r1.added}, re-import added ${r2.added}`);
}

const execs = await loadExecutions();
check('all parsed fills stored', execs.length === parsedCount, `${execs.length}/${parsedCount}`);

const trips = buildTrips(execs);
const closed = trips.filter((t) => t.status === 'CLOSED');
const tripRealized = trips.reduce((s, t) => s + t.realized, 0);
check('trip P&L equals IBKR realized P&L', close(tripRealized, fifoTotal), `${tripRealized.toFixed(2)} vs ${fifoTotal.toFixed(2)}`);

const tripComm = trips.reduce((s, t) => s + t.commission, 0);
const fillComm = execs.filter((e) => e.assetClass !== 'CASH').reduce((s, e) => s + e.commission, 0);
check('trip commissions equal fill commissions', close(tripComm, fillComm), `${tripComm.toFixed(2)} vs ${fillComm.toFixed(2)}`);

const days = dailyPnl(execs, closed, false);
check('daily P&L sums to total', close(days.reduce((s, d) => s + d.pnl, 0), fifoTotal));

// every closed, complete trip must net its quantity to zero
const unbalanced = closed.filter((t) => !t.incomplete && Math.abs(t.legs.reduce((s, l) => s + l.quantity, 0)) > 1e-6);
check('closed trips are flat', unbalanced.length === 0, unbalanced.map((t) => t.symbol).join(','));

const s = computeStats(closed, (t) => t.realized, (t) => t.commission);
console.log(`\n${trips.length} trips (${closed.length} closed, ${trips.length - closed.length} open, ${trips.filter((t) => t.incomplete).length} incomplete)`);
console.log(`net ${s.net.toFixed(2)} | win rate ${(s.winRate * 100).toFixed(1)}% | PF ${s.profitFactor?.toFixed(2)} | commissions ${s.commissions.toFixed(2)}`);
for (const t of trips.filter((t) => t.incomplete || t.status === 'OPEN')) {
  console.log(`  ${t.status.padEnd(6)} ${t.incomplete ? 'incomplete' : '          '} ${t.symbol} ${t.direction} openQty=${t.openQty} realized=${t.realized.toFixed(2)}`);
}
process.exit(failures ? 1 : 0);
