"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
} from "recharts";
import type { Trade } from "@/lib/types";
import { buildEquityCurve } from "@/lib/calculations";

/* ── palette ────────────────────────────────────────────────────── */
const TEAL = "#00E5CC";
const RED = "#FF3D57";
const AMBER = "#FFB300";
const GRAY = "#6B7280";
const PANEL_BG = "#0F1117";
const BORDER = "#1A1F2E";

type ViewMode = "dollar" | "percent";
type TimeFilter = "7D" | "30D" | "ALL";

/* ── filter button ──────────────────────────────────────────────── */
function FilterBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(0,229,204,0.12)" : "transparent",
        border: `1px solid ${active ? TEAL : BORDER}`,
        borderRadius: 4,
        padding: "3px 8px",
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        color: active ? TEAL : GRAY,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

/* ── custom tooltip ─────────────────────────────────────────────── */
function CurveTooltip({ active, payload, viewMode }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as {
    t: string;
    label: string;
    pnl: number;
    pnlPct: number;
    wr20: number;
    isDrawdown: boolean;
  };
  if (!d) return null;
  return (
    <div
      style={{
        background: "#13161D",
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "8px 12px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: "#E5E7EB",
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: TEAL, fontWeight: 600, marginBottom: 2 }}>
        {d.label}
      </div>
      <div>
        P&L:{" "}
        <span style={{ color: d.pnl >= 0 ? TEAL : RED }}>
          {viewMode === "dollar"
            ? `$${d.pnl.toFixed(2)}`
            : `${d.pnlPct.toFixed(2)}%`}
        </span>
      </div>
      <div>
        Win Rate (20):{" "}
        <span style={{ color: AMBER }}>
          {(d.wr20 * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────── */
export default function EquityCurve({ trades }: { trades: Trade[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("dollar");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");

  const allPoints = useMemo(() => buildEquityCurve(trades), [trades]);

  const filtered = useMemo(() => {
    if (timeFilter === "ALL" || allPoints.length === 0) return allPoints;

    const now = new Date();
    const days = timeFilter === "7D" ? 7 : 30;
    const cutoff = new Date(now.getTime() - days * 86_400_000);

    return allPoints.filter((p) => new Date(p.t) >= cutoff);
  }, [allPoints, timeFilter]);

  /* split into drawdown vs normal for area shading */
  const chartData = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        pnlVal: viewMode === "dollar" ? p.pnl : p.pnlPct,
        ddFill: p.isDrawdown
          ? viewMode === "dollar"
            ? p.pnl
            : p.pnlPct
          : undefined,
      })),
    [filtered, viewMode],
  );

  const yKey = "pnlVal";

  return (
    <div
      style={{
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 9,
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: TEAL,
            }}
          >
            Performance
          </span>
          <div
            style={{
              fontSize: 13,
              fontFamily: "Inter, sans-serif",
              color: "#E5E7EB",
              marginTop: 2,
            }}
          >
            Equity Curve
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* view mode toggle */}
          <FilterBtn
            active={viewMode === "dollar"}
            label="$ P&L"
            onClick={() => setViewMode("dollar")}
          />
          <FilterBtn
            active={viewMode === "percent"}
            label="% Growth"
            onClick={() => setViewMode("percent")}
          />

          <div
            style={{
              width: 1,
              height: 16,
              background: BORDER,
              margin: "0 4px",
            }}
          />

          {/* time filter */}
          {(["7D", "30D", "ALL"] as TimeFilter[]).map((tf) => (
            <FilterBtn
              key={tf}
              active={timeFilter === tf}
              label={tf}
              onClick={() => setTimeFilter(tf)}
            />
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div
          style={{
            height: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: GRAY,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
          }}
        >
          No trade data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{
                fill: GRAY,
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              axisLine={{ stroke: BORDER }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v: number) =>
                viewMode === "dollar" ? `$${v.toFixed(0)}` : `${v.toFixed(1)}%`
              }
              tick={{
                fill: GRAY,
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 1]}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              tick={{
                fill: GRAY,
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              axisLine={false}
              tickLine={false}
            />

            {/* zero line */}
            <ReferenceLine
              yAxisId="left"
              y={0}
              stroke={GRAY}
              strokeDasharray="4 3"
              strokeOpacity={0.4}
            />

            {/* drawdown shading */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="ddFill"
              fill={RED}
              fillOpacity={0.08}
              stroke="none"
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* P&L line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={yKey}
              stroke={TEAL}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: TEAL,
                stroke: "#0A0B0D",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />

            {/* rolling win rate */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="wr20"
              stroke={AMBER}
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />

            <Tooltip
              content={<CurveTooltip viewMode={viewMode} />}
              cursor={{
                stroke: "rgba(255,255,255,0.1)",
                strokeWidth: 1,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
