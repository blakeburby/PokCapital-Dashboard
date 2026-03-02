"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { getFills, type KalshiFill } from "@/lib/api";
import { Activity, DollarSign, Hash, TrendingUp, AlertCircle } from "lucide-react";

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}

function MetricCard({ label, value, sub, icon }: CardProps) {
  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-muted">{icon}</span>}
        <span className="section-label" style={{ marginBottom: 0, color: "rgba(139,92,246,0.7)" }}>
          {label}
        </span>
      </div>
      <span
        className="text-2xl font-semibold font-mono tracking-tight"
        style={{ color: "#8B5CF6" }}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function computeStats(fills: KalshiFill[]) {
  const totalFills = fills.length;
  const totalContracts = fills.reduce((s, f) => s + f.count, 0);
  const totalCostCents = fills.reduce((s, f) => {
    const price = f.side === "yes" ? f.yes_price : f.no_price;
    return s + price * f.count;
  }, 0);
  const totalCostDollars = totalCostCents / 100;
  const avgFillPrice = totalContracts > 0 ? totalCostCents / totalContracts : 0;
  return { totalFills, totalContracts, totalCostDollars, avgFillPrice };
}

export default function KalshiFillsStats() {
  const { data: fills, error, isLoading } = useSWR<KalshiFill[]>(
    "kalshi-fills",
    getFills,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const stats = useMemo(
    () => computeStats(fills ?? []),
    [fills]
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel animate-pulse h-20 bg-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex items-center gap-2 text-loss text-sm">
        <AlertCircle size={16} />
        Failed to load account stats
      </div>
    );
  }

  const cards: CardProps[] = [
    {
      label: "Total Fills",
      value: String(stats.totalFills),
      sub: "executed fill events",
      icon: <Activity size={12} />,
    },
    {
      label: "Contracts Filled",
      value: String(stats.totalContracts),
      sub: "total contracts bought",
      icon: <Hash size={12} />,
    },
    {
      label: "Total Cost",
      value: `$${fmt(stats.totalCostDollars)}`,
      sub: "capital deployed",
      icon: <DollarSign size={12} />,
    },
    {
      label: "Avg Fill Price",
      value: `${fmt(stats.avgFillPrice, 1)}¢`,
      sub: "per contract",
      icon: <TrendingUp size={12} />,
    },
  ];

  return (
    <div>
      <p className="section-label">Account Overview</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
