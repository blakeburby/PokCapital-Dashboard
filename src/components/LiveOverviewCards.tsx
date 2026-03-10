"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { getTrades, type Trade } from "@/lib/api";
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
import DataSourceFooter from "@/components/DataSourceFooter";

// ─── Types ────────────────────────────────────────────────────────────────────

type ColorVariant = "profit" | "loss" | "accent" | "neutral" | "green";

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  color?: ColorVariant;
  icon?: React.ReactNode;
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

const G = "#10B981"; // emerald-500

function MetricCard({ label, value, sub, color = "green", icon }: CardProps) {
  const valueColor =
    color === "profit"
      ? "text-profit"
      : color === "loss"
        ? "text-loss"
        : color === "accent"
          ? "text-accent"
          : color === "neutral"
            ? "text-text"
            : undefined; // green uses inline style

  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted">{icon}</span>}
        <span
          className="section-label"
          style={{ marginBottom: 0, color: "rgba(16,185,129,0.7)" }}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-2xl font-semibold font-mono tracking-tight ${valueColor ?? ""}`}
        style={!valueColor ? { color: G } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// ─── Stats computation ────────────────────────────────────────────────────────

function computeStats(trades: Trade[]) {
  const totalTrades = trades.length;
  const settled = trades.filter(
    (t) => t.outcome !== "pending" && t.pnlTotal != null
  );
  const wins = settled.filter((t) => t.outcome === "win");
  const losses = settled.filter((t) => t.outcome === "loss");

  const realizedPnlUSD =
    settled.reduce((s, t) => s + (t.pnlTotal ?? 0), 0) / 100;

  const winRate = settled.length > 0 ? wins.length / settled.length : null;

  const totalDeployedUSD = trades.reduce((s, t) => {
    const qty = t.liveCount ?? t.suggestedSize ?? 1;
    return s + (t.entryPrice * qty) / 100;
  }, 0);

  const avgEVCents =
    trades.length > 0
      ? trades.reduce((s, t) => s + t.ev, 0) / trades.length
      : null;

  const avgConfidence =
    trades.length > 0
      ? trades.reduce((s, t) => s + t.confidence, 0) / trades.length
      : null;

  const grossWinsCents = wins.reduce((s, t) => s + (t.pnlTotal ?? 0), 0);
  const grossLossesCents = Math.abs(
    losses.reduce((s, t) => s + (t.pnlTotal ?? 0), 0)
  );
  const profitFactor =
    grossLossesCents > 0 ? grossWinsCents / grossLossesCents : null;

  return {
    totalTrades,
    settledCount: settled.length,
    winsCount: wins.length,
    realizedPnlUSD,
    winRate,
    totalDeployedUSD,
    avgEVCents,
    avgConfidence,
    profitFactor,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  hiddenIds: Set<string>;
}

export default function LiveOverviewCards({ hiddenIds }: Props) {
  const { data: trades, error, isLoading } = useSWR<Trade[]>(
    "trades-pnl",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const stats = useMemo(() => {
    const live = (trades ?? []).filter(
      (t) => t.isLive === true && !hiddenIds.has(t.id)
    );
    return computeStats(live);
  }, [trades, hiddenIds]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="panel animate-pulse h-20 bg-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex items-center gap-2 text-loss text-sm">
        <AlertCircle size={16} />
        Failed to load live trade stats
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
      label: "Total Trades",
      value: String(stats.totalTrades),
      sub: "live orders placed",
      color: "neutral",
      icon: <Activity size={12} />,
    },
    {
      label: "Settled",
      value: String(stats.settledCount),
      sub: `${stats.winsCount} wins`,
      color: "neutral",
      icon: <Hash size={12} />,
    },
    {
      label: "Realized PNL",
      value:
        stats.realizedPnlUSD >= 0
          ? `+$${stats.realizedPnlUSD.toFixed(2)}`
          : `-$${Math.abs(stats.realizedPnlUSD).toFixed(2)}`,
      sub: `${stats.settledCount} settled`,
      color: pnlColor,
      icon: <DollarSign size={12} />,
    },
    {
      label: "Win Rate",
      value:
        stats.winRate !== null ? `${(stats.winRate * 100).toFixed(1)}%` : "—",
      sub:
        stats.settledCount > 0
          ? `${stats.winsCount}W / ${stats.settledCount - stats.winsCount}L`
          : "no settled trades",
      color: winRateColor,
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Total Deployed",
      value: `$${stats.totalDeployedUSD.toFixed(2)}`,
      sub: "model capital",
      color: "neutral",
      icon: <DollarSign size={12} />,
    },
    {
      label: "Avg EV/ct",
      value:
        stats.avgEVCents !== null
          ? `${stats.avgEVCents >= 0 ? "+" : ""}${stats.avgEVCents.toFixed(1)}¢`
          : "—",
      sub: `${stats.totalTrades} trades`,
      color:
        stats.avgEVCents === null
          ? "neutral"
          : stats.avgEVCents > 0
            ? "profit"
            : "neutral",
      icon: <Zap size={12} />,
    },
    {
      label: "Avg Confidence",
      value:
        stats.avgConfidence !== null
          ? `${stats.avgConfidence.toFixed(1)}%`
          : "—",
      sub: "model confidence",
      color: "neutral",
      icon: <TrendingDown size={12} />,
    },
    {
      label: "Profit Factor",
      value:
        stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—",
      sub: "gross wins / losses",
      color: pfColor,
      icon: <Target size={12} />,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
      <DataSourceFooter endpoint="/trades" refreshInterval="5s" recordCount={stats.totalTrades} source="Backend API (live trades)" />
    </>
  );
}
