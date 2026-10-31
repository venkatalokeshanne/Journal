/** Import IBKR Flex CSV/XML files from the command line: npm run import -- file1.csv file2.xml */
import { readFileSync } from 'node:fs';
import { parseFlex } from '../lib/flex';
import { upsertExecutions, logSync } from '../lib/data';

for (const f of process.argv.slice(2)) {
  const { execs } = parseFlex(readFileSync(f, 'utf8'));
  const r = await upsertExecutions(execs, `cli:${f.split(/[\/]/).pop()}`);
  await logSync('upload', 'ok', `${f.split(/[\/]/).pop()}: ${execs.length} fills, ${r.added} new`, r.added, r.updated);
  console.log(`${f}: ${execs.length} fills, ${r.added} new, ${r.updated} refreshed`);
}
process.exit(0);
