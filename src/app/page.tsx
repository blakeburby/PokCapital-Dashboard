"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Trade } from "@/lib/types";
import { loadTrades, saveTrades } from "@/lib/storage";
import { computeStats } from "@/lib/calculations";
import { exportStatsSummary } from "@/lib/export";

import PortfolioSnapshot from "@/components/dashboard/PortfolioSnapshot";
import CalibrationChart from "@/components/dashboard/CalibrationChart";
import EquityCurve from "@/components/dashboard/EquityCurve";
import AssetBreakdown from "@/components/dashboard/AssetBreakdown";
import VolRegimeSlicer from "@/components/dashboard/VolRegimeSlicer";
import MoneynessSlicer from "@/components/dashboard/MoneynessSlicer";
import RollingEVChart from "@/components/dashboard/RollingEVChart";
import TradeLogTable from "@/components/dashboard/TradeLogTable";
import LogTradeModal from "@/components/dashboard/LogTradeModal";
import SettleTradeModal from "@/components/dashboard/SettleTradeModal";

const TEAL = "#00E5CC";
const GRAY = "#4B5563";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9,
      fontFamily: "'IBM Plex Mono', monospace",
      color: GRAY,
      letterSpacing: "0.12em",
      textTransform: "uppercase" as const,
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<Trade | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTrades(loadTrades());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveTrades(trades);
  }, [trades, mounted]);

  const stats = useMemo(() => computeStats(trades), [trades]);

  const addTrade = useCallback((trade: Trade) => {
    setTrades(prev => [...prev, trade]);
  }, []);

  const settleTrade = useCallback((updated: Trade) => {
    setTrades(prev => prev.map(t => t.trade_id === updated.trade_id ? updated : t));
  }, []);

  const nextId = useMemo(() => {
    if (!trades.length) return 1;
    return Math.max(...trades.map(t => t.trade_id)) + 1;
  }, [trades]);

  const lastBankroll = useMemo(() => {
    const settled = trades.filter(t => t.bankroll_after !== null);
    if (!settled.length) return 500;
    return settled[settled.length - 1].bankroll_after ?? 500;
  }, [trades]);

  if (!mounted) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", color: TEAL,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
        letterSpacing: "0.1em",
      }}>
        LOADING...
      </div>
    );
  }

  return (
    <main style={{ backgroundColor: "#0A0B0D", minHeight: "100vh", color: "#E2E8F0" }}>

      {/* ── sticky header ─────────────────────────────────────────── */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "#0A0B0D",
        borderBottom: "1px solid #1A1F2E",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: TEAL, boxShadow: `0 0 6px ${TEAL}`,
          }} />
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
            fontSize: 13, color: "#E2E8F0", letterSpacing: "0.12em",
          }}>
            POK CAPITAL
          </span>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
            padding: "2px 7px", borderRadius: 3,
            background: "rgba(0,229,204,0.1)", color: TEAL,
            letterSpacing: "0.1em",
          }}>
            TRADE LOG
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: GRAY }}>
            {trades.length} trades &nbsp;|&nbsp;{" "}
            <span style={{ color: "#FFB300" }}>{stats.openPositions} open</span>
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: GRAY }}>
            bankroll{" "}
            <span style={{ color: "#E2E8F0", fontWeight: 600 }}>${stats.bankroll.toFixed(2)}</span>
          </span>
          <button
            onClick={() => exportStatsSummary(stats)}
            style={{
              padding: "3px 10px",
              background: "transparent",
              border: "1px solid #1A1F2E",
              borderRadius: 3,
              color: GRAY,
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            STATS CSV
          </button>
        </div>
      </header>

      {/* ── portfolio snapshot bar ─────────────────────────────────── */}
      <PortfolioSnapshot stats={stats} />

      {/* ── main content ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* row 1: calibration + equity curve */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <SectionLabel>Model Calibration — Predicted vs Actual Win Rate</SectionLabel>
            <CalibrationChart trades={trades} />
          </div>
          <div>
            <SectionLabel>Equity Curve — Cumulative Net P&L</SectionLabel>
            <EquityCurve trades={trades} />
          </div>
        </div>

        {/* row 2: asset breakdown */}
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Per-Asset Performance Breakdown</SectionLabel>
          <AssetBreakdown stats={stats} />
        </div>

        {/* row 3: vol regime + moneyness slicers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <SectionLabel>Performance by Volatility Regime</SectionLabel>
            <VolRegimeSlicer stats={stats} />
          </div>
          <div>
            <SectionLabel>Performance by Moneyness Bucket</SectionLabel>
            <MoneynessSlicer stats={stats} />
          </div>
        </div>

        {/* row 4: rolling EV */}
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Rolling EV — Entered vs Realized (100-trade window)</SectionLabel>
          <RollingEVChart trades={trades} />
        </div>

        {/* row 5: trade log */}
        <TradeLogTable
          trades={trades}
          onLogTrade={() => setLogOpen(true)}
          onSettleTrade={t => setSettleTarget(t)}
        />

      </div>

      {/* footer */}
      <footer style={{
        textAlign: "center",
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        color: GRAY,
        padding: "16px 0 24px",
        borderTop: "1px solid #1A1F2E",
        letterSpacing: "0.08em",
      }}>
        POK CAPITAL &middot; MODIFIED BLACK-SCHOLES v1.1 &middot; KALSHI BINARY CONTRACTS &middot; localStorage
      </footer>

      {/* modals */}
      <LogTradeModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSubmit={addTrade}
        nextId={nextId}
        lastBankroll={lastBankroll}
      />
      <SettleTradeModal
        trade={settleTarget}
        onClose={() => setSettleTarget(null)}
        onSettle={settleTrade}
      />
    </main>
  );
}
