"use client";

import type { ReactNode } from "react";
import useSWR from "swr";
import { getEndpointLatency, getHealth, getStatus, type BackendHealth, type BackendStatus, type WorkerSnapshot } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  Clock,
  Gauge,
  Server,
  Shield,
  Target,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

function relativeTime(isoOrNull: string | null): string {
  if (!isoOrNull) return "never";
  const ms = Date.now() - new Date(isoOrNull).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function formatUptime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatAgeMs(value: number | null): string {
  if (value == null) return "—";
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatCents(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}c`;
}

function formatCooldown(value: number): string {
  if (!value) return "ready";
  if (value < 60_000) return `${Math.ceil(value / 1000)}s`;
  return `${Math.ceil(value / 60_000)}m`;
}

type Tone = "green" | "amber" | "red" | "blue" | "violet";

function toneColor(tone: Tone): string {
  if (tone === "green") return "#22C55E";
  if (tone === "amber") return "#F59E0B";
  if (tone === "red") return "#EF4444";
  if (tone === "blue") return "#38BDF8";
  return "#8B5CF6";
}

function workerTone(worker: WorkerSnapshot): Tone {
  if (worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000) return "red";
  if (worker.marketTicker == null || worker.currentPrice == null) return "amber";
  if (worker.noTradeReason) return "amber";
  return "green";
}

interface MiniCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: Tone;
  sub?: string;
}

function MiniCard({ label, value, icon, tone = "blue", sub }: MiniCardProps) {
  const color = toneColor(tone);
  return (
    <div
      className="rounded-xl px-3 py-3 flex flex-col gap-1 min-w-0"
      style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(51,65,85,0.9)" }}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span style={{ color }} className="opacity-80">{icon}</span>}
        <span className="text-[10px] uppercase tracking-wider text-muted font-medium truncate">
          {label}
        </span>
      </div>
      <span className="text-sm font-mono font-semibold truncate" style={{ color }}>
        {value}
      </span>
      {sub ? <span className="text-[10px] text-muted truncate">{sub}</span> : null}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerSnapshot }) {
  const tone = workerTone(worker);
  const accent = toneColor(tone);

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{ backgroundColor: "rgba(15,23,42,0.55)", border: `1px solid ${accent}33` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
            {worker.assetKey.toUpperCase()} Worker
          </p>
          <p className="font-mono text-lg font-semibold text-text">
            {worker.currentPrice != null ? `$${worker.currentPrice.toLocaleString()}` : "No spot"}
          </p>
          <p className="text-xs text-muted truncate">
            {worker.marketTicker ?? "No market assigned"}
          </p>
        </div>
        <span
          className="badge"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          {worker.enginePhase ?? "idle"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted">Price age</p>
          <p className="font-mono" style={{ color: worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000 ? "#EF4444" : "#E2E8F0" }}>
            {formatAgeMs(worker.cryptoPriceAgeMs)}
          </p>
        </div>
        <div>
          <p className="text-muted">Cooldown</p>
          <p className="font-mono text-text">{formatCooldown(worker.cooldownRemainingMs)}</p>
        </div>
        <div>
          <p className="text-muted">Edge / EV</p>
          <p className="font-mono text-text">{formatCents(worker.currentEV)}</p>
        </div>
        <div>
          <p className="text-muted">Spread</p>
          <p className="font-mono text-text">
            {worker.orderbookSpread > 0 ? `${worker.orderbookSpread.toFixed(1)}c` : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted">Model / Market</p>
          <p className="font-mono text-text">
            {formatPercent(worker.modelProbability)} / {formatPercent(worker.marketProbability)}
          </p>
        </div>
        <div>
          <p className="text-muted">Confidence</p>
          <p className="font-mono text-text">
            {formatPercent(worker.confidence)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {worker.regime ? <span className="badge badge-blue">{worker.regime}</span> : null}
        {worker.candidateDirection ? (
          <span className={worker.candidateDirection === "yes" ? "badge badge-green" : "badge badge-red"}>
            {worker.candidateDirection.toUpperCase()}
          </span>
        ) : null}
        {worker.kellyFraction != null ? (
          <span className="badge badge-gray">Kelly {(worker.kellyFraction * 100).toFixed(2)}%</span>
        ) : null}
        {worker.stabilityCount != null ? (
          <span className="badge badge-gray">Stability {worker.stabilityCount}</span>
        ) : null}
      </div>

      <div className="rounded-lg px-2.5 py-2 text-xs" style={{ backgroundColor: "rgba(2,6,23,0.5)" }}>
        <p className="text-muted mb-1">No-trade reason</p>
        <p className="text-text">
          {worker.noTradeReason ?? "Trade path clear; worker waiting on entry conditions"}
        </p>
      </div>
    </div>
  );
}

export default function BackendStatusPanel() {
  const { data: health, error, isLoading } = useSWR<BackendHealth>(
    "backend-health",
    getHealth,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );

  const { data: status } = useSWR<BackendStatus | null>(
    "backend-status",
    getStatus,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );

  const connected = !!health && health.status === "ok" && !error;
  const heartbeatStale = !!health?.lastHeartbeatTimestamp &&
    Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
  const logStale = !!health?.lastLogTimestamp &&
    Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;
  const highLatency = (health?.latencyMs ?? 0) > 1_500;
  const workers = status?.workers ?? [];
  const hardWarnings = workers.filter((worker) =>
    worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000
  );
  const softWarnings = workers.filter((worker) =>
    (worker.marketTicker == null || worker.currentPrice == null) &&
    !hardWarnings.includes(worker)
  );

  const operatorState = !connected || heartbeatStale || hardWarnings.length > 0
    ? "NO-GO"
    : logStale || highLatency || softWarnings.length > 0
      ? "CAUTION"
      : "GO";
  const operatorTone: Tone =
    operatorState === "GO" ? "green" : operatorState === "CAUTION" ? "amber" : "red";

  const backendUrl =
    process.env.NEXT_PUBLIC_API_BASE?.replace("https://", "") ??
    "(not configured)";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${connected ? "rgba(56,189,248,0.18)" : "rgba(239,68,68,0.18)"}` }}
    >
      <div
        className="px-4 py-3 border-b"
        style={{
          background:
            "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(12,18,31,0.92) 55%, rgba(14,165,233,0.08))",
          borderColor: "rgba(51,65,85,0.7)",
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {connected ? (
              <Wifi size={16} style={{ color: toneColor(operatorTone) }} />
            ) : (
              <WifiOff size={16} style={{ color: "#EF4444" }} />
            )}
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted font-medium">
                System Health
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-text">Backend observability</span>
                <span
                  className="badge"
                  style={{ backgroundColor: `${toneColor(operatorTone)}20`, color: toneColor(operatorTone) }}
                >
                  {operatorState}
                </span>
                <span className="text-xs text-muted">{backendUrl}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-gray">Poll 10s</span>
            <span className={health?.liveTradingEnabled ? "badge badge-green" : "badge badge-amber"}>
              {health?.liveTradingEnabled ? "LIVE MODE" : "PAPER MODE"}
            </span>
            {health?.latencyMs != null ? (
              <span className="badge badge-blue">API {health.latencyMs}ms</span>
            ) : null}
          </div>
        </div>
      </div>

      {(heartbeatStale || logStale || highLatency || !connected || hardWarnings.length > 0 || softWarnings.length > 0) && (
        <div
          className="px-4 py-2 text-xs flex flex-wrap gap-2 border-b"
          style={{ backgroundColor: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.16)" }}
        >
          <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
          {!connected ? <span style={{ color: "#EF4444" }}>Backend unreachable or returning unhealthy status</span> : null}
          {heartbeatStale ? <span style={{ color: "#F59E0B" }}>Heartbeat stale ({relativeTime(health?.lastHeartbeatTimestamp ?? null)})</span> : null}
          {logStale ? <span style={{ color: "#F59E0B" }}>Logs stale ({relativeTime(health?.lastLogTimestamp ?? null)})</span> : null}
          {highLatency ? <span style={{ color: "#F59E0B" }}>API latency elevated ({health?.latencyMs}ms)</span> : null}
          {hardWarnings.length > 0 ? (
            <span style={{ color: "#EF4444" }}>
              {hardWarnings.length} worker{hardWarnings.length > 1 ? "s" : ""} on stale crypto pricing
            </span>
          ) : null}
          {softWarnings.length > 0 ? (
            <span style={{ color: "#F59E0B" }}>
              {softWarnings.length} worker{softWarnings.length > 1 ? "s" : ""} missing market or spot data
            </span>
          ) : null}
        </div>
      )}

      {connected && health ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 px-4 py-4" style={{ backgroundColor: "rgba(2,6,23,0.3)" }}>
            <MiniCard
              label="Uptime"
              value={formatUptime(health.uptimeMinutes)}
              sub={`v${health.version}`}
              icon={<Clock size={11} />}
              tone="blue"
            />
            <MiniCard
              label="Workers"
              value={`${health.activeWorkers.length}`}
              sub={health.activeWorkers.join(", ")}
              icon={<Server size={11} />}
              tone="violet"
            />
            <MiniCard
              label="Positions"
              value={`${status?.positionTracker.active ?? 0}/${status?.positionTracker.max ?? 2}`}
              sub="concurrent exposure"
              icon={<Shield size={11} />}
              tone="blue"
            />
            <MiniCard
              label="Heartbeat"
              value={relativeTime(health.lastHeartbeatTimestamp)}
              sub={`${Math.round(health.heartbeatIntervalMs / 60_000)}m interval`}
              icon={<Activity size={11} />}
              tone={heartbeatStale ? "red" : "green"}
            />
            <MiniCard
              label="Trades API"
              value={getEndpointLatency("/api/trades") != null ? `${getEndpointLatency("/api/trades")}ms` : "—"}
              sub="frontend proxy latency"
              icon={<Gauge size={11} />}
              tone={highLatency ? "amber" : "blue"}
            />
            <MiniCard
              label="Trade Count"
              value={`${health.tradeCount}`}
              sub={`${health.pendingTrades} pending / ${health.settledTrades} settled`}
              icon={<Target size={11} />}
              tone="blue"
            />
            <MiniCard
              label="Logs"
              value={`${health.logCount}`}
              sub={relativeTime(health.lastLogTimestamp)}
              icon={<Activity size={11} />}
              tone={logStale ? "amber" : "violet"}
            />
            <MiniCard
              label="Max Trade"
              value={`$${(health.maxTradeCents / 100).toFixed(0)}`}
              sub={`EV ${health.engineConfig.evMinCents}-${health.engineConfig.evMaxCents}c`}
              icon={<Zap size={11} />}
              tone="violet"
            />
            <MiniCard
              label="Stability"
              value={`${health.engineConfig.stabilityWindow}`}
              sub="confirmation ticks"
              icon={<Shield size={11} />}
              tone="blue"
            />
            <MiniCard
              label="Window"
              value={`${Math.round(health.engineConfig.tradingWindowOpenMs / 60_000)}m to ${Math.round(health.engineConfig.tradingWindowCloseMs / 1000)}s`}
              sub={`min entry ${health.engineConfig.minEntryPriceCents}c`}
              icon={<Clock size={11} />}
              tone="blue"
            />
          </div>

          {workers.length > 0 ? (
            <div className="px-4 pb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ backgroundColor: "rgba(2,6,23,0.3)" }}>
              {workers.map((worker) => (
                <WorkerCard key={worker.assetKey} worker={worker} />
              ))}
            </div>
          ) : null}

          {status?.recentEvents?.length ? (
            <div className="px-4 pb-4" style={{ backgroundColor: "rgba(2,6,23,0.3)" }}>
              <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(51,65,85,0.9)" }}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-2">
                  Recent Engine Events
                </p>
                <div className="space-y-1">
                  {status.recentEvents.slice(-6).reverse().map((event, index) => (
                    <p key={`${event}-${index}`} className="text-xs font-mono text-muted truncate">
                      {event}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {isLoading ? (
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: "rgba(30,41,59,0.5)" }} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
