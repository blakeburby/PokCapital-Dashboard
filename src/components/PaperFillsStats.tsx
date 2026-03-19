"use client";

import useSWR from "swr";
import { getPaperStats, type Stats } from "@/lib/api";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  AlertCircle,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ColorVariant = "profit" | "loss" | "accent" | "neutral" | "amber";

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  color?: ColorVariant;
  icon?: React.ReactNode;
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

const A = "#F59E0B"; // amber-500

function MetricCard({ label, value, sub, color = "amber", icon }: CardProps) {
  const valueColor =
    color === "profit"
      ? "text-profit"
      : color === "loss"
        ? "text-loss"
        : color === "accent"
          ? "text-accent"
          : color === "neutral"
            ? "text-text"
            : undefined; // amber uses inline style

  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted">{icon}</span>}
        <span
          className="section-label"
          style={{ marginBottom: 0, color: "rgba(245,158,11,0.7)" }}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-2xl font-semibold font-mono tracking-tight ${valueColor ?? ""}`}
        style={!valueColor ? { color: A } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaperFillsStats() {
  const { data: stats, error, isLoading } = useSWR<Stats>(
    "paper-stats",
    getPaperStats,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="panel animate-pulse h-20 bg-panel" />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="panel flex items-center gap-2 text-loss text-sm">
        <AlertCircle size={16} />
        Failed to load paper trading stats
      </div>
    );
  }

  const fmtUSD = (cents: number) => {
    const d = cents / 100;
    return d >= 0 ? `+$${d.toFixed(2)}` : `-$${Math.abs(d).toFixed(2)}`;
  };

  const pnlColor: ColorVariant =
    stats.totalPnlCents > 0 ? "profit" : stats.totalPnlCents < 0 ? "loss" : "neutral";

  const winRateColor: ColorVariant =
    stats.settledTrades === 0 ? "neutral" : stats.winRate >= 0.5 ? "profit" : "loss";

  const pfColor: ColorVariant =
    stats.profitFactor === 0
      ? "neutral"
      : stats.profitFactor >= 1.5
        ? "profit"
        : stats.profitFactor >= 1
          ? "neutral"
          : "loss";

  const pendingCount = stats.totalTrades - stats.settledTrades;

  const cards: CardProps[] = [
    {
      label: "Total Trades",
      value: String(stats.totalTrades),
      sub: `${stats.settledTrades} settled`,
      color: "neutral",
      icon: <Activity size={12} />,
    },
    {
      label: "Wins",
      value: String(stats.wins),
      sub: "settled wins",
      color: "profit",
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Losses",
      value: String(stats.losses),
      sub: "settled losses",
      color: stats.losses > 0 ? "loss" : "neutral",
      icon: <TrendingDown size={12} />,
    },
    {
      label: "Win Rate",
      value: stats.settledTrades > 0 ? `${(stats.winRate * 100).toFixed(1)}%` : "—",
      sub: "of settled trades",
      color: winRateColor,
    },
    {
      label: "Total PNL",
      value: fmtUSD(stats.totalPnlCents),
      sub: `${stats.totalPnlCents >= 0 ? "+" : ""}${(stats.totalPnlCents / 100).toFixed(2)} USD`,
      color: pnlColor,
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Avg EV",
      value: stats.avgEvCents !== 0 ? `${stats.avgEvCents.toFixed(2)}¢` : "—",
      sub: "per trade",
      color: stats.avgEvCents > 0 ? "profit" : "neutral",
      icon: <Zap size={12} />,
    },
    {
      label: "Avg Confidence",
      value: stats.avgConfidence !== 0 ? `${stats.avgConfidence.toFixed(1)}%` : "—",
      sub: "model confidence",
      color: "amber",
    },
    {
      label: "Profit Factor",
      value: stats.profitFactor !== 0 && isFinite(stats.profitFactor)
        ? stats.profitFactor.toFixed(2)
        : "—",
      sub: "gross profit / loss",
      color: pfColor,
      icon: <Target size={12} />,
    },
    {
      label: "Sharpe Approx",
      value:
        stats.settledTrades > 1 && stats.sharpeApprox !== 0
          ? stats.sharpeApprox.toFixed(2)
          : "—",
      sub: "risk-adjusted return",
      color: stats.sharpeApprox >= 1 ? "profit" : "neutral",
    },
    {
      label: "Best Trade",
      value: stats.settledTrades > 0 ? fmtUSD(stats.bestTradePnl) : "—",
      sub: "highest single PNL",
      color: "profit",
      icon: <Award size={12} />,
    },
    {
      label: "Worst Trade",
      value: stats.settledTrades > 0 ? fmtUSD(stats.worstTradePnl) : "—",
      sub: "lowest single PNL",
      color: stats.worstTradePnl < 0 ? "loss" : "neutral",
    },
    {
      label: "Pending",
      value: String(pendingCount),
      sub: "awaiting settlement",
      color: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {cards.map((c) => (
        <MetricCard key={c.label} {...c} />
      ))}
    </div>
  );
}
