"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { Trade } from "@/lib/types";
import { buildRollingEV } from "@/lib/calculations";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
  }>;
  label?: string;
}

function EVTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entered = payload.find((p) => p.dataKey === "avgEntered");
  const realized = payload.find((p) => p.dataKey === "avgRealized");
  const divergence =
    entered && realized
      ? Math.abs(realized.value - entered.value)
      : 0;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "#0F1117",
        border: "1px solid #1A1F2E",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "0.7rem",
      }}
    >
      <p style={{ color: "#6B7280", marginBottom: "4px" }}>Trade {label}</p>
      {entered && (
        <p style={{ color: "#00E5CC", margin: "2px 0" }}>
          EV Entered: {entered.value.toFixed(4)}
        </p>
      )}
      {realized && (
        <p style={{ color: "#FFB300", margin: "2px 0" }}>
          EV Realized: {realized.value.toFixed(4)}
        </p>
      )}
      <p
        style={{
          color: divergence > 0.1 ? "#FF3D57" : "#6B7280",
          margin: "2px 0",
        }}
      >
        Divergence: {divergence.toFixed(4)}
      </p>
    </div>
  );
}

export default function RollingEVChart({ trades }: { trades: Trade[] }) {
  const data = useMemo(() => buildRollingEV(trades), [trades]);

  const settledCount = trades.filter(
    (t) => t.outcome === "WIN" || t.outcome === "LOSS"
  ).length;

  const latestDivergence =
    data.length > 0 ? data[data.length - 1].divergence : 0;
  const needsRecalibration = latestDivergence > 0.1;

  // Find contiguous divergence regions > 0.10
  const divergenceRegions: Array<{ x1: string; x2: string }> = [];
  let regionStart: string | null = null;
  for (const point of data) {
    if (point.divergence > 0.1) {
      if (regionStart === null) regionStart = point.label;
    } else {
      if (regionStart !== null) {
        divergenceRegions.push({
          x1: regionStart,
          x2: data[data.indexOf(point) - 1]?.label ?? regionStart,
        });
        regionStart = null;
      }
    }
  }
  if (regionStart !== null) {
    divergenceRegions.push({
      x1: regionStart,
      x2: data[data.length - 1].label,
    });
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "#0F1117", border: "1px solid #1A1F2E" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#6B7280",
            margin: 0,
          }}
        >
          ROLLING EV VALIDATION (100-TRADE WINDOW)
        </p>

        {settledCount >= 10 && (
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-0.5"
            style={{
              background: needsRecalibration
                ? "rgba(255,61,87,0.15)"
                : "rgba(0,229,204,0.15)",
              color: needsRecalibration ? "#FF3D57" : "#00E5CC",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.65rem",
              fontWeight: 600,
            }}
          >
            {needsRecalibration ? "\u26A0 RECALIBRATE" : "\u2713 CALIBRATED"}
          </span>
        )}
      </div>

      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: "0.55rem",
          color: "#4B5563",
          margin: "0 0 16px 0",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        DIVERGENCE &gt; 10% SIGNALS RECALIBRATION NEEDED
      </p>

      {settledCount < 10 ? (
        <div
          className="flex items-center justify-center"
          style={{
            height: "200px",
            color: "#6B7280",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.8rem",
          }}
        >
          Insufficient data (need 10+ settled trades)
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1A1F2E"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{
                  fill: "#6B7280",
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                tickLine={{ stroke: "#1A1F2E" }}
                axisLine={{ stroke: "#1A1F2E" }}
                interval={Math.max(Math.floor(data.length / 10) - 1, 0)}
              />
              <YAxis
                tick={{
                  fill: "#6B7280",
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                tickLine={{ stroke: "#1A1F2E" }}
                axisLine={{ stroke: "#1A1F2E" }}
                tickFormatter={(v: number) => v.toFixed(2)}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<EVTooltip />} />

              {/* Divergence regions */}
              {divergenceRegions.map((region, i) => (
                <ReferenceArea
                  key={i}
                  x1={region.x1}
                  x2={region.x2}
                  fill="#FF3D57"
                  fillOpacity={0.1}
                />
              ))}

              <ReferenceLine
                y={0.03}
                stroke="#6B7280"
                strokeDasharray="4 4"
                label={{
                  value: "EV_THRESH",
                  position: "right",
                  fill: "#6B7280",
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />

              <Line
                type="monotone"
                dataKey="avgEntered"
                stroke="#00E5CC"
                strokeWidth={1.5}
                dot={false}
                name="EV ENTERED"
              />
              <Line
                type="monotone"
                dataKey="avgRealized"
                stroke="#FFB300"
                strokeWidth={1.5}
                dot={false}
                name="EV REALIZED"
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div
            className="flex items-center justify-center gap-6 mt-2"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.65rem",
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5"
                style={{ background: "#00E5CC" }}
              />
              <span style={{ color: "#9CA3AF" }}>EV ENTERED</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5"
                style={{ background: "#FFB300" }}
              />
              <span style={{ color: "#9CA3AF" }}>EV REALIZED</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
