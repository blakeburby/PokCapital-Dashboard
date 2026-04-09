"use client";

import type { BackendHealth, BackendStatus, WorkerSnapshot } from "@/lib/api";
import { StatusPill, TerminalCell, TerminalPanel, TerminalRow, TerminalTable, type TerminalTone } from "@/components/dashboard/TerminalTable";

function relativeTime(isoOrNull: string | null): string {
  if (!isoOrNull) return "never";
  const ms = Date.now() - new Date(isoOrNull).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function durationBetween(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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

function isOneSidedBook(worker: WorkerSnapshot): boolean {
  const asks = [worker.marketYesAskCents, worker.marketNoAskCents];
  const bids = [worker.marketYesBidCents, worker.marketNoBidCents];
  return asks.some((value) => value != null && value >= 99) || bids.some((value) => value != null && value <= 1);
}

function toneFor(ok: boolean, warn = false): TerminalTone {
  if (!ok) return "red";
  if (warn) return "amber";
  return "green";
}

export default function SystemHealthTable({
  health,
  status,
}: {
  health?: BackendHealth;
  status?: BackendStatus | null;
}) {
  const workers = status?.workers ?? [];
  const backendUrl = process.env.NEXT_PUBLIC_API_BASE?.replace("https://", "") ?? "(not configured)";
  const connected = !!health && health.status === "ok";
  const heartbeatStale = !!health?.lastHeartbeatTimestamp &&
    Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
  const logStale = !!health?.lastLogTimestamp &&
    Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;
  const highLatency = (health?.latencyMs ?? 0) > 1_500;
  const degradedWorkers = workers.filter((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker");
  const orderableWorkers = workers.filter((worker) => worker.hasValidAsk).length;
  const oneSidedWorkers = workers.filter(isOneSidedBook).length;
  const elevatedLagWorkers = workers.filter((worker) => (workerPricingLagMs(worker) ?? 0) > 250).length;
  const pricingHealthy = status?.pricing?.pricingPathHealthy ?? (degradedWorkers.length === 0 && elevatedLagWorkers === 0);
  const startupReady = durationBetween(health?.startup?.startedAt, health?.startup?.systemReadyAt);
  const startupCrypto = durationBetween(health?.startup?.startedAt, health?.startup?.firstCryptoAt);
  const startupMarket = durationBetween(health?.startup?.startedAt, health?.startup?.firstMarketDiscoveryAt);

  const rows: Array<{
    check: string;
    tone: TerminalTone;
    current: string;
    threshold: string;
    lastChange: string;
    detail: string;
  }> = [
    {
      check: "Backend reachability",
      tone: toneFor(connected),
      current: connected ? "connected" : "offline",
      threshold: "required",
      lastChange: connected ? relativeTime(health?.lastHeartbeatTimestamp ?? null) : "now",
      detail: connected ? backendUrl : "backend unhealthy or unreachable",
    },
    {
      check: "Heartbeat freshness",
      tone: toneFor(!!health && !heartbeatStale, !!health && heartbeatStale),
      current: relativeTime(health?.lastHeartbeatTimestamp ?? null),
      threshold: "<10m stale",
      lastChange: relativeTime(health?.lastHeartbeatTimestamp ?? null),
      detail: health ? `${Math.round(health.heartbeatIntervalMs / 60_000)}m interval` : "waiting for backend",
    },
    {
      check: "Pricing path",
      tone: toneFor(pricingHealthy, !pricingHealthy),
      current: pricingHealthy ? "healthy" : "watch",
      threshold: "p95 < 250ms",
      lastChange: "now",
      detail: `eval ${status?.pricing?.lastEvaluationLagMs ?? "—"}ms · rollover ${status?.pricing?.rolloverLagMs ?? "—"}ms`,
    },
    {
      check: "Worker orderability",
      tone: orderableWorkers === workers.length && workers.length > 0 ? "green" : orderableWorkers > 0 ? "amber" : "red",
      current: `${orderableWorkers}/${workers.length || 0}`,
      threshold: "valid asks",
      lastChange: "now",
      detail: `${degradedWorkers.length} fallback · ${oneSidedWorkers} fragile`,
    },
    {
      check: "Logs freshness",
      tone: toneFor(!logStale, logStale),
      current: relativeTime(health?.lastLogTimestamp ?? null),
      threshold: "<2m stale",
      lastChange: relativeTime(health?.lastLogTimestamp ?? null),
      detail: health ? `${health.logCount} buffered log lines` : "waiting for logs",
    },
    {
      check: "API latency",
      tone: toneFor(!highLatency, highLatency),
      current: health?.latencyMs != null ? `${health.latencyMs}ms` : "—",
      threshold: "<1500ms",
      lastChange: "now",
      detail: "dashboard to backend",
    },
    {
      check: "Startup readiness",
      tone: "blue" as TerminalTone,
      current: startupReady,
      threshold: "<5s target",
      lastChange: health?.startup?.systemReadyAt ? relativeTime(health.startup.systemReadyAt) : "deploy",
      detail: `crypto ${startupCrypto} · market ${startupMarket}`,
    },
    {
      check: "Live config",
      tone: health?.liveTradingEnabled ? "green" : "amber",
      current: health?.liveTradingEnabled ? "armed" : "paper",
      threshold: "operator intent",
      lastChange: "now",
      detail: health ? `EV ${health.engineConfig.evMinCents}-${health.engineConfig.evMaxCents}c · min entry ${health.engineConfig.minEntryPriceCents}c` : "config unavailable",
    },
  ];

  const exceptions = [
    !connected ? "backend disconnected" : null,
    heartbeatStale ? "heartbeat stale" : null,
    logStale ? "logs stale" : null,
    highLatency ? `api latency ${health?.latencyMs}ms` : null,
    !pricingHealthy ? "pricing path degraded" : null,
    degradedWorkers.length > 0 ? `${degradedWorkers.length} fallback workers` : null,
    oneSidedWorkers > 0 ? `${oneSidedWorkers} one-sided books` : null,
    elevatedLagWorkers > 0 ? `${elevatedLagWorkers} elevated lag workers` : null,
  ].filter((value): value is string => value != null);

  return (
    <TerminalPanel
      kicker="System Health"
      title="Trust-critical backend view"
      subtitle="Connectivity, freshness, startup timing, pricing path, and live config expressed as aligned terminal checks."
      actions={
        <div className="flex flex-wrap gap-2">
          <StatusPill label={health?.liveTradingEnabled ? "live mode" : "paper mode"} tone={health?.liveTradingEnabled ? "green" : "amber"} />
          {health?.latencyMs != null ? <StatusPill label={`api ${health.latencyMs}ms`} tone={highLatency ? "amber" : "blue"} /> : null}
        </div>
      }
    >
      <TerminalTable columns={["Check", "Status", "Current", "Threshold", "Last Change", "Detail"]}>
        {rows.map((row) => (
          <TerminalRow key={row.check} tone={row.tone}>
            <TerminalCell strong>{row.check}</TerminalCell>
            <TerminalCell><StatusPill label={row.tone === "green" ? "go" : row.tone === "red" ? "no-go" : row.tone === "amber" ? "watch" : "info"} tone={row.tone} /></TerminalCell>
            <TerminalCell mono strong tone={row.tone}>{row.current}</TerminalCell>
            <TerminalCell>{row.threshold}</TerminalCell>
            <TerminalCell>{row.lastChange}</TerminalCell>
            <TerminalCell>{row.detail}</TerminalCell>
          </TerminalRow>
        ))}
      </TerminalTable>
      <div className="mt-3 flex flex-wrap gap-2">
        {exceptions.length > 0 ? exceptions.map((item) => (
          <StatusPill key={item} label={item} tone="amber" />
        )) : <StatusPill label="no active trust exceptions" tone="green" />}
      </div>
    </TerminalPanel>
  );
}
