"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getTrades, type Trade } from "@/lib/api";
import { AlertCircle } from "lucide-react";

type Filter = "1h" | "1d" | "7d" | "30d" | "365d" | "all";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "Last Hour", value: "1h" },
  { label: "Last Day", value: "1d" },
  { label: "Last Week", value: "7d" },
  { label: "Last Month", value: "30d" },
  { label: "Last Year", value: "365d" },
  { label: "All Time", value: "all" },
];

function filterCutoff(filter: Filter): number {
  const now = Date.now();
  if (filter === "1h") return now - 3600_000;
  if (filter === "1d") return now - 86400_000;
  if (filter === "7d") return now - 7 * 86400_000;
  if (filter === "30d") return now - 30 * 86400_000;
  if (filter === "365d") return now - 365 * 86400_000;
  return 0;
}

interface ChartPoint {
  time: number;
  label: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
}

function buildChartData(trades: Trade[], filter: Filter): ChartPoint[] {
  const cutoff = filterCutoff(filter);
  const sorted = [...trades]
    .filter((t) => new Date(t.closeTime).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
    );

  let cumRealized = 0;
  let cumUnrealized = 0;

  return sorted.map((t) => {
    const pnlDollars = t.pnlCents != null ? t.pnlCents / 100 : 0;
    if (t.outcome !== "pending" && t.pnlCents != null) {
      cumRealized += pnlDollars;
    } else {
      // Pending trades count as unrealized at their EV estimate
      cumUnrealized += t.ev / 100;
    }
    const ts = new Date(t.closeTime).getTime();
    return {
      time: ts,
      label: new Date(t.closeTime).toLocaleTimeString(),
      realizedPnl: parseFloat(cumRealized.toFixed(4)),
      unrealizedPnl: parseFloat(cumUnrealized.toFixed(4)),
      totalPnl: parseFloat((cumRealized + cumUnrealized).toFixed(4)),
    };
  });
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  return (
    <div
      className="panel text-xs"
      style={{ borderColor: "#1F2937", minWidth: 140 }}
    >
      <p className="text-muted mb-1">{new Date(d.time).toLocaleString()}</p>
      <p style={{ color: "#10B981" }}>Realized: ${d.realizedPnl.toFixed(4)}</p>
      <p style={{ color: "#3B82F6" }}>
        Unrealized: ${d.unrealizedPnl.toFixed(4)}
      </p>
      <p className="text-text font-semibold">Total: ${d.totalPnl.toFixed(4)}</p>
    </div>
  );
};

export default function PnlChart() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: trades, error, isLoading } = useSWR<Trade[]>(
    "trades-pnl",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const chartData = useMemo(
    () => (trades ? buildChartData(trades, filter) : []),
    [trades, filter]
  );

  const latestTotal = chartData[chartData.length - 1]?.totalPnl ?? 0;
  const isPositive = latestTotal >= 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label" style={{ marginBottom: 0 }}>
          PNL Analytics
        </p>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === f.value
                  ? "bg-accent text-white"
                  : "text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {/* Summary row */}
        <div className="flex gap-6 mb-4 text-sm">
          <div>
            <span className="text-muted">Total PNL </span>
            <span
              className={`font-semibold font-mono ${isPositive ? "text-profit" : "text-loss"}`}
            >
              {isPositive ? "+" : ""}${latestTotal.toFixed(4)}
            </span>
          </div>
          <div>
            <span className="text-muted">Realized </span>
            <span className="font-mono text-profit">
              ${chartData[chartData.length - 1]?.realizedPnl.toFixed(4) ?? "0.0000"}
            </span>
          </div>
          <div>
            <span className="text-muted">Unrealized </span>
            <span className="font-mono text-accent">
              ${chartData[chartData.length - 1]?.unrealizedPnl.toFixed(4) ?? "0.0000"}
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-loss text-sm mb-2">
            <AlertCircle size={14} />
            Failed to load trade data
          </div>
        )}

        {isLoading ? (
          <div className="h-56 flex items-center justify-center text-muted text-sm animate-pulse">
            Loading chart data...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-muted text-sm">
            No trades in this time range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1F2937"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6B7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6B7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#1F2937" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="realizedPnl"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
                name="Realized"
              />
              <Line
                type="monotone"
                dataKey="unrealizedPnl"
                stroke="#3B82F6"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="Unrealized"
              />
              <Line
                type="monotone"
                dataKey="totalPnl"
                stroke="#E5E7EB"
                strokeWidth={2}
                dot={false}
                name="Total"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-profit" /> Realized PNL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-accent opacity-70" /> Unrealized PNL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-text" /> Total PNL
          </span>
        </div>
      </div>
    </div>
  );
}
