/** One IBKR execution (fill), as stored in the database. */
export interface Exec {
  tradeId: string;
  accountId: string;
  conid: string;
  symbol: string;
  underlying: string | null;
  description: string | null;
  assetClass: string; // STK, OPT, FUT, CASH, ...
  subCategory: string | null;
  currency: string;
  fxRateToBase: number;
  multiplier: number;
  putCall: string | null;
  strike: number | null;
  expiry: string | null;
  time: string; // ISO UTC
  tradeDate: string; // YYYY-MM-DD (IBKR trade date)
  quantity: number; // signed: + buy, - sell
  price: number;
  proceeds: number;
  commission: number; // negative = cost
  commissionCurrency: string | null;
  netCash: number;
  realizedPnl: number; // IBKR FIFO realized P&L, net of commissions
  openClose: string | null; // O, C, C;O
  orderId: string | null;
  exchange: string | null;
  notesCodes: string | null;
}

export interface TripLeg {
  tradeId: string;
  time: string;
  tradeDate: string;
  quantity: number; // signed portion belonging to this trip
  price: number;
  commission: number;
  realized: number;
  role: 'open' | 'close';
  exchange: string | null;
  fx: number;
}

/** A round-trip trade: from flat to flat on one contract. */
export interface Trip {
  key: string;
  accountId: string;
  conid: string;
  symbol: string;
  underlying: string | null;
  description: string | null;
  assetClass: string;
  currency: string;
  multiplier: number;
  putCall: string | null;
  strike: number | null;
  expiry: string | null;
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  /** History before the import window is missing, so the opening fills are unknown. */
  incomplete: boolean;
  openTime: string;
  closeTime: string | null;
  openDate: string;
  closeDate: string | null;
  holdSeconds: number | null;
  maxPosition: number; // absolute shares/contracts at peak
  openQty: number; // remaining open quantity (signed) for OPEN trips
  entryPrice: number; // average entry
  exitPrice: number | null; // average exit
  realized: number; // trade currency, net of commissions
  realizedBase: number; // base currency
  commission: number; // negative
  commissionBase: number;
  gross: number; // before commissions
  legs: TripLeg[];
}

export interface TradeNote {
  tradeKey: string;
  setupId: number | null;
  tags: string[];
  mistakes: string[];
  rating: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  notes: string;
  screenshots: string[];
}

export interface Setup {
  id: number;
  name: string;
  description: string;
  rules: string;
  archived: boolean;
}

export interface JournalDay {
  day: string;
  plan: string;
  review: string;
  lessons: string;
  mood: number | null;
  discipline: number | null;
}
