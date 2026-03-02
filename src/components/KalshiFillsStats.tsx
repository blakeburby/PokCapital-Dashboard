"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { getFills, getTrades, type KalshiFill, type Trade } from "@/lib/api";
import {
  Activity,
  DollarSign,
  Hash,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichedFill extends KalshiFill {
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

// ─── Stats computation ────────────────────────────────────────────────────────

function buildEnrichedFills(fills: KalshiFill[], trades: Trade[]): EnrichedFill[] {
  const byOrderId = new Map<string, Trade>(
    trades
      .filter((t): t is Trade & { orderId: string } => t.isLive === true && !!t.orderId)
      .map((t) => [t.orderId, t])
  );
  return fills.map((fill): EnrichedFill => {
    const fillPrice = fill.side === "yes" ? fill.yes_price : fill.no_price;
    const pt = byOrderId.get(fill.order_id) ?? null;
    return {
      ...fill,
      fillPrice,
      capitalUSD: (fillPrice * fill.count) / 100,
      paperTrade: pt,
      slippage: pt !== null ? fillPrice - pt.entryPrice : null,
    };
  });
}

function computeEnrichedStats(enrichedFills: EnrichedFill[]) {
  const totalFills = enrichedFills.length;
  const totalContracts = enrichedFills.reduce((s, f) => s + f.count, 0);
  const totalDeployedUSD = enrichedFills.reduce((s, f) => s + f.capitalUSD, 0);

  const matched = enrichedFills.filter((f) => f.paperTrade !== null);
  const settled = matched.filter(
    (f) => f.paperTrade!.outcome !== "pending" && f.paperTrade!.pnlTotal != null
  );
  const wins = settled.filter((f) => f.paperTrade!.outcome === "win");
  const losses = settled.filter((f) => f.paperTrade!.outcome === "loss");

  const realizedPnlUSD =
    settled.reduce((s, f) => s + (f.paperTrade!.pnlTotal ?? 0), 0) / 100;

  const winRate = settled.length > 0 ? wins.length / settled.length : null;

  const avgEVCents =
    matched.length > 0
      ? matched.reduce((s, f) => s + f.paperTrade!.ev, 0) / matched.length
      : null;

  const avgSlippageCents =
    matched.length > 0
      ? matched.reduce((s, f) => s + (f.slippage ?? 0), 0) / matched.length
      : null;

  const grossWinsCents = wins.reduce((s, f) => s + (f.paperTrade!.pnlTotal ?? 0), 0);
  const grossLossesCents = Math.abs(
    losses.reduce((s, f) => s + (f.paperTrade!.pnlTotal ?? 0), 0)
  );
  const profitFactor =
    grossLossesCents > 0 ? grossWinsCents / grossLossesCents : null;

  return {
    totalFills,
    totalContracts,
    totalDeployedUSD,
    realizedPnlUSD,
    winRate,
    avgEVCents,
    avgSlippageCents,
    profitFactor,
    matchedCount: matched.length,
    settledCount: settled.length,
    winsCount: wins.length,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KalshiFillsStats() {
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

  const stats = useMemo(() => {
    const enriched = buildEnrichedFills(fills ?? [], trades ?? []);
    return computeEnrichedStats(enriched);
  }, [fills, trades]);

  if (isLoading) {
    return (
      <div>
        <p className="section-label">Account Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="panel animate-pulse h-20 bg-panel" />
          ))}
        </div>
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
    stats.realizedPnlUSD > 0
      ? "profit"
      : stats.realizedPnlUSD < 0
      ? "loss"
      : "neutral";

  const winRateColor: ColorVariant =
    stats.winRate === null
      ? "neutral"
      : stats.winRate >= 0.5
      ? "profit"
      : "loss";

  const slippageColor: ColorVariant =
    stats.avgSlippageCents === null
      ? "neutral"
      : stats.avgSlippageCents > 0
      ? "loss"   // overpaid = bad
      : "profit"; // saved = good

  const pfColor: ColorVariant =
    stats.profitFactor === null
      ? "neutral"
      : stats.profitFactor >= 1.5
      ? "profit"
      : stats.profitFactor >= 1
      ? "neutral"
      : "loss";

  const cards: CardProps[] = [
    {
      label: "Total Fills",
      value: String(stats.totalFills),
      sub: "executed fill events",
      color: "neutral",
      icon: <Activity size={12} />,
    },
    {
      label: "Contracts Filled",
      value: String(stats.totalContracts),
      sub: `${stats.matchedCount} with model context`,
      color: "neutral",
      icon: <Hash size={12} />,
    },
    {
      label: "Realized PNL",
      value:
        stats.realizedPnlUSD >= 0
          ? `+$${stats.realizedPnlUSD.toFixed(2)}`
          : `-$${Math.abs(stats.realizedPnlUSD).toFixed(2)}`,
      sub: `${stats.settledCount} settled trades`,
      color: pnlColor,
      icon: <DollarSign size={12} />,
    },
    {
      label: "Win Rate",
      value:
        stats.winRate !== null ? `${(stats.winRate * 100).toFixed(1)}%` : "—",
      sub:
        stats.settledCount > 0
          ? `${stats.winsCount} wins / ${stats.settledCount} settled`
          : "no settled trades",
      color: winRateColor,
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Total Deployed",
      value: `$${stats.totalDeployedUSD.toFixed(2)}`,
      sub: "capital deployed",
      color: "neutral",
      icon: <DollarSign size={12} />,
    },
    {
      label: "Avg EV/ct",
      value:
        stats.avgEVCents !== null
          ? `${stats.avgEVCents >= 0 ? "+" : ""}${stats.avgEVCents.toFixed(1)}¢`
          : "—",
      sub: `${stats.matchedCount} matched fills`,
      color:
        stats.avgEVCents === null
          ? "neutral"
          : stats.avgEVCents > 0
          ? "profit"
          : "neutral",
      icon: <Zap size={12} />,
    },
    {
      label: "Avg Slippage",
      value:
        stats.avgSlippageCents !== null
          ? `${stats.avgSlippageCents >= 0 ? "+" : ""}${stats.avgSlippageCents.toFixed(1)}¢`
          : "—",
      sub: "vs model entry price",
      color: slippageColor,
      icon: <TrendingDown size={12} />,
    },
    {
      label: "Profit Factor",
      value: stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—",
      sub: "gross wins / losses",
      color: pfColor,
      icon: <Target size={12} />,
    },
  ];

  return (
    <div>
      <p className="section-label">Account Overview</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
