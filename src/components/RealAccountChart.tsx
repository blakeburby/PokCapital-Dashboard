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
import { getAnalytics, type FillAnalytics } from "@/lib/api";

const VIOLET = "#8B5CF6";

interface ChartPoint {
  time: number;
  value: number;
  label: string;
}

function buildChartData(analytics: FillAnalytics | undefined): ChartPoint[] {
  return (analytics?.balanceHistory ?? [])
    .map((point) => {
      const time = new Date(point.timestamp).getTime();
      return {
        time,
        value: point.balanceCents / 100,
        label: new Date(time).toLocaleString(),
      };
    })
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
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
      <p style={{ color: value >= 0 ? VIOLET : "#EF4444" }} className="font-mono font-semibold">
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

export default function RealAccountChart() {
  const { data: analytics } = useSWR<FillAnalytics>(
    "dashboard-analytics",
    getAnalytics,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );

  const chartData = useMemo(() => buildChartData(analytics), [analytics]);

  if (chartData.length < 2) {
    return (
      <div
        className="panel flex items-center justify-center text-muted text-xs"
        style={{ height: 220, border: "1px solid rgba(139,92,246,0.15)" }}
      >
        Balance history will appear after the backend records snapshots
      </div>
    );
  }

  const values = chartData.map((point) => point.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max((maxVal - minVal) * 0.12, 2);

  return (
    <div
      className="panel"
      style={{ border: "1px solid rgba(139,92,246,0.15)", padding: "16px 8px 8px" }}
    >
      <ResponsiveContainer width="100%" height={220}>
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
            tickFormatter={(value: number) => `$${value.toFixed(0)}`}
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={VIOLET}
            strokeWidth={2.5}
            dot={chartData.length <= 20}
            activeDot={{ r: 4, fill: VIOLET, stroke: "#0B0F1A", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
