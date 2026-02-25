"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import useSWR from "swr";
import { getTrades, getBinancePrices, type Trade, type ExchangePrice } from "@/lib/api";
import { simulatePaths, classifyRegime } from "@/lib/montecarlo";
import { RefreshCw } from "lucide-react";

const N_PATHS = 1000;
const DEFAULT_VOL = 0.40;
const REPAINT_INTERVAL_MS = 10_000;

interface MCState {
  probAbove: number;
  probBelow: number;
  regime: "R1" | "R2" | "R3";
  price: number;
  strike: number;
  timeToExpiry: number; // seconds
  lastRun: number;
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  paths: number[][],
  meanPath: number[],
  strike: number,
  nSteps: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Find price range
  let minP = Infinity,
    maxP = -Infinity;
  for (const path of paths) {
    for (const p of path) {
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
  }
  // Add padding
  const pad = (maxP - minP) * 0.1 || 1;
  minP -= pad;
  maxP += pad;
  // Ensure strike is visible
  if (strike < minP) minP = strike - pad;
  if (strike > maxP) maxP = strike + pad;

  const pxX = (t: number) => (t / nSteps) * W;
  const pxY = (price: number) =>
    H - ((price - minP) / (maxP - minP)) * H;

  // Draw individual paths (faint)
  ctx.lineWidth = 0.5;
  const aboveColor = "rgba(16,185,129,0.09)";
  const belowColor = "rgba(239,68,68,0.09)";
  for (const path of paths) {
    const finalP = path[path.length - 1];
    ctx.strokeStyle = finalP > strike ? aboveColor : belowColor;
    ctx.beginPath();
    ctx.moveTo(pxX(0), pxY(path[0]));
    for (let t = 1; t < path.length; t++) {
      ctx.lineTo(pxX(t), pxY(path[t]));
    }
    ctx.stroke();
  }

  // Draw strike line
  const strikeY = pxY(strike);
  ctx.strokeStyle = "rgba(239,68,68,0.7)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, strikeY);
  ctx.lineTo(W, strikeY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Strike label
  ctx.fillStyle = "rgba(239,68,68,0.9)";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillText(`Strike $${strike.toLocaleString()}`, 6, strikeY - 5);

  // Draw mean path
  ctx.strokeStyle = "rgba(59,130,246,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pxX(0), pxY(meanPath[0]));
  for (let t = 1; t < meanPath.length; t++) {
    ctx.lineTo(pxX(t), pxY(meanPath[t]));
  }
  ctx.stroke();

  // Current price dot
  ctx.fillStyle = "#E5E7EB";
  ctx.beginPath();
  ctx.arc(pxX(0), pxY(meanPath[0]), 4, 0, 2 * Math.PI);
  ctx.fill();
}

export default function MonteCarloChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mcState, setMcState] = useState<MCState | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data: trades } = useSWR<Trade[]>("trades-mc", getTrades, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  const { data: prices } = useSWR<ExchangePrice[]>(
    "prices-mc",
    getBinancePrices,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const runSimulation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get BTC price from Binance
    const btcEntry = prices?.find((p) => p.symbol === "BTC");
    const currentPrice = btcEntry?.price ?? 95000;

    // Get latest pending trade for strike / expiry
    const latestTrade = trades?.find((t) => t.outcome === "pending") ?? trades?.[0];
    const strike = latestTrade?.floorStrike ?? currentPrice * 1.001;
    const closeTime = latestTrade?.closeTime
      ? new Date(latestTrade.closeTime).getTime()
      : Date.now() + 10 * 60 * 1000;
    const timeToExpiry = Math.max((closeTime - Date.now()) / 1000, 60);

    // Derive vol from regime
    const regime = classifyRegime(DEFAULT_VOL);
    const vol =
      regime === "R1" ? 0.25 : regime === "R2" ? DEFAULT_VOL : 0.65;

    setIsRunning(true);
    // Run in a microtask to allow UI update
    setTimeout(() => {
      const result = simulatePaths(
        currentPrice,
        vol,
        timeToExpiry,
        strike,
        N_PATHS,
        60
      );

      // Draw
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);

      drawCanvas(
        canvas,
        result.paths,
        result.meanPath,
        strike,
        result.steps
      );

      setMcState({
        probAbove: result.probAbove,
        probBelow: result.probBelow,
        regime,
        price: currentPrice,
        strike,
        timeToExpiry,
        lastRun: Date.now(),
      });
      setIsRunning(false);
    }, 0);
  }, [prices, trades]);

  // Run on mount and every REPAINT_INTERVAL_MS
  useEffect(() => {
    runSimulation();
    const id = setInterval(runSimulation, REPAINT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [runSimulation]);

  const latestTrade = trades?.find((t) => t.outcome === "pending") ?? trades?.[0];
  const closeTime = latestTrade?.closeTime
    ? new Date(latestTrade.closeTime).getTime()
    : null;
  const secondsRemaining = closeTime
    ? Math.max(0, Math.floor((closeTime - Date.now()) / 1000))
    : null;
  const minsRemaining = secondsRemaining != null
    ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
    : "—";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Live Monte Carlo Simulation
        </p>
        <button
          onClick={runSimulation}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-panel border border-border text-muted hover:text-text transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={isRunning ? "animate-spin" : ""} />
          {isRunning ? "Running..." : `${N_PATHS} paths`}
        </button>
      </div>

      <div className="panel p-0 overflow-hidden">
        {/* Canvas */}
        <div className="relative" style={{ height: 300 }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />

          {/* Overlays */}
          {mcState && (
            <>
              {/* Top-left: regime + price */}
              <div className="absolute top-3 left-3 flex flex-col gap-1">
                <span
                  className={`badge ${
                    mcState.regime === "R1"
                      ? "badge-green"
                      : mcState.regime === "R2"
                      ? "badge-blue"
                      : "badge-red"
                  }`}
                >
                  {mcState.regime}
                </span>
                <span className="text-xs font-mono text-text bg-black/60 px-1.5 py-0.5 rounded">
                  ${mcState.price.toLocaleString()}
                </span>
              </div>

              {/* Top-right: probabilities */}
              <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                <div className="text-xs font-mono bg-black/70 px-2 py-1 rounded border border-profit/30">
                  <span className="text-muted">P(above) </span>
                  <span className="text-profit font-semibold">
                    {(mcState.probAbove * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs font-mono bg-black/70 px-2 py-1 rounded border border-loss/30">
                  <span className="text-muted">P(below) </span>
                  <span className="text-loss font-semibold">
                    {(mcState.probBelow * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Bottom-left: expiry */}
              <div className="absolute bottom-3 left-3 text-xs font-mono text-muted bg-black/60 px-2 py-1 rounded">
                Expiry in {minsRemaining}
              </div>

              {/* Bottom-right: model info */}
              {latestTrade && (
                <div className="absolute bottom-3 right-3 text-xs font-mono bg-black/60 px-2 py-1 rounded text-right">
                  <div className="text-accent">
                    Model {(latestTrade.modelProbability * 100).toFixed(1)}%
                  </div>
                  <div className="text-muted">
                    Market {(latestTrade.marketProbability * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </>
          )}

          {isRunning && !mcState && (
            <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
              Simulating {N_PATHS} paths...
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-profit opacity-50" />
            Paths above strike
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-loss opacity-50" />
            Paths below strike
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-accent" />
            Mean path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-loss" />
            Strike
          </span>
          {mcState && (
            <span className="ml-auto text-muted">
              Last run: {new Date(mcState.lastRun).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
