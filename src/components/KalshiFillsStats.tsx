"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { getFills, getTrades, getMarketPrice, deriveOutcome, derivePnlUSD, KALSHI_FEE_NOTE, type KalshiFill, type Trade, type KalshiMarketPrice } from "@/lib/api";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  AlertCircle,
  AlertTriangle,
  Zap,
} from "lucide-react";
import DataSourceFooter from "@/components/DataSourceFooter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichedFill extends KalshiFill {
  fillPrice: number;
  capitalUSD: number;
  paperTrade: Trade | null;
  slippage: number | null;
}

type ColorVariant = "profit" | "loss" | "accent" | "neutral" | "violet";

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  color?: ColorVariant;
  icon?: React.ReactNode;
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

const V = "#8B5CF6";

function MetricCard({ label, value, sub, color = "violet", icon }: CardProps) {
  const valueColor =
    color === "profit"
      ? "text-profit"
      : color === "loss"
        ? "text-loss"
        : color === "accent"
          ? "text-accent"
          : color === "neutral"
            ? "text-text"
            : undefined; // violet uses inline style

  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted">{icon}</span>}
        <span
          className="section-label"
          style={{ marginBottom: 0, color: "rgba(139,92,246,0.7)" }}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-2xl font-semibold font-mono tracking-tight ${valueColor ?? ""}`}
        style={!valueColor ? { color: V } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// ─── Market price hook ────────────────────────────────────────────────────────

function useMarketPrices(tickers: string[]): Map<string, KalshiMarketPrice> {
  const key = tickers.length ? `market-prices:${[...tickers].sort().join(",")}` : null;
  const { data } = useSWR<Map<string, KalshiMarketPrice>>(
    key,
    async () => {
      const pairs = await Promise.all(
        tickers.map((t) => getMarketPrice(t).then((p) => [t, p] as const))
      );
      return new Map(pairs.filter((pair): pair is [string, KalshiMarketPrice] => pair[1] !== null));
    },
    { refreshInterval: 5_000, revalidateOnFocus: false }
  );
  return data ?? new Map();
}

// ─── Stats computation ────────────────────────────────────────────────────────

export function buildEnrichedFills(fills: KalshiFill[], trades: Trade[]): EnrichedFill[] {
  const byOrderId = new Map<string, Trade>(
    trades
      .filter((t): t is Trade & { orderId: string } => t.isLive === true && !!t.orderId)
      .map((t) => [t.orderId, t])
  );
  return fills.map((fill): EnrichedFill => {
    const fillPrice = fill.side === "yes" ? fill.yes_price : fill.no_price;
    const fillYesEq = fill.side === "yes" ? fill.yes_price : 100 - fill.no_price;
    const pt = byOrderId.get(fill.order_id) ?? null;
    return {
      ...fill,
      fillPrice,
      capitalUSD: (fillPrice * fill.count) / 100,
      paperTrade: pt,
      slippage: pt !== null ? fillYesEq - pt.entryPrice : null,
    };
  });
}

function computeEnrichedStats(
  enrichedFills: EnrichedFill[],
  marketPrices: Map<string, KalshiMarketPrice>
) {
  const totalFills = enrichedFills.length;

  // Returns gross PnL in cents for a settled fill, or null if not yet settled.
  // Fix: previously returned 0 for unsettled trades which could silently corrupt aggregates.
  const pnlCentsForFill = (f: EnrichedFill): number | null => {
    const outcome = deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.outcome ?? f.paperTrade?.outcome);
    const pnlUSD = derivePnlUSD(f.fillPrice, f.count, outcome, f.pnl_gross_cents);
    return pnlUSD !== null ? pnlUSD * 100 : null;
  };

  const settled = enrichedFills.filter((f) => {
    const outcome = deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.outcome ?? f.paperTrade?.outcome);
    return outcome === "win" || outcome === "loss";
  });
  const wins = settled.filter((f) =>
    deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.outcome ?? f.paperTrade?.outcome) === "win"
  );
  const lossesCount = settled.length - wins.length;

  // Sum only non-null PnL values (settled fills guaranteed to return non-null)
  const realizedPnlUSD = settled.reduce((s, f) => s + (pnlCentsForFill(f) ?? 0), 0) / 100;

  const winRate = settled.length > 0 ? wins.length / settled.length : null;

  const matched = enrichedFills.filter((f) => f.paperTrade !== null);
  const avgEVCents =
    matched.length > 0
      ? matched.reduce((s, f) => s + f.paperTrade!.ev, 0) / matched.length
      : null;

  const avgConfidence =
    matched.length > 0
      ? matched.reduce((s, f) => s + f.paperTrade!.confidence, 0) / matched.length
      : null;

  // Profit factor: ratio of gross winning PnL to gross losing PnL (both in cents).
  // Note: the ratio is unit-agnostic so cents vs dollars doesn't affect the result.
  const grossWinsCents = wins.reduce((s, f) => s + (pnlCentsForFill(f) ?? 0), 0);
  const grossLossesCents = Math.abs(
    settled
      .filter((f) => deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.outcome ?? f.paperTrade?.outcome) === "loss")
      .reduce((s, f) => s + (pnlCentsForFill(f) ?? 0), 0)
  );
  const profitFactor =
    grossLossesCents > 0 ? grossWinsCents / grossLossesCents : null;

  // Per-trade PnL array for distribution stats (settled fills only)
  const pnls = settled.map((f) => pnlCentsForFill(f) ?? 0);
  const bestTradePnl = pnls.length ? Math.max(...pnls) : 0;
  const worstTradePnl = pnls.length ? Math.min(...pnls) : 0;
  const mean = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  // Fix: use sample variance (N-1 / Bessel's correction) instead of population variance.
  // Population variance understates true variance with small trade counts, inflating Sharpe.
  const variance = pnls.length > 1
    ? pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pnls.length - 1)
    : 0;
  const sharpeApprox = variance > 0 ? mean / Math.sqrt(variance) : 0;

  return {
    totalFills,
    settledCount: settled.length,
    winsCount: wins.length,
    lossesCount,
    realizedPnlUSD,
    winRate,
    avgEVCents,
    avgConfidence,
    profitFactor,
    bestTradePnl,
    worstTradePnl,
    sharpeApprox,
    matchedCount: matched.length,
    pendingCount: enrichedFills.length - settled.length,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  hiddenIds: Set<string>;
}

export default function KalshiFillsStats({ hiddenIds }: Props) {
  const { data: fills, error: fillsError, isLoading } = useSWR<KalshiFill[]>(
    "kalshi-fills",
    getFills,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const { data: trades } = useSWR<Trade[]>(
    "trades-pnl",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  // Fetch Kalshi market data for all fill tickers to derive authoritative outcomes
  const allTickers = useMemo(
    () => Array.from(new Set((fills ?? []).map((f) => f.ticker))),
    [fills]
  );
  const marketPrices = useMarketPrices(allTickers);

  const enrichedAll = useMemo(
    () => buildEnrichedFills(fills ?? [], trades ?? []),
    [fills, trades]
  );

  const hiddenCount = useMemo(
    () => enrichedAll.filter((f) => hiddenIds.has(f.trade_id)).length,
    [enrichedAll, hiddenIds]
  );

  const stats = useMemo(() => {
    const visible = enrichedAll.filter((f) => !hiddenIds.has(f.trade_id));
    return computeEnrichedStats(visible, marketPrices);
  }, [enrichedAll, hiddenIds, marketPrices]);

  // Staleness: warn when the newest fill's created_time is over 24h old
  const fillsStale = useMemo(() => {
    if (!fills || fills.length === 0) return false;
    const newest = fills.reduce((best, f) => {
      const t = new Date(f.created_time).getTime();
      return t > best ? t : best;
    }, 0);
    return newest > 0 && Date.now() - newest > 24 * 60 * 60 * 1000;
  }, [fills]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="panel animate-pulse h-20 bg-panel" />
        ))}
      </div>
    );
  }

  if (fillsError) {
    return (
      <div className="panel flex items-center gap-2 text-loss text-sm">
        <AlertCircle size={16} />
        Failed to load account stats
      </div>
    );
  }

  const pnlColor: ColorVariant =
    stats.realizedPnlUSD > 0 ? "profit" : stats.realizedPnlUSD < 0 ? "loss" : "neutral";

  const winRateColor: ColorVariant =
    stats.winRate === null ? "neutral" : stats.winRate >= 0.5 ? "profit" : "loss";

  const pfColor: ColorVariant =
    stats.profitFactor === null
      ? "neutral"
      : stats.profitFactor >= 1.5
        ? "profit"
        : stats.profitFactor >= 1
          ? "neutral"
          : "loss";

  const pnlCents = stats.realizedPnlUSD * 100;
  const fmtUSD = (cents: number) => {
    const d = cents / 100;
    return d >= 0 ? `+$${d.toFixed(2)}` : `-$${Math.abs(d).toFixed(2)}`;
  };

  const cards: CardProps[] = [
    {
      label: "Total Trades",
      value: String(stats.totalFills),
      sub: `${stats.settledCount} settled`,
      color: "neutral",
      icon: <Activity size={12} />,
    },
    {
      label: "Wins",
      value: String(stats.winsCount),
      sub: "settled wins",
      color: "profit",
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Losses",
      value: String(stats.lossesCount),
      sub: "settled losses",
      color: stats.lossesCount > 0 ? "loss" : "neutral",
      icon: <TrendingDown size={12} />,
    },
    {
      label: "Win Rate",
      value: stats.winRate !== null ? `${(stats.winRate * 100).toFixed(1)}%` : "—",
      sub: "of settled trades",
      color: winRateColor,
    },
    {
      label: "Total PNL (Gross)",
      value: fmtUSD(pnlCents),
      sub: "fees not included",
      color: pnlColor,
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Avg EV",
      value: stats.avgEVCents !== null ? `${stats.avgEVCents.toFixed(2)}¢` : "—",
      sub: "per fill",
      color: stats.avgEVCents !== null && stats.avgEVCents > 0 ? "profit" : "neutral",
      icon: <Zap size={12} />,
    },
    {
      label: "Avg Confidence",
      value: stats.avgConfidence !== null ? `${stats.avgConfidence.toFixed(1)}%` : "—",
      sub: "model confidence",
      color: "violet",
    },
    {
      label: "Profit Factor",
      value: stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—",
      sub: "gross profit / loss",
      color: pfColor,
      icon: <Target size={12} />,
    },
    {
      label: "Sharpe Approx",
      value:
        stats.settledCount > 1 && stats.sharpeApprox !== 0
          ? stats.sharpeApprox.toFixed(2)
          : "—",
      sub: "risk-adjusted return",
      color: stats.sharpeApprox >= 1 ? "profit" : "neutral",
    },
    {
      label: "Best Trade",
      value: stats.settledCount > 0 ? fmtUSD(stats.bestTradePnl) : "—",
      sub: "highest single PNL",
      color: "profit",
      icon: <Award size={12} />,
    },
    {
      label: "Worst Trade",
      value: stats.settledCount > 0 ? fmtUSD(stats.worstTradePnl) : "—",
      sub: "lowest single PNL",
      color: stats.worstTradePnl < 0 ? "loss" : "neutral",
    },
    {
      label: "Settled Trades",
      value: String(stats.settledCount),
      sub: `${stats.pendingCount} pending`,
      color: "neutral",
    },
  ];

  return (
    <>
      {fillsStale && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded mb-3"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#F59E0B",
          }}
        >
          <AlertTriangle size={11} />
          Most recent fill is over 24h old — no recent trading activity detected
        </div>
      )}
      {hiddenCount > 0 && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded mb-3"
          style={{
            backgroundColor: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
            color: "#8B5CF6",
          }}
        >
          <AlertTriangle size={11} />
          {hiddenCount} hidden fill{hiddenCount !== 1 ? "s" : ""} excluded from stats below.
          Unhide to see full account performance.
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted opacity-60">
        <span>{KALSHI_FEE_NOTE}</span>
        <span className="ml-auto">Fills served from persistent DB — history survives redeploys</span>
      </div>
      <DataSourceFooter endpoint="/fills" recordCount={stats.totalFills} source="Persistent DB → Kalshi Portfolio API" />
    </>
  );
}
