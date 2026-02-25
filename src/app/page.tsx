"use client";

import dynamic from "next/dynamic";
import StatsCards from "@/components/StatsCards";
import PnlChart from "@/components/PnlChart";
import TradeTable from "@/components/TradeTable";
import PriceFeeds from "@/components/PriceFeeds";
import StrategyState from "@/components/StrategyState";
import LogsPanel from "@/components/LogsPanel";

// Canvas-based chart requires client-only rendering (no SSR)
const MonteCarloChart = dynamic(() => import("@/components/MonteCarloChart"), {
  ssr: false,
  loading: () => (
    <div
      className="panel flex items-center justify-center text-muted text-sm animate-pulse"
      style={{ height: 340 }}
    >
      Loading Monte Carlo simulation...
    </div>
  ),
});

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
            <div
              className="w-2 h-2 rounded-full bg-profit animate-pulse"
            />
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
              Refresh:{" "}
              <span className="font-mono text-text">5s</span>
            </span>
          </div>
        </div>
      </header>

      {/* Dashboard sections */}
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-10">

        {/* 1 — Strategy Overview */}
        <section>
          <StatsCards />
        </section>

        {/* 2 — PNL Analytics */}
        <section>
          <PnlChart />
        </section>

        {/* 3 — Trade History */}
        <section>
          <TradeTable />
        </section>

        {/* 4 — Monte Carlo Visualization */}
        <section>
          <MonteCarloChart />
        </section>

        {/* 5 — Live Crypto Prices */}
        <section>
          <PriceFeeds />
        </section>

        {/* 6 — Strategy State */}
        <section>
          <StrategyState />
        </section>

        {/* 7 — Logs Panel */}
        <section>
          <LogsPanel />
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
