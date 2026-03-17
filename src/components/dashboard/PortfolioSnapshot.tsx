"use client";

import type { DashboardStats } from "@/lib/types";

/* ── colour helpers ─────────────────────────────────────────────── */
const TEAL = "#00E5CC";
const RED = "#FF3D57";
const AMBER = "#FFB300";
const GRAY = "#6B7280";

function pnlColor(v: number) {
  return v >= 0 ? TEAL : RED;
}
function brierColor(v: number) {
  if (v < 0.25) return TEAL;
  if (v <= 0.3) return AMBER;
  return RED;
}
function sharpeColor(v: number) {
  if (v > 1) return TEAL;
  if (v >= 0) return AMBER;
  return RED;
}
function driftColor(v: number) {
  const abs = Math.abs(v);
  if (abs <= 0.01) return TEAL;
  if (abs <= 0.1) return AMBER;
  return RED;
}

/* ── chip ───────────────────────────────────────────────────────── */
function Chip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 90,
        padding: "6px 10px",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontFamily: "'IBM Plex Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: GRAY,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600,
          color,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────── */
export default function PortfolioSnapshot({
  stats,
}: {
  stats: DashboardStats;
}) {
  const arrow = stats.totalPnl >= 0 ? "▲" : "▼";
  const evDrift = stats.avgEvRealized - stats.avgEvEntered;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "#0A0B0D",
        borderBottom: "1px solid rgba(0,229,204,0.2)",
        padding: "8px 16px 6px",
      }}
    >
      {/* ── primary row ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
        }}
      >
        <Chip
          label="Total P&L"
          value={`${arrow} $${Math.abs(stats.totalPnl).toFixed(2)}`}
          color={pnlColor(stats.totalPnl)}
        />
        <Chip
          label="Win Rate"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          color={TEAL}
        />
        <Chip
          label="Win Rate (L50)"
          value={`${(stats.winRateLast50 * 100).toFixed(1)}%`}
          color={TEAL}
        />
        <Chip
          label="Trades / Open"
          value={`${stats.totalTrades}`}
          color="#E5E7EB"
        />
        {/* open count appended in amber */}
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 14,
            fontWeight: 600,
            color: AMBER,
            marginLeft: -6,
            marginTop: 12,
          }}
        >
          &nbsp;| {stats.openPositions}
        </span>

        <Chip
          label="Bankroll"
          value={`$${stats.bankroll.toFixed(2)}`}
          color="#E5E7EB"
        />
        <Chip
          label="Sharpe"
          value={stats.sharpeRatio.toFixed(3)}
          color={sharpeColor(stats.sharpeRatio)}
        />
        <Chip
          label="Max DD"
          value={`$${Math.abs(stats.maxDrawdownAllTime).toFixed(2)}`}
          color={RED}
        />
        <Chip
          label="Brier"
          value={stats.brierScore.toFixed(4)}
          color={brierColor(stats.brierScore)}
        />
      </div>

      {/* ── secondary row: EV validation ────────────────────────── */}
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          fontFamily: "'IBM Plex Mono', monospace",
          color: GRAY,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span>
          AVG EV ENTERED:{" "}
          <span style={{ color: "#E5E7EB" }}>
            {stats.avgEvEntered.toFixed(4)}
          </span>
        </span>
        <span style={{ color: TEAL }}>→</span>
        <span>
          AVG EV REALIZED:{" "}
          <span style={{ color: "#E5E7EB" }}>
            {stats.avgEvRealized.toFixed(4)}
          </span>
        </span>
        <span style={{ color: GRAY }}>|</span>
        <span>
          EV DRIFT:{" "}
          <span style={{ color: driftColor(evDrift) }}>
            {evDrift >= 0 ? "+" : ""}
            {evDrift.toFixed(4)}
          </span>
        </span>
      </div>
    </div>
  );
}
