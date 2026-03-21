"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { getPaperTrades, type Trade } from "@/lib/api";

const CARD = "#111318";
const BORDER = "#1A1F2E";
const GRAY = "#4B5563";
const TEAL = "#00E5CC";
const RED = "#EF4444";
const mono = "'IBM Plex Mono', monospace";

const ASSET_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  SOL: "#9945FF",
  XRP: "#00AAE4",
};

interface AssetStats {
  asset: string;
  total: number;
  settled: number;
  wins: number;
  losses: number;
  winRate: number | null;
  pnlCents: number;
  avgEv: number;
  yesCount: number;
  noCount: number;
}

function computeAssetStats(trades: Trade[]): AssetStats[] {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    const arr = map.get(t.asset) ?? [];
    arr.push(t);
    map.set(t.asset, arr);
  }

  const order = ["BTC", "ETH", "SOL", "XRP"];
  const result: AssetStats[] = [];

  for (const asset of order) {
    const arr = map.get(asset);
    if (!arr || arr.length === 0) continue;

    const settled = arr.filter((t) => t.outcome !== "pending");
    const wins = settled.filter((t) => t.outcome === "win");
    const losses = settled.filter((t) => t.outcome === "loss");
    const pnlCents = settled.reduce((s, t) => s + (t.pnlTotal ?? 0), 0);
    const avgEv = arr.reduce((s, t) => s + t.ev, 0) / arr.length;
    const yesCount = arr.filter((t) => t.direction === "yes").length;
    const noCount = arr.filter((t) => t.direction === "no").length;

    result.push({
      asset,
      total: arr.length,
      settled: settled.length,
      wins: wins.length,
      losses: losses.length,
      winRate: settled.length > 0 ? wins.length / settled.length : null,
      pnlCents,
      avgEv,
      yesCount,
      noCount,
    });
  }

  return result;
}

function AssetCard({ s }: { s: AssetStats }) {
  const color = ASSET_COLORS[s.asset] ?? GRAY;
  const pnlDollars = s.pnlCents / 100;
  const yesRatio = s.total > 0 ? s.yesCount / s.total : 0;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{
          fontFamily: mono, fontWeight: 700, fontSize: 14, color,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: color, display: "inline-block",
          }} />
          {s.asset}
        </span>
        <span style={{
          fontFamily: mono, fontSize: 9, fontWeight: 700,
          padding: "2px 6px", borderRadius: 3,
          background: `${color}18`, color,
        }}>
          {s.total} TRADES
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.08em" }}>WIN RATE</div>
          <div style={{
            fontFamily: mono, fontSize: 16, fontWeight: 700,
            color: s.winRate != null ? (s.winRate >= 0.5 ? TEAL : RED) : GRAY,
          }}>
            {s.winRate != null ? `${(s.winRate * 100).toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY }}>
            {s.wins}W / {s.losses}L
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.08em" }}>P&L</div>
          <div style={{
            fontFamily: mono, fontSize: 16, fontWeight: 700,
            color: pnlDollars >= 0 ? TEAL : RED,
          }}>
            {pnlDollars >= 0 ? `+$${pnlDollars.toFixed(2)}` : `-$${Math.abs(pnlDollars).toFixed(2)}`}
          </div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY }}>
            {s.settled} settled
          </div>
        </div>
      </div>

      {/* Avg EV */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.08em" }}>AVG EV</div>
        <div style={{
          fontFamily: mono, fontSize: 13, fontWeight: 600,
          color: s.avgEv > 0 ? TEAL : s.avgEv < 0 ? RED : GRAY,
        }}>
          {s.avgEv >= 0 ? "+" : ""}{s.avgEv.toFixed(2)}¢
        </div>
      </div>

      {/* Direction split bar */}
      <div>
        <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.08em", marginBottom: 4 }}>
          YES / NO SPLIT
        </div>
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: BORDER }}>
          <div style={{ width: `${yesRatio * 100}%`, background: TEAL, transition: "width 0.3s" }} />
          <div style={{ width: `${(1 - yesRatio) * 100}%`, background: RED, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 9, fontFamily: mono, color: TEAL }}>{s.yesCount} YES</span>
          <span style={{ fontSize: 9, fontFamily: mono, color: RED }}>{s.noCount} NO</span>
        </div>
      </div>
    </div>
  );
}

export default function PaperAssetBreakdown() {
  const { data: trades, isLoading } = useSWR<Trade[]>(
    "paper-trades-assets",
    getPaperTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const assetStats = useMemo(() => computeAssetStats(trades ?? []), [trades]);

  if (isLoading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="panel animate-pulse" style={{ height: 200, background: CARD }} />
        ))}
      </div>
    );
  }

  if (assetStats.length === 0) {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 24, textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: GRAY }}>No paper trades yet — asset breakdown will appear after trades are placed</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
      {assetStats.map((s) => (
        <AssetCard key={s.asset} s={s} />
      ))}
    </div>
  );
}
