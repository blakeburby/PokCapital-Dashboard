"use client";

import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import KalshiFillsStats from "@/components/KalshiFillsStats";
import KalshiFillsTable from "@/components/KalshiFillsTable";

const V = "#8B5CF6"; // violet-500
const LS_KEY = "kalshi-hidden-fills";

function loadHiddenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function RealTradingSection() {
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
            style={{ borderColor: "rgba(139,92,246,0.25)" }}
          />
        </div>
        <div className="relative flex justify-center">
          <span
            className="px-4 text-xs font-mono tracking-widest uppercase"
            style={{ backgroundColor: "#0B0F1A", color: "rgba(139,92,246,0.4)" }}
          >
            section divider
          </span>
        </div>
      </div>

      {/* Section header */}
      <div
        className="rounded-lg px-6 py-5 mb-8 flex items-start justify-between"
        style={{
          backgroundColor: "rgba(139,92,246,0.05)",
          border: "1px solid rgba(139,92,246,0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <BookOpen size={20} style={{ color: V }} />
          <div>
            <h2
              className="text-lg font-semibold tracking-wider uppercase"
              style={{ color: V }}
            >
              Real Trades
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(139,92,246,0.6)" }}>
              Direct from Kalshi account · Actual fills only
            </p>
          </div>
        </div>
        <span
          className="font-mono text-xs px-2.5 py-1 rounded mt-0.5"
          style={{
            backgroundColor: "rgba(139,92,246,0.15)",
            color: V,
            border: "1px solid rgba(139,92,246,0.3)",
          }}
        >
          ACCOUNT DATA
        </span>
      </div>

      {/* Sub-sections */}
      <div className="space-y-10">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(139,92,246,0.7)" }}
          >
            Account Overview
          </p>
          <KalshiFillsStats hiddenIds={hiddenIds} />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(139,92,246,0.7)" }}
          >
            Fill History
          </p>
          <KalshiFillsTable hiddenIds={hiddenIds} setHiddenIds={setHiddenIds} />
        </div>
      </div>
    </div>
  );
}
