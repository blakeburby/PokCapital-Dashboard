"use client";

import React from "react";
import useSWR from "swr";
import { FlaskConical } from "lucide-react";
import { getPaperBalance, type PaperBalance } from "@/lib/api";
import PaperFillsStats from "@/components/PaperFillsStats";
import PaperAccountChart from "@/components/PaperAccountChart";
import PaperFillsTable from "@/components/PaperFillsTable";

const A = "#F59E0B";

export default function PaperTradingSection() {
  const { data: balance } = useSWR<PaperBalance>(
    "paper-balance",
    getPaperBalance,
    { refreshInterval: 5_000, revalidateOnFocus: false }
  );

  return (
    <div>
      {/* Divider + header */}
      <div className="relative my-4">
        <div
          className="absolute inset-0 flex items-center"
          aria-hidden="true"
        >
          <div
            className="w-full border-t"
            style={{ borderColor: "rgba(245,158,11,0.25)" }}
          />
        </div>
        <div className="relative flex justify-center">
          <span
            className="px-4 text-xs font-mono tracking-widest uppercase"
            style={{ backgroundColor: "#0B0F1A", color: "rgba(245,158,11,0.4)" }}
          >
            section divider
          </span>
        </div>
      </div>

      {/* Section header */}
      <div
        className="rounded-lg px-6 py-5 mb-8 flex items-start justify-between"
        style={{
          backgroundColor: "rgba(245,158,11,0.05)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <FlaskConical size={20} style={{ color: A }} />
          <div>
            <h2
              className="text-lg font-semibold tracking-wider uppercase"
              style={{ color: A }}
            >
              Paper Trading
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(245,158,11,0.6)" }}>
              Simulated trades · No real capital at risk
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="font-mono font-semibold tracking-tight"
            style={{ fontSize: "1.5rem", color: A }}
          >
            {balance ? `$${balance.balanceDollars.toFixed(2)}` : "—"}
          </span>
          <span className="text-xs text-muted">
            Paper Balance
            {balance ? ` (started $${balance.startingBalanceDollars.toFixed(2)})` : ""}
          </span>
          <span
            className="font-mono text-xs px-2.5 py-0.5 rounded"
            style={{
              backgroundColor: "rgba(245,158,11,0.15)",
              color: A,
              border: "1px solid rgba(245,158,11,0.3)",
            }}
          >
            SIM MODE
          </span>
        </div>
      </div>

      {/* Sub-sections */}
      <div className="space-y-10">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(245,158,11,0.7)" }}
          >
            Paper Account Overview
          </p>
          <PaperFillsStats />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(245,158,11,0.7)" }}
          >
            Paper Equity Curve
          </p>
          <PaperAccountChart />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(245,158,11,0.7)" }}
          >
            Paper Fill History
          </p>
          <PaperFillsTable />
        </div>
      </div>
    </div>
  );
}
