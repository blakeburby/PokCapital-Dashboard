"use client";

import StatsCards from "@/components/StatsCards";
import PnlChart from "@/components/PnlChart";
import TradeTable from "@/components/TradeTable";
import LogsPanel from "@/components/LogsPanel";
import PaperTradingSection from "@/components/PaperTradingSection";

export default function Dashboard() {
  return (
    <main
      style={{
        backgroundColor: "#0B0F1A",
        minHeight: "100vh",
        color: "#E5E7EB",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1F2937",
          backgroundColor: "#0B0F1A",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
            <span className="text-sm font-semibold tracking-wide">
              POKCAPITAL
            </span>
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{
                backgroundColor: "rgba(59,130,246,0.15)",
                color: "#3B82F6",
              }}
            >
              ALGORITHM MONITOR
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>
              Backend:{" "}
              <span className="font-mono text-text">
                {process.env.NEXT_PUBLIC_API_BASE?.replace("https://", "") ??
                  "pokcapitalweb-production.up.railway.app"}
              </span>
            </span>
            <span>
              Refresh: <span className="font-mono text-text">5s</span>
            </span>
          </div>
        </div>
      </header>

      {/* ── ALGORITHM MONITOR ── */}
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-10">

        {/* 1 — Strategy Overview */}
        <section>
          <StatsCards />
        </section>

        {/* ── PAPER TRADING ── */}
        <section>
          <PaperTradingSection
            labels={[
              "Paper Trading PNL Analytics",
              "Paper Trade History",
              "Deploy Logs",
            ]}
          >
            <PnlChart />
            <TradeTable />
            <LogsPanel />
          </PaperTradingSection>
        </section>

      </div>

      {/* Footer */}
      <footer
        className="text-center text-xs text-muted py-8"
        style={{ borderTop: "1px solid #1F2937" }}
      >
        PokCapital Algorithm Monitor · Unified Monte Carlo Trading Engine ·{" "}
        <span className="font-mono">v1.0.0</span>
      </footer>
    </main>
  );
}
