"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { getPaperTrades, type Trade } from "@/lib/api";

const CARD = "#111318";
const BORDER = "#1A1F2E";
const GRAY = "#4B5563";
const TEAL = "#00E5CC";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const mono = "'IBM Plex Mono', monospace";

interface CalibrationBucket {
  label: string;
  midpoint: number;
  total: number;
  wins: number;
  actualWinRate: number;
  expectedWinRate: number;
}

interface CalibrationData {
  buckets: CalibrationBucket[];
  brierScore: number | null;
  totalSettled: number;
}

function computeCalibration(trades: Trade[]): CalibrationData {
  const settled = trades.filter((t) => t.outcome === "win" || t.outcome === "loss");

  if (settled.length === 0) {
    return { buckets: [], brierScore: null, totalSettled: 0 };
  }

  // For each trade, compute the "effective probability" — the model's confidence
  // that the chosen direction will win.
  // YES trades: modelProbability is P(yes wins) — use directly
  // NO trades: modelProbability is P(yes wins) — effective prob = 1 - modelProbability
  const withEffective = settled.map((t) => ({
    effectiveProb: t.direction === "yes" ? t.modelProbability : 1 - t.modelProbability,
    won: t.outcome === "win" ? 1 : 0,
  }));

  // Bucket into deciles (50-60, 60-70, 70-80, 80-90, 90-100)
  const bucketDefs = [
    { label: "50-60%", lo: 0.50, hi: 0.60, mid: 0.55 },
    { label: "60-70%", lo: 0.60, hi: 0.70, mid: 0.65 },
    { label: "70-80%", lo: 0.70, hi: 0.80, mid: 0.75 },
    { label: "80-90%", lo: 0.80, hi: 0.90, mid: 0.85 },
    { label: "90-100%", lo: 0.90, hi: 1.01, mid: 0.95 },
  ];

  const buckets: CalibrationBucket[] = bucketDefs.map(({ label, lo, hi, mid }) => {
    const inBucket = withEffective.filter((t) => t.effectiveProb >= lo && t.effectiveProb < hi);
    const wins = inBucket.filter((t) => t.won === 1).length;
    return {
      label,
      midpoint: mid * 100,
      total: inBucket.length,
      wins,
      actualWinRate: inBucket.length > 0 ? (wins / inBucket.length) * 100 : 0,
      expectedWinRate: mid * 100,
    };
  }).filter((b) => b.total > 0);

  // Brier score: mean((predicted - actual)^2)
  const brierSum = withEffective.reduce((s, t) => s + (t.effectiveProb - t.won) ** 2, 0);
  const brierScore = brierSum / withEffective.length;

  return { buckets, brierScore, totalSettled: settled.length };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CalibrationBucket }[];
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 4,
      padding: "8px 12px", fontFamily: mono, fontSize: 10,
    }}>
      <div style={{ color: "#E2E8F0", fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
      <div style={{ color: TEAL }}>Actual: {b.actualWinRate.toFixed(1)}%</div>
      <div style={{ color: AMBER }}>Expected: {b.expectedWinRate.toFixed(1)}%</div>
      <div style={{ color: GRAY }}>{b.total} trades ({b.wins} wins)</div>
    </div>
  );
}

export default function PaperCalibrationChart() {
  const { data: trades, isLoading } = useSWR<Trade[]>(
    "paper-trades-cal",
    getPaperTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const cal = useMemo(() => computeCalibration(trades ?? []), [trades]);

  if (isLoading) {
    return (
      <div className="panel animate-pulse" style={{ height: 280, background: CARD, border: `1px solid ${BORDER}` }} />
    );
  }

  if (cal.buckets.length === 0) {
    return (
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6,
        padding: 32, textAlign: "center", height: 280,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: GRAY }}>
          No settled trades — calibration chart will appear after settlement
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "16px 8px 8px" }}>
      {/* Header with Brier score */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px", marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: GRAY, letterSpacing: "0.08em" }}>
          MODEL CALIBRATION
        </span>
        {cal.brierScore != null && (
          <span style={{
            fontFamily: mono, fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 3,
            background: cal.brierScore <= 0.15 ? `${TEAL}18` : cal.brierScore <= 0.25 ? `${AMBER}18` : `${RED}18`,
            color: cal.brierScore <= 0.15 ? TEAL : cal.brierScore <= 0.25 ? AMBER : RED,
          }}>
            BRIER: {cal.brierScore.toFixed(3)}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={cal.buckets} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}`} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: GRAY, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: GRAY, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: `${BORDER}40` }} />

          {/* Perfect calibration reference lines at each bucket midpoint */}
          {cal.buckets.map((b) => (
            <ReferenceLine
              key={b.label}
              y={b.expectedWinRate}
              stroke={AMBER}
              strokeDasharray="3 3"
              strokeOpacity={0.3}
            />
          ))}

          <Bar dataKey="actualWinRate" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {cal.buckets.map((b, i) => {
              const diff = Math.abs(b.actualWinRate - b.expectedWinRate);
              const barColor = diff <= 10 ? TEAL : diff <= 20 ? AMBER : RED;
              return <Cell key={i} fill={barColor} fillOpacity={0.8} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ textAlign: "center", fontFamily: mono, fontSize: 9, color: GRAY, padding: "4px 0" }}>
        {cal.totalSettled} settled trades · Bars = actual win rate · Dashed = expected
      </div>
    </div>
  );
}
