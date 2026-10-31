import { Pool, types } from 'pg';

// numeric -> number, bigint -> number, date -> 'YYYY-MM-DD' string
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

export interface DbClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const SCHEMA = `
create table if not exists executions (
  trade_id text primary key,
  account_id text not null default '',
  conid text not null,
  symbol text not null,
  underlying text,
  description text,
  asset_class text not null,
  sub_category text,
  currency text not null,
  fx_rate_to_base numeric not null default 1,
  multiplier numeric not null default 1,
  put_call text,
  strike numeric,
  expiry date,
  exec_time timestamptz not null,
  trade_date date not null,
  quantity numeric not null,
  price numeric not null,
  proceeds numeric not null default 0,
  commission numeric not null default 0,
  commission_currency text,
  net_cash numeric not null default 0,
  realized_pnl numeric not null default 0,
  open_close text,
  order_id text,
  exchange text,
  notes_codes text,
  source text not null,
  imported_at timestamptz not null default now()
);
create index if not exists executions_group_time on executions (account_id, conid, exec_time);
create index if not exists executions_trade_date on executions (trade_date);

create table if not exists setups (
  id bigserial primary key,
  name text not null unique,
  description text not null default '',
  rules text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists trade_notes (
  trade_key text primary key,
  setup_id bigint references setups(id) on delete set null,
  tags text[] not null default '{}',
  mistakes text[] not null default '{}',
  rating smallint check (rating between 1 and 5),
  stop_price numeric,
  target_price numeric,
  notes text not null default '',
  screenshots text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists journal_days (
  day date primary key,
  plan text not null default '',
  review text not null default '',
  lessons text not null default '',
  mood smallint check (mood between 1 and 5),
  discipline smallint check (discipline between 1 and 5),
  updated_at timestamptz not null default now()
);

create table if not exists sync_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  status text not null,
  message text not null default '',
  added integer not null default 0,
  updated integer not null default 0
);

create table if not exists day_plans (
  day date primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists ai_notes (
  kind text not null,
  ref text not null,
  content text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);

create table if not exists ai_usage (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric not null default 0
);

-- Block Supabase's public REST API from these tables (the app connects as the database owner).
alter table executions enable row level security;
alter table setups enable row level security;
alter table trade_notes enable row level security;
alter table journal_days enable row level security;
alter table sync_log enable row level security;
alter table day_plans enable row level security;
alter table settings enable row level security;
alter table ai_notes enable row level security;
alter table ai_usage enable row level security;
`;

/**
 * One connection and one schema migration per server process. Both live on globalThis as promises
 * that are created synchronously, so concurrent requests (and Next.js's separate module instances)
 * can never open a second database or run the migration twice in parallel.
 */
type DbState = { db: Promise<DbClient> | null; ready: Promise<void> | null };
const g = globalThis as unknown as { __tj?: DbState };
const state: DbState = (g.__tj ??= { db: null, ready: null });

/** Used by scripts/verify.mts to run against an in-memory Postgres. */
export function setClient(c: DbClient) {
  state.db = Promise.resolve(c);
  state.ready = null;
}

async function connect(): Promise<DbClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  if (url.startsWith('pglite:')) {
    // Local preview mode (pglite:memory://): embedded in-memory Postgres, data is lost on restart.
    const { PGlite } = await import('@electric-sql/pglite');
    const loc = url.slice('pglite:'.length);
    const db = new PGlite(loc && loc !== 'memory://' ? loc : undefined);
    return { query: (t, p) => db.query(t, p as any[]) as Promise<{ rows: any[] }> };
  }
  const serverless = !!process.env.VERCEL;
  const pool = new Pool({
    connectionString: serverless ? transactionPooler(url) : url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    // Supabase's session pooler allows only ~15 clients in total, shared by every server instance.
    max: serverless ? 2 : 3,
    idleTimeoutMillis: serverless ? 5_000 : 15_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', () => {}); // a dropped idle connection must not crash the server; the next query reconnects
  return pool;
}

/**
 * On serverless (Vercel) many short-lived instances each open connections, which exhausts Supabase's
 * session pooler (port 5432, ~15 clients). Its transaction pooler (port 6543) on the same host shares
 * connections per query and is made for this.
 */
function transactionPooler(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('pooler.supabase.com') && (u.port === '5432' || u.port === '')) u.port = '6543';
    return u.toString();
  } catch {
    return url;
  }
}

export async function migrate(c: DbClient) {
  // Fast path: the newest table already exists, so the schema is current (one query per cold start).
  // When adding a table to SCHEMA, point this check at it.
  const [r] = (await c.query(`select to_regclass('public.ai_usage') is not null as ok`)).rows;
  if (r?.ok) return;
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await c.query(stmt);
  }
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  state.db ??= connect().catch((e) => {
    state.db = null;
    throw e;
  });
  const c = await state.db;
  state.ready ??= migrate(c).catch((e) => {
    state.ready = null;
    throw e;
  });
  await state.ready;
  const res = await c.query(text, params);
  return res.rows as T[];
}
