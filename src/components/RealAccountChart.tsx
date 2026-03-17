"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getFills, getTrades, getBalance, type KalshiFill, type Trade, type AccountBalance } from "@/lib/api";
import { buildEnrichedFills } from "@/components/KalshiFillsStats";

const V = "#8B5CF6";

interface ChartPoint {
  time: number;
  value: number;
  label: string;
}

function buildChartData(
  fills: KalshiFill[],
  trades: Trade[],
  balanceDollars: number
): ChartPoint[] {
  const enriched = buildEnrichedFills(fills, trades);

  // Keep only settled fills where we know the settledAt timestamp
  const settled = enriched
    .filter(
      (f) =>
        f.paperTrade !== null &&
        f.paperTrade.outcome !== "pending" &&
        f.paperTrade.pnlTotal != null &&
        f.paperTrade.settledAt != null
    )
    .sort((a, b) => a.paperTrade!.settledAt! - b.paperTrade!.settledAt!);

  if (settled.length === 0) return [];

  // Reconstruct implied starting balance
  const totalRealizedCents = settled.reduce(
    (s, f) => s + (f.paperTrade!.pnlTotal ?? 0),
    0
  );
  const impliedStartDollars = balanceDollars - totalRealizedCents / 100;

  const points: ChartPoint[] = [];
  // Opening point just before first settlement
  const firstTs = settled[0].paperTrade!.settledAt! - 1;
  points.push({
    time: firstTs,
    value: parseFloat(impliedStartDollars.toFixed(2)),
    label: new Date(firstTs).toLocaleString(),
  });

  let running = impliedStartDollars;
  for (const f of settled) {
    running += (f.paperTrade!.pnlTotal ?? 0) / 100;
    const ts = f.paperTrade!.settledAt!;
    points.push({
      time: ts,
      value: parseFloat(running.toFixed(2)),
      label: new Date(ts).toLocaleString(),
    });
  }

  return points;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const { value, label } = payload[0].payload;
  return (
    <div
      className="panel text-xs"
      style={{ border: "1px solid rgba(139,92,246,0.3)", padding: "6px 10px" }}
    >
      <p className="text-muted mb-0.5">{label}</p>
      <p style={{ color: value >= 0 ? V : "#EF4444" }} className="font-mono font-semibold">
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

export default function RealAccountChart() {
  const { data: fills } = useSWR<KalshiFill[]>("kalshi-fills", getFills, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: trades } = useSWR<Trade[]>("trades-pnl", getTrades, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: balance } = useSWR<AccountBalance>("kalshi-balance", getBalance, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  const chartData = useMemo(() => {
    if (!fills || !trades || !balance) return [];
    return buildChartData(fills, trades, balance.balanceDollars);
  }, [fills, trades, balance]);

  if (chartData.length < 2) {
    return (
      <div
        className="panel flex items-center justify-center text-muted text-xs"
        style={{ height: 180, border: "1px solid rgba(139,92,246,0.15)" }}
      >
        No settled trades to chart yet
      </div>
    );
  }

  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max((maxVal - minVal) * 0.1, 2);

  return (
    <div
      className="panel"
      style={{ border: "1px solid rgba(139,92,246,0.15)", padding: "16px 8px 8px" }}
    >
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(139,92,246,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(ts: number) =>
              new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minVal - pad, maxVal + pad]}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={V}
            strokeWidth={2}
            dot={chartData.length <= 20}
            activeDot={{ r: 4, fill: V, stroke: "#0B0F1A", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
