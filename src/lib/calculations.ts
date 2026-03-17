import type {
  Trade, DashboardStats, AssetStats, SliceRow,
  EquityCurvePoint, CalibrationBucket, RollingEVPoint, Asset, VolRegime, MoneynessBucket
} from "./types";

const ASSETS: Asset[] = ["BTC", "ETH", "SOL", "XRP"];
const VOL_REGIMES: VolRegime[] = ["LOW", "MEDIUM", "HIGH"];
const MONEYNESS_BUCKETS: MoneynessBucket[] = ["ATM", "OTM1", "OTM2", "DEEP"];

function settledTrades(trades: Trade[]): Trade[] {
  return trades.filter(t => t.outcome === "WIN" || t.outcome === "LOSS");
}

/** Brier score: mean((p_model - outcome_binary)²) over settled trades */
export function brierScore(trades: Trade[]): number {
  const s = settledTrades(trades).filter(t => t.brier_contribution !== null);
  if (!s.length) return 0;
  return s.reduce((sum, t) => sum + (t.brier_contribution ?? 0), 0) / s.length;
}

/** Annualized Sharpe from daily P&L (using settled trades grouped by date) */
export function sharpeRatio(trades: Trade[]): number {
  const s = settledTrades(trades);
  if (s.length < 2) return 0;
  // Group net P&L by date
  const byDate: Record<string, number> = {};
  for (const t of s) {
    const date = t.timestamp_entry.slice(0, 10);
    byDate[date] = (byDate[date] ?? 0) + (t.pnl_net ?? 0);
  }
  const dailyPnl = Object.values(byDate);
  if (dailyPnl.length < 2) return 0;
  const mean = dailyPnl.reduce((a, b) => a + b, 0) / dailyPnl.length;
  const variance = dailyPnl.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (dailyPnl.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252); // annualized
}

export function maxDrawdown(trades: Trade[]): { allTime: number; current: number } {
  const s = settledTrades(trades).sort(
    (a, b) => new Date(a.timestamp_entry).getTime() - new Date(b.timestamp_entry).getTime()
  );
  if (!s.length) return { allTime: 0, current: 0 };
  let peak = 0, cumPnl = 0, maxDD = 0, currentDD = 0;
  for (const t of s) {
    cumPnl += t.pnl_net ?? 0;
    if (cumPnl > peak) { peak = cumPnl; currentDD = 0; }
    else { currentDD = peak - cumPnl; }
    if (currentDD > maxDD) maxDD = currentDD;
  }
  return { allTime: maxDD, current: currentDD };
}

export function buildEquityCurve(trades: Trade[], initialBankroll = 500): EquityCurvePoint[] {
  const sorted = [...settledTrades(trades)].sort(
    (a, b) => new Date(a.timestamp_entry).getTime() - new Date(b.timestamp_entry).getTime()
  );
  const points: EquityCurvePoint[] = [];
  let cumPnl = 0, peak = 0;
  const recent: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    cumPnl += t.pnl_net ?? 0;
    if (cumPnl > peak) peak = cumPnl;
    const isDrawdown = cumPnl < peak;

    recent.push(t.outcome === "WIN" ? 1 : 0);
    if (recent.length > 20) recent.shift();
    const wr20 = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;

    const d = new Date(t.timestamp_entry);
    const label = `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;

    points.push({
      t: t.timestamp_entry,
      label,
      pnl: cumPnl,
      pnlPct: (cumPnl / initialBankroll) * 100,
      wr20,
      isDrawdown,
    });
  }
  return points;
}

export function buildCalibrationData(trades: Trade[]): CalibrationBucket[] {
  const s = settledTrades(trades);
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const lo = i / 10, hi = (i + 1) / 10;
    const mid = (lo + hi) / 2;
    const inBucket = s.filter(t => t.p_model >= lo && t.p_model < hi);
    const wins = inBucket.filter(t => t.outcome === "WIN").length;
    const actualRate = inBucket.length > 0 ? wins / inBucket.length : mid;
    buckets.push({
      bucket: `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`,
      modelMid: mid,
      actualRate,
      count: inBucket.length,
    });
  }
  return buckets;
}

export function buildRollingEV(trades: Trade[]): RollingEVPoint[] {
  const sorted = [...settledTrades(trades)].sort(
    (a, b) => new Date(a.timestamp_entry).getTime() - new Date(b.timestamp_entry).getTime()
  );
  const WINDOW = 100;
  return sorted.map((_, i) => {
    const windowTrades = sorted.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const avgEntered = windowTrades.reduce((s, t) => s + t.ev_entered, 0) / windowTrades.length;
    const realized = windowTrades.filter(t => t.ev_realized !== null);
    const avgRealized = realized.length > 0
      ? realized.reduce((s, t) => s + (t.ev_realized ?? 0), 0) / realized.length
      : avgEntered;
    return {
      idx: i + 1,
      label: `T-${sorted.length - i}`,
      avgEntered,
      avgRealized,
      divergence: avgRealized - avgEntered,
    };
  });
}

function computeSliceRows<T extends string>(
  trades: Trade[],
  keys: T[],
  getter: (t: Trade) => T
): SliceRow[] {
  return keys.map(key => {
    const group = trades.filter(t => getter(t) === key);
    const settled = group.filter(t => t.outcome === "WIN" || t.outcome === "LOSS");
    const wins = settled.filter(t => t.outcome === "WIN").length;
    const winRate = settled.length > 0 ? wins / settled.length : 0;
    const netPnl = settled.reduce((s, t) => s + (t.pnl_net ?? 0), 0);
    const avgEvEntered = group.length > 0
      ? group.reduce((s, t) => s + t.ev_entered, 0) / group.length : 0;
    const withRealized = settled.filter(t => t.ev_realized !== null);
    const avgEvRealized = withRealized.length > 0
      ? withRealized.reduce((s, t) => s + (t.ev_realized ?? 0), 0) / withRealized.length : 0;
    const withBrier = settled.filter(t => t.brier_contribution !== null);
    const brier = withBrier.length > 0
      ? withBrier.reduce((s, t) => s + (t.brier_contribution ?? 0), 0) / withBrier.length : 0;
    return { label: key, trades: group.length, winRate, netPnl, avgEvEntered, avgEvRealized, brierScore: brier };
  });
}

export function computeStats(trades: Trade[]): DashboardStats {
  const settled = settledTrades(trades);
  const wins = settled.filter(t => t.outcome === "WIN");
  const last50settled = settled.slice(-50);
  const last50wins = last50settled.filter(t => t.outcome === "WIN");
  const openPositions = trades.filter(t => t.outcome === "OPEN").length;

  const lastSettled = settled[settled.length - 1];
  const lastOpen = trades.filter(t => t.outcome === "OPEN").slice(-1)[0];
  const bankroll = lastSettled?.bankroll_after ?? lastOpen?.bankroll_at_entry ?? 500;

  const totalPnl = settled.reduce((s, t) => s + (t.pnl_net ?? 0), 0);
  const winRate = settled.length > 0 ? wins.length / settled.length : 0;
  const winRateLast50 = last50settled.length > 0 ? last50wins.length / last50settled.length : 0;

  const withEvR = settled.filter(t => t.ev_realized !== null);
  const avgEvEntered = settled.length > 0
    ? settled.reduce((s, t) => s + t.ev_entered, 0) / settled.length : 0;
  const avgEvRealized = withEvR.length > 0
    ? withEvR.reduce((s, t) => s + (t.ev_realized ?? 0), 0) / withEvR.length : 0;

  const perAsset: AssetStats[] = ASSETS.map(asset => {
    const g = trades.filter(t => t.asset === asset);
    const gs = g.filter(t => t.outcome === "WIN" || t.outcome === "LOSS");
    const gw = gs.filter(t => t.outcome === "WIN");
    const withBrier = gs.filter(t => t.brier_contribution !== null);
    return {
      asset,
      trades: g.length,
      wins: gw.length,
      losses: gs.length - gw.length,
      winRate: gs.length > 0 ? gw.length / gs.length : 0,
      netPnl: gs.reduce((s, t) => s + (t.pnl_net ?? 0), 0),
      avgEvEntered: g.length > 0 ? g.reduce((s, t) => s + t.ev_entered, 0) / g.length : 0,
      avgSpread: g.length > 0 ? g.reduce((s, t) => s + t.spread, 0) / g.length : 0,
      avgSigmaEwmaAnn: g.length > 0 ? g.reduce((s, t) => s + t.sigma_ewma_ann, 0) / g.length : 0,
      brierScore: withBrier.length > 0 ? withBrier.reduce((s, t) => s + (t.brier_contribution ?? 0), 0) / withBrier.length : 0,
      yesCount: g.filter(t => t.direction === "YES").length,
      noCount: g.filter(t => t.direction === "NO").length,
    };
  });

  const volRegimeTable = computeSliceRows(trades, VOL_REGIMES, t => t.vol_regime);
  const moneynessTable = computeSliceRows(trades, MONEYNESS_BUCKETS, t => t.moneyness_bucket);
  const dd = maxDrawdown(trades);

  return {
    totalPnl,
    winRate,
    winRateLast50,
    totalTrades: trades.length,
    openPositions,
    bankroll,
    sharpeRatio: sharpeRatio(trades),
    maxDrawdownAllTime: dd.allTime,
    maxDrawdownCurrent: dd.current,
    brierScore: brierScore(trades),
    avgEvEntered,
    avgEvRealized,
    perAsset,
    volRegimeTable,
    moneynessTable,
  };
}
