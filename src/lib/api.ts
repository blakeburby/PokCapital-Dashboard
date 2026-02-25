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

export interface Trade {
  id: string;
  asset: string;
  floorStrike: number;
  closeTime: string;
  entryTimestamp: number;
  regime: string;
  direction: "yes" | "no";
  entryPrice: number;
  modelProbability: number;
  marketProbability: number;
  ev: number;
  confidence: number;
  outcome: "win" | "loss" | "pending";
  pnlCents: number | null;
  isLive?: boolean;
  orderId?: string;
}

// Stats, trades, and logs go through Vercel API proxy routes to avoid CORS.
// Browser calls /api/* (same origin), Vercel server calls Railway server-to-server.
export async function getStats(): Promise<Stats> {
  const res = await fetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/stats returned ${res.status}`);
  return res.json();
}

export async function getTrades(): Promise<Trade[]> {
  const res = await fetch("/api/trades", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/trades returned ${res.status}`);
  return res.json();
}

export async function getLogs(): Promise<string[]> {
  try {
    const res = await fetch("/api/logs", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.logs)) return data.logs as string[];
    if (Array.isArray(data)) return data as string[];
    return [];
  } catch {
    return [];
  }
}

// --- Price feeds (public exchange APIs, called client-side) ---

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
