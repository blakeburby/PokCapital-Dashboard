"use client";

import type { ReactNode } from "react";
import { type BackendHealth, type BackendStatus, type WorkerSnapshot } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  Clock,
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

function formatAgeMs(value: number | null): string {
  if (value == null) return "—";
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatLatency(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatBook(worker: WorkerSnapshot): string {
  const yesBid = worker.marketYesBidCents;
  const yesAsk = worker.marketYesAskCents;
  const noBid = worker.marketNoBidCents;
  const noAsk = worker.marketNoAskCents;
  if ([yesBid, yesAsk, noBid, noAsk].every((value) => value == null)) return "—";
  return `Y ${yesBid ?? "—"}/${yesAsk ?? "—"} · N ${noBid ?? "—"}/${noAsk ?? "—"}`;
}

function formatMarketSource(source: string | null | undefined): string {
  if (!source) return "—";
  if (source === "kalshi_ws_ticker") return "ws";
  if (source === "kalshi_rest_detail") return "detail";
  if (source === "kalshi_rest_orderbook_fp") return "orderbook";
  return source.replace(/^kalshi_/, "").replace(/_/g, " ");
}

function isOneSidedBook(worker: WorkerSnapshot): boolean {
  const asks = [worker.marketYesAskCents, worker.marketNoAskCents];
  const bids = [worker.marketYesBidCents, worker.marketNoBidCents];
  return asks.some((value) => value != null && value >= 99) || bids.some((value) => value != null && value <= 1);
}

function workerPricingLagMs(worker: WorkerSnapshot): number | null {
  const candidates = [
    worker.pricingLatency?.lastEvaluationLagMs,
    worker.pricingLatency?.cryptoApplyLagMs,
    worker.pricingLatency?.marketApplyLagMs,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

type Tone = "green" | "amber" | "red" | "blue" | "violet";
const QUOTE_ALERT_MS = 6_000;

function toneColor(tone: Tone): string {
  if (tone === "green") return "#22C55E";
  if (tone === "amber") return "#F59E0B";
  if (tone === "red") return "#EF4444";
  if (tone === "blue") return "#38BDF8";
  return "#8B5CF6";
}

function workerTone(worker: WorkerSnapshot): Tone {
  if (worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > QUOTE_ALERT_MS) return "red";
  if (isOneSidedBook(worker)) return "amber";
  if (worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker") return "amber";
  if (worker.marketTicker == null || worker.currentPrice == null || worker.hasValidAsk === false) return "amber";
  const reason = (worker.noTradeReason ?? "").toLowerCase();
  if (reason.includes("crypto") || reason.includes("spot") || reason.includes("market") || reason.includes("ask")) return "amber";
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

interface BackendStatusPanelProps {
  health?: BackendHealth;
  status?: BackendStatus | null;
}

function durationBetween(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function BackendStatusPanel({ health, status }: BackendStatusPanelProps) {
  const error = !health || health.status !== "ok";
  const isLoading = !health;

  const connected = !!health && health.status === "ok" && !error;
  const heartbeatStale = !!health?.lastHeartbeatTimestamp &&
    Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
  const logStale = !!health?.lastLogTimestamp &&
    Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;
  const highLatency = (health?.latencyMs ?? 0) > 1_500;
  const workers = status?.workers ?? [];
  const hardWarnings = workers.filter((worker) =>
    worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > QUOTE_ALERT_MS
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

  const startupReady = durationBetween(health?.startup?.startedAt, health?.startup?.systemReadyAt);
  const startupCrypto = durationBetween(health?.startup?.startedAt, health?.startup?.firstCryptoAt);
  const startupMarket = durationBetween(health?.startup?.startedAt, health?.startup?.firstMarketDiscoveryAt);
  const degradedWorkers = workers.filter((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker");
  const orderableWorkers = workers.filter((worker) => worker.hasValidAsk).length;
  const oneSidedWorkers = workers.filter(isOneSidedBook).length;
  const elevatedLagWorkers = workers.filter((worker) => (workerPricingLagMs(worker) ?? 0) > 250).length;
  const pricingHealthy = status?.pricing?.pricingPathHealthy ?? (degradedWorkers.length === 0 && elevatedLagWorkers === 0);

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
          <div className="px-4 py-4 space-y-3" style={{ backgroundColor: "rgba(2,6,23,0.3)" }}>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
              <MiniCard
                label="Connectivity"
                value={connected ? "Connected" : "Offline"}
                sub={backendUrl}
                icon={connected ? <Wifi size={11} /> : <WifiOff size={11} />}
                tone={connected ? "green" : "red"}
              />
              <MiniCard
                label="Heartbeat"
                value={relativeTime(health.lastHeartbeatTimestamp)}
                sub={`${Math.round(health.heartbeatIntervalMs / 60_000)}m interval`}
                icon={<Activity size={11} />}
                tone={heartbeatStale ? "red" : "green"}
              />
              <MiniCard
                label="Pricing Path"
                value={pricingHealthy ? "Healthy" : "Watch"}
                sub={`eval ${formatLatency(status?.pricing?.lastEvaluationLagMs)} · rollover ${formatLatency(status?.pricing?.rolloverLagMs)}`}
                icon={<Zap size={11} />}
                tone={pricingHealthy ? "green" : "amber"}
              />
              <MiniCard
                label="Orderable"
                value={`${orderableWorkers}/${workers.length || 0}`}
                sub="workers with valid asks"
                icon={<Target size={11} />}
                tone={
                  workers.length === 0
                    ? "blue"
                    : orderableWorkers === workers.length
                      ? "green"
                      : orderableWorkers > 0
                        ? "amber"
                        : "red"
                }
              />
              <MiniCard
                label="Fallback Workers"
                value={String(degradedWorkers.length)}
                sub="not on ws ticker"
                icon={<Server size={11} />}
                tone={degradedWorkers.length > 0 ? "amber" : "green"}
              />
              <MiniCard
                label="Fragile Books"
                value={String(oneSidedWorkers)}
                sub="one-sided top of book"
                icon={<AlertTriangle size={11} />}
                tone={oneSidedWorkers > 0 ? "amber" : "green"}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              <MiniCard
                label="API Latency"
                value={health.latencyMs != null ? `${health.latencyMs}ms` : "—"}
                sub="dashboard to backend"
                icon={<Wifi size={11} />}
                tone={highLatency ? "amber" : "blue"}
              />
              <MiniCard
                label="Exposure"
                value={`${status?.positionTracker.active ?? 0}/${status?.positionTracker.max ?? 2}`}
                sub="active positions"
                icon={<Shield size={11} />}
                tone={(status?.positionTracker.active ?? 0) > 0 ? "green" : "blue"}
              />
              <MiniCard
                label="Startup Ready"
                value={startupReady}
                sub={`crypto ${startupCrypto} · market ${startupMarket}`}
                icon={<Clock size={11} />}
                tone="green"
              />
              <MiniCard
                label="Logs"
                value={`${health.logCount}`}
                sub={relativeTime(health.lastLogTimestamp)}
                icon={<Activity size={11} />}
                tone={logStale ? "amber" : "violet"}
              />
              <MiniCard
                label="Live Config"
                value={`EV ${health.engineConfig.evMinCents}-${health.engineConfig.evMaxCents}c`}
                sub={`${Math.round(health.engineConfig.tradingWindowOpenMs / 60_000)}m to ${Math.round(health.engineConfig.tradingWindowCloseMs / 1000)}s · min entry ${health.engineConfig.minEntryPriceCents}c`}
                icon={<Shield size={11} />}
                tone="blue"
              />
            </div>
          </div>

          <div className="px-4 pb-4 grid gap-3 xl:grid-cols-[0.95fr_1.05fr]" style={{ backgroundColor: "rgba(2,6,23,0.3)" }}>
            <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(51,65,85,0.9)" }}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-2">
                Active exceptions
              </p>
              <div className="flex flex-wrap gap-2">
                {!connected ? <span className="badge badge-red">backend disconnected</span> : null}
                {heartbeatStale ? <span className="badge badge-red">heartbeat stale</span> : null}
                {logStale ? <span className="badge badge-amber">logs stale</span> : null}
                {highLatency ? <span className="badge badge-amber">latency {health.latencyMs}ms</span> : null}
                {!pricingHealthy ? <span className="badge badge-amber">pricing path degraded</span> : null}
                {hardWarnings.length > 0 ? <span className="badge badge-red">{hardWarnings.length} stale quote worker{hardWarnings.length === 1 ? "" : "s"}</span> : null}
                {softWarnings.length > 0 ? <span className="badge badge-amber">{softWarnings.length} missing market/spot worker{softWarnings.length === 1 ? "" : "s"}</span> : null}
                {degradedWorkers.length > 0 ? <span className="badge badge-amber">{degradedWorkers.length} fallback data source worker{degradedWorkers.length === 1 ? "" : "s"}</span> : null}
                {elevatedLagWorkers > 0 ? <span className="badge badge-amber">{elevatedLagWorkers} elevated lag worker{elevatedLagWorkers === 1 ? "" : "s"}</span> : null}
                {oneSidedWorkers > 0 ? <span className="badge badge-amber">{oneSidedWorkers} one-sided book worker{oneSidedWorkers === 1 ? "" : "s"}</span> : null}
                {hardWarnings.length === 0 && softWarnings.length === 0 && !heartbeatStale && !logStale && !highLatency && pricingHealthy && oneSidedWorkers === 0 ? (
                  <span className="badge badge-green">no active trust exceptions</span>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(2,6,23,0.45)" }}>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Runtime</p>
                  <p className="mt-1 font-mono text-text">{formatUptime(health.uptimeMinutes)}</p>
                  <p className="text-xs text-muted">v{health.version}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(2,6,23,0.45)" }}>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Workers</p>
                  <p className="mt-1 font-mono text-text">{health.activeWorkers.length}</p>
                  <p className="text-xs text-muted">{health.activeWorkers.join(", ")}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(51,65,85,0.9)" }}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-2">
                Worker trust rail
              </p>
              <div className="space-y-2 text-xs">
                {workers.map((worker) => {
                  const tone = workerTone(worker);
                  const lag = workerPricingLagMs(worker);
                  return (
                    <div
                      key={worker.assetKey}
                      className="rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: "rgba(2,6,23,0.45)",
                        boxShadow: `inset 3px 0 0 ${toneColor(tone)}33`,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">{worker.assetKey.toUpperCase()}</span>
                          <span className={worker.hasValidAsk ? (isOneSidedBook(worker) ? "badge badge-amber" : "badge badge-green") : "badge badge-amber"}>
                            {worker.hasValidAsk ? (isOneSidedBook(worker) ? "fragile" : "ready") : "blocked"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-gray">{formatMarketSource(worker.marketDataSource)}</span>
                          <span className="badge badge-gray">age {formatAgeMs(worker.cryptoPriceAgeMs)}</span>
                          <span className="badge badge-gray">lag {formatLatency(lag)}</span>
                        </div>
                      </div>
                      <div className="mt-1 grid gap-1 text-[11px] text-muted md:grid-cols-[minmax(0,1fr)_auto]">
                        <span className="font-mono break-all">{worker.marketTicker ?? "—"}</span>
                        <span className="font-mono">book {formatBook(worker)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
