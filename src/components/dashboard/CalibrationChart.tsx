"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { Trade } from "@/lib/types";
import { buildCalibrationData, brierScore } from "@/lib/calculations";

/* ── palette ────────────────────────────────────────────────────── */
const TEAL = "#00E5CC";
const RED = "#FF3D57";
const GRAY = "#6B7280";
const PANEL_BG = "#0F1117";
const BORDER = "#1A1F2E";

/* ── custom tooltip ─────────────────────────────────────────────── */
function CalibrationTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as {
    bucket: string;
    modelMid: number;
    actualRate: number;
    count: number;
  };
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
        {d.bucket}
      </div>
      <div>
        Model Mid:{" "}
        <span style={{ color: "#fff" }}>
          {(d.modelMid * 100).toFixed(1)}%
        </span>
      </div>
      <div>
        Actual Rate:{" "}
        <span style={{ color: "#fff" }}>
          {(d.actualRate * 100).toFixed(1)}%
        </span>
      </div>
      <div>
        Trades: <span style={{ color: "#fff" }}>{d.count}</span>
      </div>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────── */
export default function CalibrationChart({ trades }: { trades: Trade[] }) {
  const settled = useMemo(
    () => trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS"),
    [trades],
  );

  const calibration = useMemo(
    () => buildCalibrationData(settled),
    [settled],
  );

  const avgBrier = useMemo(() => brierScore(settled), [settled]);

  const hasData = settled.length >= 5;

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
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            fontSize: 9,
            fontFamily: "'IBM Plex Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: TEAL,
          }}
        >
          Calibration
        </span>
        <div
          style={{
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            color: "#E5E7EB",
            marginTop: 2,
          }}
        >
          Model Probability vs Actual Win Rate
        </div>
      </div>

      {!hasData ? (
        <div
          style={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: GRAY,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
          }}
        >
          Insufficient data — need at least 5 settled trades
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={calibration}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="bucket"
                tick={{
                  fill: GRAY,
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                axisLine={{ stroke: BORDER }}
                tickLine={false}
              />
              <YAxis
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
              {/* perfect calibration diagonal approximated as reference lines per bucket */}
              <ReferenceLine
                y={0}
                stroke={BORDER}
              />
              <Tooltip
                content={<CalibrationTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="actualRate" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {calibration.map(
                  (
                    entry: {
                      bucket: string;
                      modelMid: number;
                      actualRate: number;
                      count: number;
                    },
                    idx: number,
                  ) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.actualRate < entry.modelMid - 0.05
                          ? RED
                          : TEAL
                      }
                      fillOpacity={0.7}
                    />
                  ),
                )}
              </Bar>
              {/* perfect-calibration reference marks per bucket */}
              {calibration.map(
                (
                  entry: {
                    bucket: string;
                    modelMid: number;
                    actualRate: number;
                    count: number;
                  },
                  idx: number,
                ) => (
                  <ReferenceLine
                    key={`ref-${idx}`}
                    y={entry.modelMid}
                    stroke={RED}
                    strokeDasharray="4 3"
                    strokeOpacity={0.35}
                    ifOverflow="extendDomain"
                    label={undefined}
                  />
                ),
              )}
            </BarChart>
          </ResponsiveContainer>

          {/* summary */}
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              color: GRAY,
              display: "flex",
              gap: 16,
            }}
          >
            <span>
              Total calibrated trades:{" "}
              <span style={{ color: "#E5E7EB" }}>{settled.length}</span>
            </span>
            <span>
              Avg Brier:{" "}
              <span style={{ color: "#E5E7EB" }}>{avgBrier.toFixed(4)}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
