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
import { getPaperTrades, getPaperBalance, type Trade, type PaperBalance } from "@/lib/api";

const A = "#F59E0B"; // amber-500

interface ChartPoint {
  time: number;
  value: number;
  label: string;
}

function buildChartData(trades: Trade[], paperBalance: PaperBalance): ChartPoint[] {
  // Keep only settled trades with known settlement time
  const settled = trades
    .filter(
      (t) =>
        t.outcome !== "pending" &&
        t.pnlTotal != null &&
        t.settledAt != null
    )
    .sort((a, b) => a.settledAt! - b.settledAt!);

  if (settled.length === 0) return [];

  const startingDollars = paperBalance.startingBalanceDollars;

  const points: ChartPoint[] = [];

  // Opening point just before first settlement
  const firstTs = settled[0].settledAt! - 1;
  points.push({
    time: firstTs,
    value: parseFloat(startingDollars.toFixed(2)),
    label: new Date(firstTs).toLocaleString(),
  });

  let running = startingDollars;
  for (const t of settled) {
    running += (t.pnlTotal ?? 0) / 100;
    const ts = t.settledAt!;
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
      style={{ border: "1px solid rgba(245,158,11,0.3)", padding: "6px 10px" }}
    >
      <p className="text-muted mb-0.5">{label}</p>
      <p style={{ color: A }} className="font-mono font-semibold">
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

export default function PaperAccountChart() {
  const { data: trades } = useSWR<Trade[]>("paper-trades-chart", getPaperTrades, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: paperBalance } = useSWR<PaperBalance>(
    "paper-balance-chart",
    getPaperBalance,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const chartData = useMemo(() => {
    if (!trades || !paperBalance) return [];
    return buildChartData(trades, paperBalance);
  }, [trades, paperBalance]);

  if (chartData.length < 2) {
    return (
      <div
        className="panel flex items-center justify-center text-muted text-xs"
        style={{ height: 180, border: "1px solid rgba(245,158,11,0.15)" }}
      >
        No settled paper trades to chart yet
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
      style={{ border: "1px solid rgba(245,158,11,0.15)", padding: "16px 8px 8px" }}
    >
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(245,158,11,0.08)"
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
            stroke={A}
            strokeWidth={2}
            dot={chartData.length <= 20}
            activeDot={{ r: 4, fill: A, stroke: "#0B0F1A", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
