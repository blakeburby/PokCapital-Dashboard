"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { getTrades, type Trade } from "@/lib/api";
import { Radio, Clock } from "lucide-react";

function useCountdown(closeTime: string | null): string {
  const [remaining, setRemaining] = useState("—");

  useEffect(() => {
    if (!closeTime) { setRemaining("—"); return; }
    const target = new Date(closeTime).getTime();

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s.toString().padStart(2, "0")}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closeTime]);

  return remaining;
}

interface StateRowProps {
  label: string;
  value: React.ReactNode;
}

function StateRow({ label, value }: StateRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className="font-mono text-sm text-right">{value}</span>
    </div>
  );
}

export default function StrategyState() {
  const { data: trades, isLoading } = useSWR<Trade[]>(
    "trades-state",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const latestTrade = trades?.find((t) => t.outcome === "pending") ?? trades?.[0] ?? null;
  const countdown = useCountdown(latestTrade?.closeTime ?? null);
  const hasActiveTrade = latestTrade?.outcome === "pending";

  const edge =
    latestTrade
      ? latestTrade.modelProbability - latestTrade.marketProbability
      : null;

  const kelly =
    edge != null && latestTrade
      ? edge / (1 - latestTrade.marketProbability)
      : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Live Strategy State
        </p>
        {hasActiveTrade && (
          <span className="flex items-center gap-1 badge badge-green">
            <Radio size={9} />
            ACTIVE
          </span>
        )}
      </div>

      <div className="panel">
        {isLoading ? (
          <div className="animate-pulse text-muted text-sm">Loading strategy state...</div>
        ) : !latestTrade ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Clock size={28} className="text-muted" />
            <p className="text-muted text-sm">Waiting for Signal</p>
            <p className="text-xs text-muted opacity-70">
              No trades found. Algorithm is scanning markets.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <StateRow
                label="Asset"
                value={
                  <span className="text-text font-semibold">
                    {latestTrade.asset}
                  </span>
                }
              />
              <StateRow
                label="Strike"
                value={`$${latestTrade.floorStrike.toLocaleString()}`}
              />
              <StateRow
                label="Time Remaining"
                value={
                  <span className={hasActiveTrade ? "text-accent" : "text-muted"}>
                    {countdown}
                  </span>
                }
              />
              <StateRow
                label="Regime"
                value={
                  <span
                    className={`badge ${
                      latestTrade.regime === "R1"
                        ? "badge-green"
                        : latestTrade.regime === "R2"
                        ? "badge-blue"
                        : "badge-red"
                    }`}
                  >
                    {latestTrade.regime}
                  </span>
                }
              />
              <StateRow
                label="Direction"
                value={
                  <span
                    className={
                      latestTrade.direction === "yes"
                        ? "text-profit"
                        : "text-loss"
                    }
                  >
                    {latestTrade.direction.toUpperCase()}
                  </span>
                }
              />
            </div>

            <div>
              <StateRow
                label="Model Probability"
                value={
                  <span className="text-accent">
                    {(latestTrade.modelProbability * 100).toFixed(2)}%
                  </span>
                }
              />
              <StateRow
                label="Market Probability"
                value={`${(latestTrade.marketProbability * 100).toFixed(2)}%`}
              />
              <StateRow
                label="Edge"
                value={
                  edge != null ? (
                    <span className={edge >= 0.1 ? "text-profit" : "text-muted"}>
                      {edge >= 0 ? "+" : ""}
                      {(edge * 100).toFixed(2)}%
                    </span>
                  ) : "—"
                }
              />
              <StateRow
                label="Kelly Fraction"
                value={
                  kelly != null ? (
                    <span className="text-accent">
                      {(Math.min(kelly, 0.1) * 100).toFixed(2)}%
                    </span>
                  ) : "—"
                }
              />
              <StateRow
                label="Confidence"
                value={`${latestTrade.confidence.toFixed(1)}%`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
