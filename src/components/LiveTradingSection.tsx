"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import LiveOverviewCards from "@/components/LiveOverviewCards";
import LiveTradeTable from "@/components/LiveTradeTable";
import PnlChart from "@/components/PnlChart";
import type { Trade } from "@/lib/api";

const G = "#10B981"; // emerald-500
const LS_KEY = "live-hidden-trades";

const liveFilter = (t: Trade) => t.isLive === true;

function loadHiddenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function LiveTradingSection() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(loadHiddenIds);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(hiddenIds)));
  }, [hiddenIds]);

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
            style={{ borderColor: "rgba(16,185,129,0.25)" }}
          />
        </div>
        <div className="relative flex justify-center">
          <span
            className="px-4 text-xs font-mono tracking-widest uppercase"
            style={{ backgroundColor: "#0B0F1A", color: "rgba(16,185,129,0.4)" }}
          >
            section divider
          </span>
        </div>
      </div>

      {/* Section header */}
      <div
        className="rounded-lg px-6 py-5 mb-8 flex items-start justify-between"
        style={{
          backgroundColor: "rgba(16,185,129,0.05)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <Zap size={20} style={{ color: G }} />
          <div>
            <h2
              className="text-lg font-semibold tracking-wider uppercase"
              style={{ color: G }}
            >
              Live Trading
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(16,185,129,0.6)" }}>
              Real orders · Live capital deployed
            </p>
          </div>
        </div>
        <span
          className="font-mono text-xs px-2.5 py-1 rounded mt-0.5"
          style={{
            backgroundColor: "rgba(16,185,129,0.15)",
            color: G,
            border: "1px solid rgba(16,185,129,0.3)",
          }}
        >
          LIVE MODE
        </span>
      </div>

      {/* Sub-sections */}
      <div className="space-y-10">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(16,185,129,0.7)" }}
          >
            Live Overview
          </p>
          <LiveOverviewCards hiddenIds={hiddenIds} />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(16,185,129,0.7)" }}
          >
            Live Trade History
          </p>
          <LiveTradeTable hiddenIds={hiddenIds} setHiddenIds={setHiddenIds} />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(16,185,129,0.7)" }}
          >
            Live PNL Analytics
          </p>
          <PnlChart filterFn={liveFilter} />
        </div>
      </div>
    </div>
  );
}
