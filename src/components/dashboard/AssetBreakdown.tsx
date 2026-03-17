"use client";

import type { DashboardStats, AssetStats } from "@/lib/types";

const ASSET_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  SOL: "#9945FF",
  XRP: "#23292F",
};

function winRateColor(wr: number): string {
  if (wr >= 0.6) return "#00E5CC";
  if (wr >= 0.45) return "#FFB300";
  return "#FF3D57";
}

function pnlColor(pnl: number): string {
  return pnl >= 0 ? "#00E676" : "#FF3D57";
}

function brierColor(b: number): string {
  if (b < 0.2) return "#00E5CC";
  if (b < 0.25) return "#FFB300";
  return "#FF3D57";
}

function fmtPnl(n: number): string {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

function AssetCard({ a }: { a: AssetStats }) {
  const total = a.yesCount + a.noCount;
  const yesPct = total > 0 ? (a.yesCount / total) * 100 : 50;
  const noPct = total > 0 ? (a.noCount / total) * 100 : 50;

  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: "#0F1117",
        border: "1px solid #1A1F2E",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "rgba(0,229,204,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#1A1F2E";
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block"
          style={{ background: ASSET_COLORS[a.asset] ?? "#888" }}
        />
        <span
          style={{
            color: "#00E5CC",
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {a.asset}
        </span>
      </div>

      {/* Win Rate */}
      <div className="mb-2">
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: winRateColor(a.winRate),
          }}
        >
          {(a.winRate * 100).toFixed(1)}%
        </span>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "0.65rem",
            color: "#6B7280",
            marginLeft: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          WIN RATE
        </span>
      </div>

      {/* Trades + PnL */}
      <div
        className="flex items-center gap-3 mb-2"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ color: "#9CA3AF" }}>
          TRADES:{" "}
          <span style={{ color: "#E5E7EB" }}>{a.trades}</span>
        </span>
        <span style={{ color: "#9CA3AF" }}>|</span>
        <span style={{ color: "#9CA3AF" }}>
          Net P&L:{" "}
          <span style={{ color: pnlColor(a.netPnl) }}>
            {fmtPnl(a.netPnl)}
          </span>
        </span>
      </div>

      {/* Detailed Metrics */}
      <div
        className="mb-3"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.65rem",
          color: "#6B7280",
        }}
      >
        EV: {a.avgEvEntered.toFixed(4)} &nbsp;|&nbsp; SPREAD:{" "}
        {a.avgSpread.toFixed(4)} &nbsp;|&nbsp; &sigma;:{" "}
        {a.avgSigmaEwmaAnn.toFixed(3)}
      </div>

      {/* Brier Score */}
      <div className="mb-3">
        <div
          className="flex items-center gap-2 mb-1"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.65rem",
          }}
        >
          <span style={{ color: "#6B7280" }}>BRIER</span>
          <span style={{ color: brierColor(a.brierScore) }}>
            {a.brierScore.toFixed(4)}
          </span>
        </div>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: "4px", background: "#1A1F2E" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(a.brierScore / 0.25, 1) * 100}%`,
              background: brierColor(a.brierScore),
            }}
          />
        </div>
      </div>

      {/* YES/NO Split */}
      <div>
        <div
          className="flex justify-between mb-1"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.6rem",
          }}
        >
          <span style={{ color: "#00E5CC" }}>
            YES: {a.yesCount} ({yesPct.toFixed(0)}%)
          </span>
          <span style={{ color: "#FFB300" }}>
            NO: {a.noCount} ({noPct.toFixed(0)}%)
          </span>
        </div>
        <div
          className="flex w-full rounded-full overflow-hidden"
          style={{ height: "4px" }}
        >
          <div
            style={{
              width: `${yesPct}%`,
              background: "#00E5CC",
            }}
          />
          <div
            style={{
              width: `${noPct}%`,
              background: "#FFB300",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AssetBreakdown({
  stats,
}: {
  stats: DashboardStats;
}) {
  const assets: AssetStats[] = stats.perAsset;

  return (
    <div>
      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6B7280",
          marginBottom: "12px",
        }}
      >
        PER-ASSET BREAKDOWN
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {assets.map((a) => (
          <AssetCard key={a.asset} a={a} />
        ))}
      </div>
    </div>
  );
}
