import { XMLParser } from 'fast-xml-parser';
import type { Exec } from './types';
import { zonedToUtc } from './time';

/** Flex CSV headers (PascalCase) and Flex XML attributes (camelCase) normalised to one key set. */
const ALIASES: Record<string, string> = {
  clientaccountid: 'accountid',
  accountid: 'accountid',
  currencyprimary: 'currency',
  currency: 'currency',
  assetclass: 'assetcategory',
  assetcategory: 'assetcategory',
  notes: 'notescodes',
  notescodes: 'notescodes',
};

const norm = (k: string) => {
  const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[n] ?? n;
};

type Row = Record<string, string>;

const num = (v: string | undefined, fallback = 0) => {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: string | undefined) => (v === undefined || String(v).trim() === '' ? null : num(v));
const str = (v: string | undefined) => (v === undefined || String(v).trim() === '' ? null : String(v).trim());

function toIsoDate(v: string | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Parses Flex date-times such as "20241101;124547", "2024-11-01;12:45:47", "20241101 124547". */
function toUtcIso(v: string | undefined, tz: string): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const y = +d.slice(0, 4), mo = +d.slice(4, 6), day = +d.slice(6, 8);
  const h = d.length >= 10 ? +d.slice(8, 10) : 0;
  const mi = d.length >= 12 ? +d.slice(10, 12) : 0;
  const s = d.length >= 14 ? +d.slice(12, 14) : 0;
  return zonedToUtc(y, mo, day, h, mi, s, tz).toISOString();
}

function rowToExec(r: Row, tz: string): Exec | null {
  const level = (r.levelofdetail ?? '').toUpperCase();
  if (level && level !== 'EXECUTION') return null;
  const conid = str(r.conid);
  const symbol = str(r.symbol);
  const time = toUtcIso(r.datetime, tz) ?? toUtcIso(r.tradedate, tz);
  if (!conid || !symbol || !time) return null;

  let quantity = num(r.quantity);
  const side = (r.buysell ?? '').toUpperCase();
  if (side.startsWith('SELL') && quantity > 0) quantity = -quantity;
  if (side.startsWith('BUY') && quantity < 0) quantity = -quantity;
  if (quantity === 0) return null;

  const tradeId = str(r.tradeid) ?? str(r.transactionid) ?? str(r.ibexecid);
  if (!tradeId) return null;

  return {
    tradeId,
    accountId: str(r.accountid) ?? '',
    conid,
    symbol,
    underlying: str(r.underlyingsymbol),
    description: str(r.description),
    assetClass: (str(r.assetcategory) ?? 'STK').toUpperCase(),
    subCategory: str(r.subcategory),
    currency: str(r.currency) ?? 'USD',
    fxRateToBase: num(r.fxratetobase, 1) || 1,
    multiplier: num(r.multiplier, 1) || 1,
    putCall: str(r.putcall),
    strike: numOrNull(r.strike),
    expiry: toIsoDate(r.expiry),
    time,
    tradeDate: toIsoDate(r.tradedate) ?? time.slice(0, 10),
    quantity,
    price: num(r.tradeprice),
    proceeds: num(r.proceeds),
    commission: num(r.ibcommission),
    commissionCurrency: str(r.ibcommissioncurrency),
    netCash: num(r.netcash),
    realizedPnl: num(r.fifopnlrealized),
    openClose: str(r.opencloseindicator),
    orderId: str(r.iborderid),
    exchange: str(r.exchange),
    notesCodes: str(r.notescodes),
  };
}

// ---------- CSV ----------

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const MARKERS = new Set(['BOF', 'EOF', 'BOA', 'EOA', 'BOS', 'EOS']);

function parseCsv(text: string, tz: string): Exec[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  let header: string[] | null = null;
  const execs: Exec[] = [];
  for (const line of lines) {
    let cells = parseCsvLine(line);
    // "HEADER"/"DATA" prefixed format (Flex CSV with section markers)
    if (MARKERS.has(cells[0])) continue;
    if (cells[0] === 'HEADER' || cells[0] === 'DATA') {
      const kind = cells[0];
      cells = cells.slice(2); // drop marker + section code
      if (kind === 'HEADER') { header = cells.map(norm); continue; }
    } else if (cells.some((c) => norm(c) === 'tradeid') && cells.some((c) => norm(c) === 'conid')) {
      header = cells.map(norm);
      continue;
    }
    if (!header) continue;
    const row: Row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    const e = rowToExec(row, tz);
    if (e) execs.push(e);
  }
  return execs;
}

// ---------- XML ----------

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => ['FlexStatement', 'Trade'].includes(name),
});

export interface ParsedStatement {
  execs: Exec[];
  fromDate: string | null;
  toDate: string | null;
}

function parseXml(text: string, tz: string): ParsedStatement {
  const doc = xml.parse(text);
  const statements = doc?.FlexQueryResponse?.FlexStatements?.FlexStatement ?? [];
  const execs: Exec[] = [];
  let fromDate: string | null = null;
  let toDate: string | null = null;
  for (const st of statements) {
    const f = toIsoDate(st.fromDate), e2 = toIsoDate(st.toDate);
    if (f && (!fromDate || f < fromDate)) fromDate = f;
    if (e2 && (!toDate || e2 > toDate)) toDate = e2;
    for (const t of st?.Trades?.Trade ?? []) {
      const row: Row = {};
      for (const [k, v] of Object.entries(t)) row[norm(k)] = String(v ?? '');
      const e = rowToExec(row, tz);
      if (e) execs.push(e);
    }
  }
  return { execs, fromDate, toDate };
}

/** Parse a Flex report (XML or CSV) into executions. */
export function parseFlex(text: string, tz = process.env.FLEX_TIMEZONE || 'America/New_York'): ParsedStatement {
  const t = text.trimStart();
  if (t.startsWith('<')) return parseXml(t, tz);
  return { execs: parseCsv(t, tz), fromDate: null, toDate: null };
}

// ---------- Flex Web Service ----------

const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const HEADERS = { 'User-Agent': 'PersonalTradingJournal/1.0' };

function tag(text: string, name: string) {
  return text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the saved Flex Query through IBKR's Flex Web Service and returns the statement XML.
 * `from`/`to` (YYYYMMDD) override the query's period when IBKR supports it for the query.
 */
export async function fetchFlexStatement(opts: { token: string; queryId: string; from?: string; to?: string }): Promise<string> {
  const p = new URLSearchParams({ t: opts.token, q: opts.queryId, v: '3' });
  if (opts.from) p.set('fd', opts.from);
  if (opts.to) p.set('td', opts.to);

  const res = await fetch(`${FLEX_BASE}/SendRequest?${p}`, { headers: HEADERS, cache: 'no-store' });
  const body = await res.text();
  if (tag(body, 'Status') !== 'Success') {
    throw new Error(`IBKR refused the request: ${tag(body, 'ErrorCode')} ${tag(body, 'ErrorMessage') || body.slice(0, 200)}`);
  }
  const ref = tag(body, 'ReferenceCode');
  const url = tag(body, 'Url') || `${FLEX_BASE}/GetStatement`;

  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(attempt === 0 ? 2000 : 4000);
    const r = await fetch(`${url}?${new URLSearchParams({ q: ref, t: opts.token, v: '3' })}`, { headers: HEADERS, cache: 'no-store' });
    const text = await r.text();
    if (text.includes('<FlexQueryResponse')) return text;
    const code = tag(text, 'ErrorCode');
    // 1019 = statement generation in progress, 1018 = too many requests: wait and retry
    if (code === '1019' || code === '1018' || code === '1021') continue;
    throw new Error(`IBKR statement error: ${code} ${tag(text, 'ErrorMessage') || text.slice(0, 200)}`);
  }
  throw new Error('IBKR took too long to generate the statement. Try again in a minute.');
}
