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
  ReferenceLine,
} from "recharts";
import { getPaperTrades, type Trade } from "@/lib/api";

const CARD = "#111318";
const BORDER = "#1A1F2E";
const GRAY = "#4B5563";
const TEAL = "#00E5CC";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const mono = "'IBM Plex Mono', monospace";

const ROLLING_WINDOW = 20;

interface EVPoint {
  index: number;
  predictedEV: number;
  realizedPnl: number;
  label: string;
}

interface EVData {
  points: EVPoint[];
  evDriftCents: number | null;
  totalSettled: number;
}

function computeEVData(trades: Trade[]): EVData {
  const settled = trades
    .filter((t) => t.outcome !== "pending" && t.pnlCents != null && t.settledAt != null)
    .sort((a, b) => a.settledAt! - b.settledAt!);

  if (settled.length < ROLLING_WINDOW) {
    return { points: [], evDriftCents: null, totalSettled: settled.length };
  }

  const points: EVPoint[] = [];

  for (let i = ROLLING_WINDOW - 1; i < settled.length; i++) {
    const window = settled.slice(i - ROLLING_WINDOW + 1, i + 1);
    const avgEV = window.reduce((s, t) => s + t.ev, 0) / ROLLING_WINDOW;
    const avgPnl = window.reduce((s, t) => s + (t.pnlCents ?? 0), 0) / ROLLING_WINDOW;

    points.push({
      index: i + 1,
      predictedEV: parseFloat(avgEV.toFixed(2)),
      realizedPnl: parseFloat(avgPnl.toFixed(2)),
      label: `Trade ${i + 1}`,
    });
  }

  // Overall drift
  const totalPredicted = settled.reduce((s, t) => s + t.ev, 0) / settled.length;
  const totalRealized = settled.reduce((s, t) => s + (t.pnlCents ?? 0), 0) / settled.length;
  const evDriftCents = totalRealized - totalPredicted;

  return { points, evDriftCents, totalSettled: settled.length };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: EVPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const diff = p.realizedPnl - p.predictedEV;
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 4,
      padding: "8px 12px", fontFamily: mono, fontSize: 10,
    }}>
      <div style={{ color: "#E2E8F0", fontWeight: 600, marginBottom: 4 }}>{p.label}</div>
      <div style={{ color: TEAL }}>Predicted EV: {p.predictedEV.toFixed(2)}¢</div>
      <div style={{ color: AMBER }}>Realized P&L: {p.realizedPnl.toFixed(2)}¢</div>
      <div style={{ color: diff >= 0 ? TEAL : RED }}>
        Drift: {diff >= 0 ? "+" : ""}{diff.toFixed(2)}¢
      </div>
    </div>
  );
}

export default function PaperEVAnalysis() {
  const { data: trades, isLoading } = useSWR<Trade[]>(
    "paper-trades-ev",
    getPaperTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const evData = useMemo(() => computeEVData(trades ?? []), [trades]);

  if (isLoading) {
    return (
      <div className="panel animate-pulse" style={{ height: 280, background: CARD, border: `1px solid ${BORDER}` }} />
    );
  }

  if (evData.points.length === 0) {
    return (
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6,
        padding: 32, textAlign: "center", height: 280,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
      }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: GRAY }}>
          Need {ROLLING_WINDOW}+ settled trades for EV analysis
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: `${GRAY}80` }}>
          {evData.totalSettled} / {ROLLING_WINDOW} settled
        </div>
      </div>
    );
  }

  const allValues = evData.points.flatMap((p) => [p.predictedEV, p.realizedPnl]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const pad = Math.max((maxVal - minVal) * 0.15, 2);

  const driftColor = evData.evDriftCents != null
    ? (evData.evDriftCents >= 0 ? TEAL : RED)
    : GRAY;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "16px 8px 8px" }}>
      {/* Header with drift badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px", marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: GRAY, letterSpacing: "0.08em" }}>
          EV REALIZATION
        </span>
        {evData.evDriftCents != null && (
          <span style={{
            fontFamily: mono, fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 3,
            background: `${driftColor}18`, color: driftColor,
          }}>
            DRIFT: {evData.evDriftCents >= 0 ? "+" : ""}{evData.evDriftCents.toFixed(2)}¢
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={evData.points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="index"
            tick={{ fill: GRAY, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Trade #", position: "insideBottom", offset: -2, fill: GRAY, fontSize: 9 }}
          />
          <YAxis
            domain={[minVal - pad, maxVal + pad]}
            tickFormatter={(v: number) => `${v.toFixed(0)}¢`}
            tick={{ fill: GRAY, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={GRAY} strokeDasharray="4 4" strokeOpacity={0.3} />

          {/* Predicted EV line */}
          <Line
            type="monotone"
            dataKey="predictedEV"
            stroke={TEAL}
            strokeWidth={2}
            dot={false}
            name="Predicted EV"
          />

          {/* Realized P&L line */}
          <Line
            type="monotone"
            dataKey="realizedPnl"
            stroke={AMBER}
            strokeWidth={2}
            dot={false}
            name="Realized P&L"
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "6px 0 2px" }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: TEAL, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 2, background: TEAL, display: "inline-block" }} />
          Predicted EV
        </span>
        <span style={{ fontFamily: mono, fontSize: 9, color: AMBER, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 2, background: AMBER, display: "inline-block", borderTop: "1px dashed" }} />
          Realized P&L
        </span>
        <span style={{ fontFamily: mono, fontSize: 9, color: GRAY }}>
          {ROLLING_WINDOW}-trade rolling avg
        </span>
      </div>
    </div>
  );
}
