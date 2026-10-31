# Trade Journal

A personal, mobile-first trading journal for Interactive Brokers, backed by Supabase (Postgres).

**Why the numbers are right:** P&L comes straight from IBKR's own FIFO realized P&L on every fill (already net of commissions), so totals always match your broker. Fills are grouped into round-trip trades (flat → position → flat), and shorts, partial fills, scale-ins and position flips are all handled.

## Features

- **Dashboard:** net P&L, win rate, profit factor, expectancy, avg win/loss, max drawdown, equity curve, daily P&L, trader score (0–100), automatic insights (revenge trading, overtrading, worst hours/days, losers held too long, commission drag, costliest mistakes), open positions
- **Trades:** search and filter by symbol, side, result, setup, tag, mistake and date range, with sorting
- **Trade page:** price chart with your entries and exits, every fill, R-multiple from your planned stop, setup, rating, tags, mistakes, notes, screenshot links
- **Calendar:** daily P&L heatmap, weekly totals, 12-month overview
- **Journal:** daily pre-market plan, review, lessons, mood and discipline, plus the day's trades
- **Reports:** by month, hour, weekday, holding time, position size, long/short, setup, symbol, tag, and the cost of each mistake
- **Playbook:** your setups with rules and real stats per setup
- **Sync & Import:** one-tap IBKR Flex sync, history backfill, CSV/XML upload (re-imports never duplicate)
- **Currencies:** switch between USD (trade currency) and your base currency (EUR)
- **Phone:** bottom tab bar, dark/light mode, "Add to Home Screen" works like an app

## Setup (about 10 minutes)

### 1. Supabase
1. Create a free project at https://supabase.com (pick a region near you, e.g. Frankfurt).
2. **Project Settings → Database → Connection string → "Transaction pooler"**. Copy the URI and replace `[YOUR-PASSWORD]` with your database password.
3. That's all. The app creates its tables on first start, with Row Level Security enabled so Supabase's public API can't read them.

### 2. IBKR Flex
Your query **"TradeLedger Activity" (ID 1680034)** already has everything needed (Trades section, Execution level, XML).
1. IBKR → Performance & Reports → Flex Queries → **Flex Web Service Configuration** (gear icon) → copy your **token**.

### 3. Configure
```bash
cp .env.example .env.local
```
Then fill in `.env.local`:
```
DATABASE_URL=postgresql://postgres.xxxx:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
IBKR_FLEX_TOKEN=your-token
IBKR_FLEX_QUERY_ID=1680034
BASE_CURRENCY=EUR
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
ALLOWED_EMAILS=you@example.com
```

### Login (Supabase Auth)
1. Supabase → **Project Settings → API Keys**: copy the **Publishable key** into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Supabase → **Authentication → Users → Add user → Create new user**: your email and a password, tick **Auto Confirm User**.
3. Put the same email in `ALLOWED_EMAILS`. Only these emails can open the journal, even if someone else signs up to your project.
4. Recommended: **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**.

If the two `NEXT_PUBLIC_SUPABASE_*` values are empty, the journal opens without a login (only do that on your own PC).

### 4. Run
```bash
npm install
npm run build
npm start
```
Open http://localhost:3000, go to **More → Sync & Import → Sync now**, then upload your older CSV files (or use **Backfill**).

## Use it on your phone (free hosting)
1. Push this folder to a private GitHub repository.
2. Import it at https://vercel.com (free), and add the same variables from `.env.local` under **Settings → Environment Variables**. Always configure the Supabase login.
3. Open the Vercel URL on your phone → Share → **Add to Home Screen**.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm run import -- file.csv` | Import Flex CSV/XML files from the command line |
| `npm run verify -- file.csv` | Check that the trade engine reproduces IBKR's P&L for a file (in-memory, touches nothing) |

## Notes
- Times are shown in New York time (market time). IBKR Flex reports use US Eastern by default (`FLEX_TIMEZONE`).
- IBKR allows at most 365 days per Flex request. **Backfill** asks IBKR for older years one by one. If IBKR doesn't allow custom dates for your query, run the query in IBKR with a *Custom Date Range* (CSV) and upload the files.
- Trades marked **PARTIAL** started before your imported history. Their P&L is still IBKR's exact figure.
- Currency conversions (EUR.USD fills) are hidden from trades. Set `INCLUDE_FOREX=true` to show them.
- Charts use free Yahoo Finance data: 1-minute bars for the last week, 5-minute for ~2 months, hourly for ~2 years, then daily.
