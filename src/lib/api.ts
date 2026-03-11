// ─── Stats ────────────────────────────────────────────────────────────────────

export interface Stats {
  totalTrades: number;
  settledTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlCents: number;
  avgEvCents: number;
  avgConfidence: number;
  bestTradePnl: number;
  worstTradePnl: number;
  profitFactor: number;
  sharpeApprox: number;
}

// ─── Trade ────────────────────────────────────────────────────────────────────

export interface Trade {
  id: string;
  source?: "auto" | "manual";
  ticker?: string;
  asset: string;
  floorStrike: number;
  closeTime: string;
  entryTimestamp: number;
  settledAt: number | null;
  regime: "R1" | "R2" | "R3";
  direction: "yes" | "no";
  entryPrice: number;
  suggestedSize: number;
  modelProbability: number;
  marketProbability: number;
  ev: number;
  kellyFraction: number;
  confidence: number;
  outcome: "win" | "loss" | "pending";
  pnlCents: number | null;
  pnlTotal: number | null;
  finalCryptoPrice?: number | null;
  isLive?: boolean;
  orderId?: string;
  liveCount?: number;
}

// ─── Account Balance ──────────────────────────────────────────────────────────

export interface AccountBalance {
  balanceCents: number;
  balanceDollars: number;
}

// ─── Kalshi Fills ─────────────────────────────────────────────────────────────

export interface KalshiFill {
  trade_id: string;
  order_id: string;
  ticker: string;
  action: "buy" | "sell";
  side: "yes" | "no";
  count: number;
  yes_price: number;
  no_price: number;
  is_taker: boolean;
  created_time: string;
}

// ─── Kalshi Market Price ──────────────────────────────────────────────────────

export interface KalshiMarketPrice {
  yes_bid: number;
  yes_ask: number;
  last_price: number;
  status: string;
  result: string;
}

// ─── Backend Health ───────────────────────────────────────────────────────────

export interface BackendHealth {
  status: "ok" | "error" | "unreachable";
  timestamp: string;
  uptime: number;
  uptimeMinutes: number;
  version: string;
  environment: string;
  liveTradingEnabled: boolean;
  maxTradeCents: number;
  activeWorkers: string[];
  tradeCount: number;
  pendingTrades: number;
  settledTrades: number;
  logCount: number;
  lastLogTimestamp: string | null;
  lastHeartbeatTimestamp: string | null;
  heartbeatIntervalMs: number;
  latencyMs: number | null;
  engineConfig: {
    evMinCents: number;
    evMaxCents: number;
    minEntryPriceCents: number;
    stabilityWindow: number;
    tradingWindowOpenMs: number;
    tradingWindowCloseMs: number;
  };
  error?: string;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface LogsMeta {
  count: number;
  lastTimestamp: string | null;
}

export interface LogsResponse {
  logs: string[];
  meta: LogsMeta;
}

// ─── Backend Status (per-worker observability) ────────────────────────────────

export interface WorkerSnapshot {
  assetKey: string;
  currentPrice: number | null;
  marketTicker: string | null;
  marketFloorStrike: number | null;
  marketCloseTime: string | null;
  enginePhase: string | null;
  orderbookSpread: number;
  lastTradeTimestamp: number;
  pendingTickers: string[];
}

export interface BackendStatus {
  timestamp: string;
  workers: WorkerSnapshot[];
  positionTracker: { active: number; max: number };
  recentEvents: string[];
  latencyMs: number | null;
}

// ─── Per-Endpoint Latency Tracking ───────────────────────────────────────────
// Module-level map — lives in the browser's module scope, updated on each
// successful fetch. Components can read the last measured latency per endpoint.

const _endpointLatency = new Map<string, number>();

export function getEndpointLatency(endpoint: string): number | null {
  return _endpointLatency.get(endpoint) ?? null;
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const start = Date.now();
  const res = await fetch(url, init);
  _endpointLatency.set(url, Date.now() - start);
  return res;
}

// ─── API Fetch Helpers ────────────────────────────────────────────────────────

/** Safely normalize a trade from backend, providing defaults for missing fields */
function normalizeTrade(raw: Record<string, unknown>): Trade {
  return {
    id: String(raw.id ?? ""),
    source: (raw.source as Trade["source"]) ?? undefined,
    ticker: raw.ticker != null ? String(raw.ticker) : undefined,
    asset: String(raw.asset ?? ""),
    floorStrike: Number(raw.floorStrike ?? 0),
    closeTime: String(raw.closeTime ?? ""),
    entryTimestamp: Number(raw.entryTimestamp ?? 0),
    settledAt: raw.settledAt != null ? Number(raw.settledAt) : null,
    regime: (raw.regime as Trade["regime"]) ?? "R1",
    direction: (raw.direction as Trade["direction"]) ?? "yes",
    entryPrice: Number(raw.entryPrice ?? 0),
    suggestedSize: Number(raw.suggestedSize ?? 1),
    modelProbability: Number(raw.modelProbability ?? 0),
    marketProbability: Number(raw.marketProbability ?? 0),
    ev: Number(raw.ev ?? 0),
    kellyFraction: Number(raw.kellyFraction ?? 0),
    confidence: Number(raw.confidence ?? 0),
    outcome: (raw.outcome as Trade["outcome"]) ?? "pending",
    pnlCents: raw.pnlCents != null ? Number(raw.pnlCents) : null,
    pnlTotal: raw.pnlTotal != null ? Number(raw.pnlTotal) : null,
    finalCryptoPrice: raw.finalCryptoPrice != null ? Number(raw.finalCryptoPrice) : null,
    isLive: raw.isLive === true,
    orderId: raw.orderId != null ? String(raw.orderId) : undefined,
    liveCount: raw.liveCount != null ? Number(raw.liveCount) : undefined,
  };
}

// Stats, trades, and logs go through Vercel API proxy routes to avoid CORS.
// Browser calls /api/* (same origin), Vercel server calls Railway server-to-server.
export async function getStats(): Promise<Stats> {
  const res = await timedFetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/stats returned ${res.status}`);
  return res.json();
}

export async function getTrades(): Promise<Trade[]> {
  const res = await timedFetch("/api/trades", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/trades returned ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTrade);
}

export async function getLogs(): Promise<LogsResponse> {
  const empty: LogsResponse = { logs: [], meta: { count: 0, lastTimestamp: null } };
  try {
    const res = await timedFetch("/api/logs", { cache: "no-store" });
    if (!res.ok) return empty;
    const data = await res.json();

    // Standard format: { logs: string[], meta: { count, lastTimestamp } }
    if (data?.logs && Array.isArray(data.logs)) {
      return {
        logs: data.logs as string[],
        meta: {
          count:         Number(data.meta?.count         ?? data.logs.length),
          lastTimestamp: (data.meta?.lastTimestamp as string | null) ?? null,
        },
      };
    }

    // Legacy fallback: bare array
    if (Array.isArray(data)) {
      return { logs: data as string[], meta: { count: data.length, lastTimestamp: null } };
    }

    return empty;
  } catch {
    return empty;
  }
}

export async function getBalance(): Promise<AccountBalance> {
  const res = await timedFetch("/api/balance", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/balance returned ${res.status}`);
  return res.json();
}

export async function getFills(): Promise<KalshiFill[]> {
  const res = await timedFetch("/api/fills", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/fills returned ${res.status}`);
  return res.json();
}

export async function getHealth(): Promise<BackendHealth> {
  const res = await fetch("/api/health", { cache: "no-store" });
  const data = await res.json();
  return data as BackendHealth;
}

export async function getStatus(): Promise<BackendStatus | null> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as BackendStatus;
  } catch {
    return null;
  }
}

// ─── Fee Awareness ────────────────────────────────────────────────────────────

/** Note displayed alongside PnL figures to disclose that Kalshi fees are not deducted. */
export const KALSHI_FEE_NOTE = "Gross PnL — Kalshi exchange fees not included";

// ─── Market Price / Outcome Derivation ────────────────────────────────────────

export async function getMarketPrice(ticker: string): Promise<KalshiMarketPrice | null> {
  try {
    const res = await fetch(`/api/market?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.market ?? null) as KalshiMarketPrice | null;
  } catch {
    return null;
  }
}

/**
 * Derive trade outcome directly from Kalshi's authoritative market result.
 *
 * Priority order:
 *   1. Kalshi market `result` (authoritative — exchange has settled the market)
 *   2. Backend paper outcome (fallback when Kalshi data unavailable)
 *   3. Age-based heuristic (error if market should have settled by now)
 *
 * Returns "error" when the market should be settled but no outcome is available.
 */
export function deriveOutcome(
  side: "yes" | "no",
  createdTime: string,
  mp: KalshiMarketPrice | undefined,
  paperOutcome?: "win" | "loss" | "pending"
): "win" | "loss" | "pending" | "error" {
  // 1. Kalshi market data is the single source of truth when available
  if (mp && mp.status === "determined" && mp.result) {
    return side === mp.result ? "win" : "loss";
  }

  // 2. Fall back to backend paper outcome only when Kalshi data is absent
  if (!mp && (paperOutcome === "win" || paperOutcome === "loss")) {
    return paperOutcome;
  }

  // 3. If no data and the market is old enough, flag as error
  if (!mp) {
    const ageMs = Date.now() - new Date(createdTime).getTime();
    return ageMs > 20 * 60_000 ? "error" : "pending";
  }

  return "pending";
}

/**
 * Calculate actual PnL in USD from fill price and Kalshi-derived outcome.
 * Returns null for pending or error outcomes.
 */
export function derivePnlUSD(
  fillPrice: number,
  count: number,
  outcome: "win" | "loss" | "pending" | "error"
): number | null {
  if (outcome === "pending" || outcome === "error") return null;
  return ((outcome === "win" ? 100 : 0) - fillPrice) * count / 100;
}

// ─── Price Feeds (public exchange APIs, called client-side) ───────────────────

export interface ExchangePrice {
  exchange: string;
  symbol: string;
  price: number;
}

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
};

const COINBASE_PAIRS: Record<string, string> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SOL: "SOL-USD",
  XRP: "XRP-USD",
};

const KRAKEN_PAIRS: Record<string, string> = {
  BTC: "XXBTZUSD",
  ETH: "XETHZUSD",
  SOL: "SOLUSD",
  XRP: "XXRPZUSD",
};

export async function getBinancePrices(): Promise<ExchangePrice[]> {
  const symbols = Object.values(BINANCE_SYMBOLS);
  const query = encodeURIComponent(JSON.stringify(symbols));
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbols=${query}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Binance fetch failed");
  const data: { symbol: string; price: string }[] = await res.json();

  return Object.entries(BINANCE_SYMBOLS).map(([asset, sym]) => {
    const found = data.find((d) => d.symbol === sym);
    return {
      exchange: "Binance",
      symbol: asset,
      price: found ? parseFloat(found.price) : 0,
    };
  });
}

export async function getCoinbasePrices(): Promise<ExchangePrice[]> {
  const results = await Promise.allSettled(
    Object.entries(COINBASE_PAIRS).map(async ([asset, pair]) => {
      const res = await fetch(
        `https://api.coinbase.com/v2/prices/${pair}/spot`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      return {
        exchange: "Coinbase",
        symbol: asset,
        price: parseFloat(json.data.amount),
      } as ExchangePrice;
    })
  );
  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<ExchangePrice>).value);
}

export async function getKrakenPrices(): Promise<ExchangePrice[]> {
  const pairs = Object.values(KRAKEN_PAIRS).join(",");
  const res = await fetch(
    `https://api.kraken.com/0/public/Ticker?pair=${pairs}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Kraken fetch failed");
  const json = await res.json();
  const krakenData = json.result || {};

  return Object.entries(KRAKEN_PAIRS).map(([asset, krakenPair]) => {
    const entry = krakenData[krakenPair];
    return {
      exchange: "Kraken",
      symbol: asset,
      price: entry ? parseFloat(entry.c[0]) : 0,
    };
  });
}
