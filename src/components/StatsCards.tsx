"use client";

import useSWR from "swr";
import { getStats, type Stats } from "@/lib/api";
import { TrendingUp, TrendingDown, Activity, Target, Award, AlertCircle } from "lucide-react";

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtPct(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtUSD(cents: number | undefined | null): string {
  if (cents == null || isNaN(cents)) return "—";
  const dollars = cents / 100;
  return dollars >= 0
    ? `+$${dollars.toFixed(2)}`
    : `-$${Math.abs(dollars).toFixed(2)}`;
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "profit" | "loss" | "accent" | "neutral";
  icon?: React.ReactNode;
}

function MetricCard({ label, value, sub, color = "neutral", icon }: CardProps) {
  const valueColor =
    color === "profit"
      ? "text-profit"
      : color === "loss"
      ? "text-loss"
      : color === "accent"
      ? "text-accent"
      : "text-text";

  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted">{icon}</span>}
        <span className="section-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <span className={`text-2xl font-semibold font-mono tracking-tight ${valueColor}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export default function StatsCards() {
  const { data, error, isLoading } = useSWR<Stats>("stats", getStats, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div>
        <p className="section-label">Strategy Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="panel animate-pulse h-20 bg-panel" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex items-center gap-2 text-loss">
        <AlertCircle size={16} />
        <span className="text-sm">Failed to load stats: {error.message}</span>
      </div>
    );
  }

  const s = data!;
  const totalPnlColor =
    s.totalPnlCents > 0 ? "profit" : s.totalPnlCents < 0 ? "loss" : "neutral";
  const winRatePct = s.winRate;

  const cards: CardProps[] = [
    {
      label: "Total Trades",
      value: String(s.totalTrades),
      sub: `${s.settledTrades} settled`,
      color: "accent",
      icon: <Activity size={12} />,
    },
    {
      label: "Wins",
      value: String(s.wins),
      sub: "settled wins",
      color: "profit",
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Losses",
      value: String(s.losses),
      sub: "settled losses",
      color: s.losses > 0 ? "loss" : "neutral",
      icon: <TrendingDown size={12} />,
    },
    {
      label: "Win Rate",
      value: winRatePct === 0 ? "—" : fmtPct(winRatePct),
      sub: "of settled trades",
      color: winRatePct >= 0.5 ? "profit" : winRatePct > 0 ? "loss" : "neutral",
    },
    {
      label: "Total PNL",
      value: fmtUSD(s.totalPnlCents),
      sub: `${s.totalPnlCents >= 0 ? "+" : ""}${fmt(s.totalPnlCents / 100, 2)} USD`,
      color: totalPnlColor,
      icon: <TrendingUp size={12} />,
    },
    {
      label: "Avg EV",
      value: `${fmt(s.avgEvCents)}¢`,
      sub: "per trade signal",
      color: s.avgEvCents > 0 ? "profit" : "neutral",
    },
    {
      label: "Avg Confidence",
      value: fmt(s.avgConfidence, 1) + "%",
      sub: "model confidence",
      color: "accent",
    },
    {
      label: "Profit Factor",
      value: s.profitFactor === 0 ? "—" : fmt(s.profitFactor),
      sub: "gross profit / loss",
      color: s.profitFactor >= 1.5 ? "profit" : s.profitFactor > 0 ? "neutral" : "neutral",
      icon: <Target size={12} />,
    },
    {
      label: "Sharpe Approx",
      value: s.sharpeApprox === 0 ? "—" : fmt(s.sharpeApprox),
      sub: "risk-adjusted return",
      color: s.sharpeApprox >= 1 ? "profit" : "neutral",
    },
    {
      label: "Best Trade",
      value: fmtUSD(s.bestTradePnl),
      sub: "highest single PNL",
      color: "profit",
      icon: <Award size={12} />,
    },
    {
      label: "Worst Trade",
      value: fmtUSD(s.worstTradePnl),
      sub: "lowest single PNL",
      color: s.worstTradePnl < 0 ? "loss" : "neutral",
    },
    {
      label: "Settled Trades",
      value: String(s.settledTrades),
      sub: `${s.totalTrades - s.settledTrades} pending`,
      color: "neutral",
    },
  ];

  return (
    <div>
      <p className="section-label">Strategy Overview</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
