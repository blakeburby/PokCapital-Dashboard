"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { getPaperTrades, getPaperBalance, type Trade, type PaperBalance } from "@/lib/api";

const A = "#F59E0B"; // amber-500
const RED = "#EF4444";
const GRAY = "#6B7280";

interface ChartPoint {
  time: number;
  value: number;
  peak: number;
  drawdownDollars: number;
  drawdownBase: number; // the peak value at this point (for area fill)
  label: string;
}

type TimeFilter = "7D" | "30D" | "ALL";

function buildChartData(trades: Trade[], paperBalance: PaperBalance): ChartPoint[] {
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
    peak: parseFloat(startingDollars.toFixed(2)),
    drawdownDollars: 0,
    drawdownBase: parseFloat(startingDollars.toFixed(2)),
    label: new Date(firstTs).toLocaleString(),
  });

  let running = startingDollars;
  let peak = startingDollars;

  for (const t of settled) {
    running += (t.pnlTotal ?? 0) / 100;
    if (running > peak) peak = running;
    const val = parseFloat(running.toFixed(2));
    const peakVal = parseFloat(peak.toFixed(2));
    const dd = parseFloat((peak - running).toFixed(2));
    const ts = t.settledAt!;
    points.push({
      time: ts,
      value: val,
      peak: peakVal,
      drawdownDollars: dd,
      drawdownBase: dd > 0 ? peakVal : val, // when in drawdown, fill from peak down to value
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
  const { value, peak, drawdownDollars, label } = payload[0].payload;
  return (
    <div
      className="panel text-xs"
      style={{ border: "1px solid rgba(245,158,11,0.3)", padding: "8px 12px" }}
    >
      <p className="text-muted mb-1">{label}</p>
      <p style={{ color: A }} className="font-mono font-semibold">
        Equity: ${value.toFixed(2)}
      </p>
      <p style={{ color: GRAY }} className="font-mono">
        Peak: ${peak.toFixed(2)}
      </p>
      {drawdownDollars > 0 && (
        <p style={{ color: RED }} className="font-mono">
          Drawdown: -${drawdownDollars.toFixed(2)}
        </p>
      )}
    </div>
  );
}

export default function PaperAccountChart() {
  const [filter, setFilter] = useState<TimeFilter>("ALL");

  const { data: trades } = useSWR<Trade[]>("paper-trades-chart", getPaperTrades, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: paperBalance } = useSWR<PaperBalance>(
    "paper-balance-chart",
    getPaperBalance,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const allData = useMemo(() => {
    if (!trades || !paperBalance) return [];
    return buildChartData(trades, paperBalance);
  }, [trades, paperBalance]);

  const chartData = useMemo(() => {
    if (filter === "ALL" || allData.length === 0) return allData;
    const now = Date.now();
    const cutoff = filter === "7D" ? now - 7 * 86400_000 : now - 30 * 86400_000;
    return allData.filter((d) => d.time >= cutoff);
  }, [allData, filter]);

  if (chartData.length < 2) {
    return (
      <div
        className="panel flex items-center justify-center text-muted text-xs"
        style={{ height: 240, border: "1px solid rgba(245,158,11,0.15)" }}
      >
        No settled paper trades to chart yet
      </div>
    );
  }

  const values = chartData.map((d) => d.value);
  const peaks = chartData.map((d) => d.peak);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...peaks);
  const pad = Math.max((maxVal - minVal) * 0.1, 2);
  const startingBalance = paperBalance?.startingBalanceDollars ?? 0;
  const hasDrawdown = chartData.some((d) => d.drawdownDollars > 0);

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "3px 10px",
    borderRadius: 3,
    border: "none",
    cursor: "pointer",
    background: active ? `${A}20` : "transparent",
    color: active ? A : GRAY,
    transition: "all 0.15s",
  });

  return (
    <div
      className="panel"
      style={{ border: "1px solid rgba(245,158,11,0.15)", padding: "16px 8px 8px" }}
    >
      {/* Time filter buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 8, paddingRight: 8 }}>
        {(["7D", "30D", "ALL"] as TimeFilter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
            {f}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
            tick={{ fill: GRAY, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minVal - pad, maxVal + pad]}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fill: GRAY, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Starting balance reference line */}
          <ReferenceLine
            y={startingBalance}
            stroke={GRAY}
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />

          {/* Drawdown shading: area from peak down to equity value */}
          {hasDrawdown && (
            <Area
              type="monotone"
              dataKey="drawdownBase"
              stroke="none"
              fill={RED}
              fillOpacity={0.08}
              baseLine={chartData.map((d) => d.value)}
              isAnimationActive={false}
            />
          )}

          {/* Equity line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke={A}
            strokeWidth={2}
            dot={chartData.length <= 30}
            activeDot={{ r: 4, fill: A, stroke: "#0B0F1A", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
