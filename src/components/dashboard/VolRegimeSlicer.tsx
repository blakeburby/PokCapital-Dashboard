"use client";

import type { DashboardStats } from "@/lib/types";

const REGIME_COLORS: Record<string, string> = {
  LOW: "#00E5CC",
  MEDIUM: "#FFB300",
  HIGH: "#FF3D57",
};

function winRateColor(wr: number): string {
  if (wr >= 0.6) return "#00E5CC";
  if (wr >= 0.45) return "#FFB300";
  return "#FF3D57";
}

function driftColor(drift: number): string {
  const abs = Math.abs(drift);
  if (abs > 0.1) return "#FF3D57";
  if (abs > 0.01) return "#FFB300";
  return "#6B7280";
}

export default function VolRegimeSlicer({
  stats,
}: {
  stats: DashboardStats;
}) {
  const rows = stats.volRegimeTable;

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "#0F1117", border: "1px solid #1A1F2E" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
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
          VOL REGIME SLICER
        </p>
        <span
          title="HIGH vol degradation = check λ_J or σ_J params. LOW vol = model underpriced tails."
          style={{
            cursor: "help",
            fontSize: "0.7rem",
            color: "#6B7280",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          [?]
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.6rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6B7280",
              }}
            >
              <th className="text-left py-2 pr-3">REGIME</th>
              <th className="text-right py-2 px-3">TRADES</th>
              <th className="text-right py-2 px-3">WIN %</th>
              <th className="text-right py-2 px-3">NET P&L</th>
              <th className="text-right py-2 px-3">AVG EV ENTERED</th>
              <th className="text-right py-2 px-3">AVG EV REALIZED</th>
              <th className="text-right py-2 px-3">EV DRIFT</th>
              <th className="text-right py-2 pl-3">BRIER</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const drift = row.avgEvRealized - row.avgEvEntered;
              return (
                <tr
                  key={row.label}
                  style={{
                    background: i % 2 === 0 ? "#0F1117" : "#141720",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  <td className="py-2 pr-3">
                    <span
                      className="inline-block rounded px-2 py-0.5"
                      style={{
                        background: `${REGIME_COLORS[row.label] ?? "#6B7280"}20`,
                        color: REGIME_COLORS[row.label] ?? "#6B7280",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {row.label}
                    </span>
                  </td>
                  <td className="text-right py-2 px-3" style={{ color: "#E5E7EB" }}>
                    {row.trades}
                  </td>
                  <td
                    className="text-right py-2 px-3"
                    style={{ color: winRateColor(row.winRate) }}
                  >
                    {(row.winRate * 100).toFixed(1)}%
                  </td>
                  <td
                    className="text-right py-2 px-3"
                    style={{
                      color: row.netPnl >= 0 ? "#00E5CC" : "#FF3D57",
                    }}
                  >
                    {row.netPnl >= 0
                      ? `+$${row.netPnl.toFixed(2)}`
                      : `-$${Math.abs(row.netPnl).toFixed(2)}`}
                  </td>
                  <td className="text-right py-2 px-3" style={{ color: "#E5E7EB" }}>
                    {row.avgEvEntered.toFixed(4)}
                  </td>
                  <td className="text-right py-2 px-3" style={{ color: "#E5E7EB" }}>
                    {row.avgEvRealized.toFixed(4)}
                  </td>
                  <td
                    className="text-right py-2 px-3"
                    style={{ color: driftColor(drift) }}
                  >
                    {drift >= 0 ? "+" : ""}
                    {drift.toFixed(4)}
                  </td>
                  <td className="text-right py-2 pl-3" style={{ color: "#E5E7EB" }}>
                    {row.brierScore.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
