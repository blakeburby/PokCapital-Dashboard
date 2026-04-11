"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Database,
  DollarSign,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Waves,
} from "lucide-react";
import RealAccountChart from "@/components/RealAccountChart";
import AnomaliesTable from "@/components/dashboard/AnomaliesTable";
import ExecutionStateTable from "@/components/dashboard/ExecutionStateTable";
import GateSummaryTable from "@/components/dashboard/GateSummaryTable";
import GlobalStatusBar from "@/components/dashboard/GlobalStatusBar";
import SystemHealthTable from "@/components/dashboard/SystemHealthTable";
import {
  clearAlertPreference,
  deriveFillNetPnlCents,
  getAlertPreferences,
  getAnalytics,
  getBalance,
  getFillPriceCents,
  getFills,
  getHealth,
  getLogs,
  getPaperBalance,
  getPaperStats,
  getStatus,
  getTerminalStreamUrl,
  getTradesWithOptions,
  type AccountBalance,
  type AlertPreference,
  type BackendHealth,
  type BackendStatus,
  type BreakdownRow,
  type FillAnalytics,
  type FillsWindow,
  type KalshiFill,
  type LogsResponse,
  type PaperBalance,
  type Stats,
  type TerminalSnapshot,
  type TerminalWorkerSnapshot,
  type Trade,
  upsertAlertPreference,
} from "@/lib/api";

const CORE_REFRESH_MS = 10_000;
const ANALYTICS_REFRESH_MS = 30_000;
const BALANCE_REFRESH_MS = 30_000;
const PAPER_REFRESH_MS = 60_000;
const TRADE_REFRESH_MS = 15_000;
const FILL_REFRESH_MS = 45_000;
const LOG_REFRESH_MS = 20_000;
const FILL_LIMIT = 180;
const EXTENDED_FILL_LIMIT = 500;
const LOG_LIMIT = 220;
const TRADE_LIMIT = 40;
const STRATEGY_ASSET_SET = new Set(["BTC", "ETH", "SOL", "XRP"]);
const ALERT_THRESHOLDS = {
  warningQuoteAgeMs: 3_000,
  criticalQuoteAgeMs: 6_000,
  warningPricingLagMs: 100,
  criticalPricingLagMs: 250,
  rejectedOrdersInWindow: 1,
  fallbackWorkers: 1,
  oneSidedBooks: 1,
  executionGapCommits: 1,
  dataWarnings: 2,
} as const;

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCents(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatCurrency(value / 100);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function normalizedPercentValue(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatRelativeTime(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "never";
  const ms = Date.now() - new Date(isoOrNull).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatShortTimestamp(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "—";
  return new Date(isoOrNull).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortTimestampValue(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return formatShortTimestamp(date.toISOString());
}

function formatPriceAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeToExpiry(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "—";
  const diffMs = new Date(isoOrNull).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "—";
  if (diffMs <= 0) return "expired";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US");
}

function localDayKey(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-CA");
}

function summarizeFills(fills: KalshiFill[]): FillSummarySnapshot | null {
  if (fills.length === 0) return null;

  const settledFills = fills.filter(
    (fill): fill is KalshiFill & { outcome: "win" | "loss" } =>
      fill.outcome === "win" || fill.outcome === "loss"
  );
  const winsCount = settledFills.filter((fill) => fill.outcome === "win").length;
  const lossesCount = settledFills.filter((fill) => fill.outcome === "loss").length;
  const estimatedFeeCents = settledFills.reduce((sum, fill) => sum + (fill.fee_cents ?? 0), 0);
  const netPnlCents = settledFills.reduce(
    (sum, fill) => sum + (deriveFillNetPnlCents(fill, fill.outcome) ?? 0),
    0
  );
  const timestamps = fills
    .map((fill) => new Date(fill.created_time).getTime())
    .filter((value) => Number.isFinite(value));

  return {
    totalFills: fills.length,
    settledFills: settledFills.length,
    pendingFills: fills.length - settledFills.length,
    winsCount,
    lossesCount,
    grossPnlCents: netPnlCents + estimatedFeeCents,
    estimatedFeeCents,
    netPnlCents,
    matchedFills: fills.filter((fill) => !!fill.paper_trade_id).length,
    firstFillAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
    lastFillAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
  };
}

type Tone = "green" | "amber" | "red" | "blue" | "violet" | "gray";
type BlockerCategory = "clear" | "confidence" | "ev" | "data" | "risk" | "window" | "other";
type OpportunityState = "BLOCKED" | "SCANNING" | "COMMITTED" | "EXECUTING";
type TerminalConnectionState = "live" | "reconnecting" | "polling" | "stale";
type OpsWindow = "15m" | "1h" | "24h";
type LedgerWindow = FillsWindow;
type SortDirection = "asc" | "desc";
type WorkerSortKey =
  | "asset"
  | "status"
  | "market"
  | "tte"
  | "spot"
  | "strike"
  | "spread"
  | "quoteAge"
  | "lag"
  | "source"
  | "ev"
  | "model"
  | "marketProbability"
  | "confidence"
  | "blocker"
  | "lastCommit";
type StageMetric = { label: string; value: number; tone: Tone; sub: string };
type ExecutionStage =
  | "candidate"
  | "committed"
  | "blocked"
  | "submitted"
  | "accepted"
  | "rejected"
  | "matched"
  | "settled";
type FillLinkKind = "order" | "trade" | "inferred";
type Escalation = {
  title: string;
  detail: string;
  tone: Tone;
  kicker: string;
};

interface FillSummarySnapshot {
  totalFills: number;
  settledFills: number;
  pendingFills: number;
  winsCount: number;
  lossesCount: number;
  grossPnlCents: number;
  estimatedFeeCents: number;
  netPnlCents: number;
  matchedFills: number;
  firstFillAt: string | null;
  lastFillAt: string | null;
}

function maxFinite(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

type WorkerLike = TerminalWorkerSnapshot;

export interface DashboardConsoleBootstrap {
  health?: BackendHealth;
  status?: BackendStatus | null;
  analytics?: FillAnalytics;
  liveBalance?: AccountBalance;
  paperBalance?: PaperBalance;
  paperStats?: Stats;
  fills?: KalshiFill[];
  logs?: LogsResponse;
  trades?: Trade[];
}

interface ExecutionEvent {
  id: string;
  timestamp: number;
  iso: string | null;
  stage: ExecutionStage;
  asset: string | null;
  ticker: string | null;
  message: string;
  detail: string;
  tone: Tone;
  orderId?: string | null;
  evCents?: number | null;
  entryPrice?: number | null;
  source: "status" | "logs" | "trades";
}

function toneValue(tone: Tone): { color: string; background: string } {
  if (tone === "green") return { color: "#22C55E", background: "rgba(34,197,94,0.12)" };
  if (tone === "amber") return { color: "#F59E0B", background: "rgba(245,158,11,0.12)" };
  if (tone === "red") return { color: "#EF4444", background: "rgba(239,68,68,0.12)" };
  if (tone === "blue") return { color: "#38BDF8", background: "rgba(56,189,248,0.12)" };
  if (tone === "gray") return { color: "#94A3B8", background: "rgba(148,163,184,0.10)" };
  return { color: "#8B5CF6", background: "rgba(139,92,246,0.12)" };
}

function connectionBadge(connectionState: TerminalConnectionState, stale: boolean): {
  label: string;
  tone: Tone;
  sub: string;
} {
  if (stale) {
    return {
      label: "Terminal stale",
      tone: "red",
      sub: "No live terminal update in >3s",
    };
  }
  if (connectionState === "live") {
    return {
      label: "Live stream",
      tone: "green",
      sub: "WebSocket terminal active",
    };
  }
  if (connectionState === "polling") {
    return {
      label: "Polling fallback",
      tone: "amber",
      sub: "1s /status recovery mode",
    };
  }
  return {
    label: "Reconnecting",
    tone: "blue",
    sub: "Attempting to restore socket",
  };
}

function assetFromFill(fill: KalshiFill): string {
  if (fill.asset) return fill.asset;
  const match = fill.ticker.match(/^KX([A-Z]+)\d/);
  return match ? match[1] : fill.ticker.split("-")[0];
}

function formatRelativeMoment(value: string | number | null | undefined): string {
  if (value == null) return "never";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return formatRelativeTime(date.toISOString());
}

function formatMarketSource(source: string | null | undefined): string {
  if (!source) return "—";
  if (source === "kalshi_ws_ticker") return "ws";
  if (source === "kalshi_rest_detail") return "detail";
  if (source === "kalshi_rest_orderbook_fp") return "orderbook";
  return source.replace(/^kalshi_/, "").replace(/_/g, " ");
}

function classifyWorkerBlocker(worker: WorkerLike): BlockerCategory {
  if (worker.marketTicker == null || worker.currentPrice == null || worker.hasValidAsk === false) return "data";

  const reason = (worker.noTradeReason ?? "").toLowerCase();
  if (!reason) return "clear";
  if (reason.includes("confidence")) return "confidence";
  if (reason.includes("ev")) return "ev";
  if (
    reason.includes("crypto") ||
    reason.includes("spot") ||
    reason.includes("market data") ||
    reason.includes("missing ask") ||
    reason.includes("missing_ask") ||
    reason.includes("orderbook") ||
    reason.includes("top-of-book") ||
    reason.includes("top of book")
  ) return "data";
  if (
    reason.includes("cooldown") ||
    reason.includes("position") ||
    reason.includes("bankroll") ||
    reason.includes("kelly") ||
    reason.includes("correlation") ||
    reason.includes("exposure") ||
    reason.includes("suppressed")
  ) return "risk";
  if (
    reason.includes("window") ||
    reason.includes("cutoff") ||
    reason.includes("expired") ||
    reason.includes("minutes left")
  ) return "window";
  return "other";
}

function blockerPriority(blocker: BlockerCategory): number {
  if (blocker === "data") return 0;
  if (blocker === "risk") return 1;
  if (blocker === "window") return 2;
  if (blocker === "confidence") return 3;
  if (blocker === "ev") return 4;
  if (blocker === "other") return 5;
  return 6;
}

function statusPriority(worker: WorkerLike): number {
  const phase = (worker.enginePhase ?? "").toLowerCase();
  if (phase.includes("execut")) return 0;
  if (phase.includes("commit")) return 1;
  if (worker.hasValidAsk && classifyWorkerBlocker(worker) === "clear") return 2;
  if (worker.hasValidAsk) return 3;
  return 4;
}

function workerSpread(worker: WorkerLike): number | null {
  if (typeof worker.orderbookSpread === "number" && Number.isFinite(worker.orderbookSpread) && worker.orderbookSpread > 0) {
    return worker.orderbookSpread;
  }
  const candidates = [
    worker.marketYesAskCents != null && worker.marketYesBidCents != null ? worker.marketYesAskCents - worker.marketYesBidCents : null,
    worker.marketNoAskCents != null && worker.marketNoBidCents != null ? worker.marketNoAskCents - worker.marketNoBidCents : null,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  const av = typeof a === "number" && Number.isFinite(a) ? a : null;
  const bv = typeof b === "number" && Number.isFinite(b) ? b : null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  const av = a ?? "";
  const bv = b ?? "";
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv);
}

function sampleMeta(
  n: number | null | undefined,
  unit: string
): { label: string; detail: string; tone: Tone } | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n < 5) return { label: `n=${n}`, detail: `very low ${unit}`, tone: "red" };
  if (n < 20) return { label: `n=${n}`, detail: `provisional ${unit}`, tone: "amber" };
  return { label: `n=${n}`, detail: `${unit}`, tone: "green" };
}

function deriveOperatorState(
  health: BackendHealth | undefined,
  status: BackendStatus | null | undefined
): { label: "GO" | "CAUTION" | "NO-GO"; tone: Tone; reasons: string[] } {
  const connected = !!health && health.status === "ok";
  const heartbeatStale = !!health?.lastHeartbeatTimestamp &&
    Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
  const logStale = !!health?.lastLogTimestamp &&
    Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;
  const highLatency = (health?.latencyMs ?? 0) > 1_500;
  const workers = status?.workers ?? [];
  const staleWorkers = workers.filter((worker) => worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > ALERT_THRESHOLDS.criticalQuoteAgeMs);
  const missingWorkers = workers.filter((worker) => worker.marketTicker == null || worker.currentPrice == null);

  const label = !connected || heartbeatStale || staleWorkers.length > 0
    ? "NO-GO"
    : logStale || highLatency || missingWorkers.length > 0
      ? "CAUTION"
      : "GO";
  const tone: Tone = label === "GO" ? "green" : label === "CAUTION" ? "amber" : "red";

  return {
    label,
    tone,
    reasons: [
      !connected ? "Backend disconnected" : null,
      heartbeatStale ? "Heartbeat stale >10m" : null,
      logStale ? "Logs stale >2m" : null,
      highLatency ? `API latency ${health?.latencyMs}ms` : null,
      staleWorkers.length > 0 ? `${staleWorkers.length} worker${staleWorkers.length > 1 ? "s" : ""} on stale spot pricing` : null,
      missingWorkers.length > 0 ? `${missingWorkers.length} worker${missingWorkers.length > 1 ? "s" : ""} missing market or spot data` : null,
    ].filter(Boolean) as string[],
  };
}

function deriveOpportunityState(
  operator: ReturnType<typeof deriveOperatorState>,
  workers: WorkerLike[],
  blockerSummary: { counts: Record<BlockerCategory, number>; orderableCount: number; recentlyCommittedCount: number },
  positionTracker: BackendStatus["positionTracker"] | undefined
): { label: OpportunityState; tone: Tone; sub: string } {
  const activePositions = positionTracker?.active ?? 0;
  const totalWorkers = workers.length;

  if (activePositions > 0) {
    return {
      label: "EXECUTING",
      tone: "green",
      sub: `${activePositions}/${positionTracker?.max ?? activePositions} active positions`,
    };
  }

  if (blockerSummary.recentlyCommittedCount > 0) {
    return {
      label: "COMMITTED",
      tone: "blue",
      sub: `${blockerSummary.recentlyCommittedCount} worker${blockerSummary.recentlyCommittedCount === 1 ? "" : "s"} with recent committed candidates`,
    };
  }

  if (blockerSummary.orderableCount > 0) {
    return {
      label: "SCANNING",
      tone: operator.label === "GO" ? "green" : "blue",
      sub: `${blockerSummary.orderableCount}/${totalWorkers || 0} workers orderable`,
    };
  }

  return {
    label: "BLOCKED",
    tone: operator.label === "NO-GO" || blockerSummary.counts.data > 0 ? "red" : "amber",
    sub: blockerSummary.counts.data > 0
      ? `${blockerSummary.counts.data} data-blocked worker${blockerSummary.counts.data === 1 ? "" : "s"}`
      : "No orderable workers right now",
  };
}

function extractTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const match = value.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/);
  if (!match) return null;
  const parsed = new Date(match[1]).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function windowMs(window: OpsWindow): number {
  if (window === "15m") return 15 * 60_000;
  if (window === "1h") return 60 * 60_000;
  return 24 * 60 * 60_000;
}

function inOpsWindow(value: string | null | undefined, window: OpsWindow): boolean {
  const ts = extractTimestamp(value);
  if (ts == null) return false;
  return Date.now() - ts <= windowMs(window);
}

function inLedgerWindow(value: string, window: LedgerWindow): boolean {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return false;
  if (window === "all") return true;
  if (window === "today") return Date.now() - ts <= 24 * 60 * 60_000;
  if (window === "7d") return Date.now() - ts <= 7 * 24 * 60 * 60_000;
  return Date.now() - ts <= 30 * 24 * 60 * 60_000;
}

function buildBlockerSummary(
  workers: WorkerLike[],
  commitWindowMs: number
): { counts: Record<BlockerCategory, number>; orderableCount: number; recentlyCommittedCount: number } {
  const counts: Record<BlockerCategory, number> = {
    clear: 0,
    confidence: 0,
    ev: 0,
    data: 0,
    risk: 0,
    window: 0,
    other: 0,
  };

  const now = Date.now();
  for (const worker of workers) {
    counts[classifyWorkerBlocker(worker)] += 1;
  }

  return {
    counts,
    orderableCount: workers.filter((worker) => worker.hasValidAsk).length,
    recentlyCommittedCount: workers.filter((worker) => {
      if (worker.lastCommittedCandidateAt == null) return false;
      const committedAt = typeof worker.lastCommittedCandidateAt === "number"
        ? worker.lastCommittedCandidateAt
        : new Date(worker.lastCommittedCandidateAt).getTime();
      return Number.isFinite(committedAt) && now - committedAt <= commitWindowMs;
    }).length,
  };
}

function findLastWarningEvent(lines: string[]): { at: string | null; message: string | null } {
  const line = [...lines].reverse().find((entry) => /rejected|invalid_order|warn|error/i.test(entry));
  if (!line) return { at: null, message: null };
  const ts = extractTimestamp(line);
  return {
    at: ts != null ? new Date(ts).toISOString() : null,
    message: line,
  };
}

function buildTerminalFallbackSnapshot(
  health: BackendHealth | undefined,
  status: BackendStatus | null | undefined,
  analytics?: FillAnalytics
): TerminalSnapshot | null {
  if (!status) return null;
  const workers = status.workers ?? [];
  const blockerSummary = buildBlockerSummary(workers, 15 * 60_000);
  const operator = deriveOperatorState(health, status);
  const opportunity = deriveOpportunityState(operator, workers, blockerSummary, status.positionTracker);
  const warning = findLastWarningEvent(status.recentEvents ?? []);

  return {
    timestamp: status.timestamp ?? health?.timestamp ?? new Date().toISOString(),
    operatorSummary: {
      systemTrust: operator.label,
      opportunityState: opportunity.label,
      orderableWorkers: blockerSummary.orderableCount,
      worstQuoteAgeMs: maxFinite(workers.map((worker) => worker.cryptoPriceAgeMs)),
      pricingPathHealthy: status.pricing?.pricingPathHealthy ?? true,
      activePositions: status.positionTracker?.active ?? 0,
      lastFillAt: analytics?.summary.lastFillAt ?? null,
      lastWarningAt: warning.at,
      lastWarningMessage: warning.message,
    },
    blockerSummary: {
      data: blockerSummary.counts.data,
      confidence: blockerSummary.counts.confidence,
      ev: blockerSummary.counts.ev,
      risk: blockerSummary.counts.risk,
      window: blockerSummary.counts.window,
      other: blockerSummary.counts.other,
      recentlyCommitted: blockerSummary.recentlyCommittedCount,
      clear: blockerSummary.counts.clear,
    },
    workers,
  };
}

function countMatches(lines: string[], matcher: RegExp): number {
  return lines.filter((line) => matcher.test(line)).length;
}

function parseContextPairs(context: string | undefined): Record<string, string> {
  if (!context) return {};
  return context
    .trim()
    .split(/\s+/)
    .reduce<Record<string, string>>((acc, token) => {
      const eq = token.indexOf("=");
      if (eq <= 0) return acc;
      const key = token.slice(0, eq);
      const value = token.slice(eq + 1);
      acc[key] = value;
      return acc;
    }, {});
}

function assetFromTicker(ticker: string | null | undefined): string | null {
  if (!ticker) return null;
  const match = ticker.match(/^KX([A-Z]+)\d/);
  return match?.[1] ?? null;
}

function parseExecutionLine(line: string, source: "status" | "logs"): ExecutionEvent | null {
  const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(?:\[([^\]]+)\]\s+)?(?:\[([^\]]+)\]\s+)?(.*?)(?:\s+\|\s+(.*))?$/);
  if (!match) return null;

  const [, ts, , scope, , rawMessage, rawContext] = match;
  const message = rawMessage?.trim() ?? "";
  const lower = message.toLowerCase();
  let stage: ExecutionStage | null = null;
  if (lower.includes("trade candidate committed")) stage = "committed";
  else if (lower.includes("trade blocked") || lower.includes("trade skipped")) stage = "blocked";
  else if (lower.includes("submitting live order") || lower.includes("order request submitted")) stage = "submitted";
  else if (lower.includes("live order accepted") || lower.includes("order accepted")) stage = "accepted";
  else if (lower.includes("rejected") || lower.includes("invalid_order")) stage = "rejected";
  else if (lower.includes("matched") && lower.includes("fill")) stage = "matched";
  else if (lower.includes("candidate") && lower.includes("direction")) stage = "candidate";

  if (!stage) return null;

  const context = parseContextPairs(rawContext);
  const timestamp = new Date(ts).getTime();
  const ticker = context.ticker ?? null;
  const inferredAsset =
    (scope?.replace(/USDT$/, "") ?? null) ||
    assetFromTicker(ticker);
  const evRaw = context.evCents ?? null;
  const entryRaw = context.entryPrice ?? null;
  const tone: Tone =
    stage === "accepted" || stage === "matched" ? "green" :
    stage === "submitted" || stage === "candidate" || stage === "committed" ? "blue" :
    stage === "blocked" ? "amber" :
    "red";

  return {
    id: `${source}-${stage}-${timestamp}-${ticker ?? inferredAsset ?? "unknown"}-${message}`,
    timestamp,
    iso: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    stage,
    asset: inferredAsset,
    ticker,
    message,
    detail: Object.keys(context).length > 0 ? Object.entries(context).map(([key, value]) => `${key}=${value}`).join(" · ") : message,
    tone,
    orderId: context.orderId ?? null,
    evCents: evRaw != null ? Number(evRaw) : null,
    entryPrice: entryRaw != null ? Number(entryRaw) : null,
    source,
  };
}

function parseTradeExecutionEvent(trade: Trade): ExecutionEvent {
  const settled = trade.outcome === "win" || trade.outcome === "loss";
  return {
    id: `trade-${trade.id}`,
    timestamp: trade.entryTimestamp,
    iso: new Date(trade.entryTimestamp).toISOString(),
    stage: settled ? "settled" : "accepted",
    asset: trade.asset,
    ticker: trade.ticker ?? null,
    message: settled ? `settled ${trade.outcome}` : "accepted live order",
    detail: [
      `entry=${trade.entryPrice}c`,
      `size=${trade.liveCount ?? trade.suggestedSize}`,
      `ev=${trade.ev.toFixed(1)}c`,
      `confidence=${formatPercent(trade.confidence)}`,
    ].join(" · "),
    tone: settled ? (trade.pnlTotal != null && trade.pnlTotal >= 0 ? "green" : "red") : "green",
    orderId: trade.orderId ?? null,
    evCents: trade.ev,
    entryPrice: trade.entryPrice,
    source: "trades",
  };
}

function dedupeExecutionEvents(events: ExecutionEvent[]): ExecutionEvent[] {
  const seen = new Set<string>();
  const deduped: ExecutionEvent[] = [];
  for (const event of events) {
    const signature = `${event.stage}|${event.asset}|${event.ticker}|${event.message}|${event.orderId ?? ""}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(event);
  }
  return deduped;
}

function tradePnlTotal(trade: Trade): number | null {
  if (trade.pnlTotal != null) return trade.pnlTotal;
  if (trade.pnlCents != null && trade.liveCount != null) return trade.pnlCents * trade.liveCount;
  return trade.pnlCents ?? null;
}

function alertKey(alert: Escalation): string {
  return `${alert.kicker}|${alert.title}`;
}

function executionStageTone(stage: ExecutionStage): Tone {
  if (stage === "accepted" || stage === "matched" || stage === "settled") return "green";
  if (stage === "blocked") return "amber";
  if (stage === "rejected") return "red";
  return "blue";
}

function executionStageLabel(stage: ExecutionStage): string {
  if (stage === "candidate") return "candidate";
  if (stage === "committed") return "committed";
  if (stage === "blocked") return "blocked";
  if (stage === "submitted") return "submitted";
  if (stage === "accepted") return "accepted";
  if (stage === "rejected") return "rejected";
  if (stage === "matched") return "matched";
  return "settled";
}

function linkedFillsForTrade(trade: Trade, fills: KalshiFill[]): KalshiFill[] {
  const entryWindowMs = 20 * 60_000;
  const rows = fills.filter((fill) => {
    if (trade.orderId && fill.order_id === trade.orderId) return true;
    if (fill.paper_trade_id === trade.id) return true;
    if (!trade.ticker || fill.ticker !== trade.ticker) return false;
    return Math.abs(new Date(fill.created_time).getTime() - trade.entryTimestamp) <= entryWindowMs;
  });

  return rows.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());
}

function classifyFillLinkForTrade(trade: Trade, fill: KalshiFill): FillLinkKind | null {
  const entryWindowMs = 20 * 60_000;
  if (trade.orderId && fill.order_id === trade.orderId) return "order";
  if (fill.paper_trade_id === trade.id) return "trade";
  if (!trade.ticker || fill.ticker !== trade.ticker) return null;
  return Math.abs(new Date(fill.created_time).getTime() - trade.entryTimestamp) <= entryWindowMs ? "inferred" : null;
}

function linkedEventsForTrade(trade: Trade, events: ExecutionEvent[]): ExecutionEvent[] {
  const entryWindowMs = 20 * 60_000;
  return events
    .filter((event) => {
      if (trade.orderId && event.orderId === trade.orderId) return true;
      if (trade.ticker && event.ticker === trade.ticker) {
        return Math.abs(event.timestamp - trade.entryTimestamp) <= entryWindowMs;
      }
      return false;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function groupExecutionEvents(events: ExecutionEvent[]) {
  const groups = new Map<string, { key: string; asset: string | null; ticker: string | null; events: ExecutionEvent[] }>();

  for (const event of events) {
    const key = event.ticker ?? `asset:${event.asset ?? "unknown"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
      if (!existing.asset && event.asset) existing.asset = event.asset;
      if (!existing.ticker && event.ticker) existing.ticker = event.ticker;
    } else {
      groups.set(key, {
        key,
        asset: event.asset,
        ticker: event.ticker,
        events: [event],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      events: [...group.events].sort((a, b) => b.timestamp - a.timestamp),
    }))
    .sort((a, b) => (b.events[0]?.timestamp ?? 0) - (a.events[0]?.timestamp ?? 0));
}

function isOneSidedBook(worker: WorkerLike): boolean {
  const asks = [worker.marketYesAskCents, worker.marketNoAskCents];
  const bids = [worker.marketYesBidCents, worker.marketNoBidCents];
  return asks.some((value) => value != null && value >= 99) || bids.some((value) => value != null && value <= 1);
}

function SectionHeading({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-4">
      <span className="section-label">{kicker}</span>
      <div className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted max-w-3xl">{subtitle}</p>
        </div>
        {actions ? <div className="mt-3 lg:mt-0">{actions}</div> : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone = "blue",
  icon,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
  badge?: { label: string; tone: Tone } | null;
}) {
  const palette = toneValue(tone);
  return (
    <div
      className="panel flex flex-col gap-1 min-w-0"
      style={{ background: "linear-gradient(180deg, rgba(15,17,23,0.95), rgba(15,17,23,0.78))" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? <span style={{ color: palette.color }}>{icon}</span> : null}
          <span className="section-label" style={{ marginBottom: 0 }}>{label}</span>
        </div>
        {badge ? <HeroSignal label={badge.label} tone={badge.tone} /> : null}
      </div>
      <span className="text-2xl font-semibold font-mono tracking-tight" style={{ color: palette.color }}>
        {value}
      </span>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </div>
  );
}

function HeroSignal({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  const palette = toneValue(tone);
  return (
    <span
      className="badge"
      style={{
        backgroundColor: palette.background,
        color: palette.color,
        border: `1px solid ${palette.color}33`,
      }}
    >
      {label}
    </span>
  );
}

function FilterChipBar<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="badge transition-colors"
            style={{
              backgroundColor: active ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
              color: active ? "#38BDF8" : "#94A3B8",
              border: `1px solid ${active ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DailyPnlChart({ analytics }: { analytics: FillAnalytics | undefined }) {
  const data = useMemo(
    () => (analytics?.dailyPnl ?? []).slice(-14).map((row) => ({
      ...row,
      pnlDollars: row.grossPnlCents / 100,
      label: new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    })),
    [analytics]
  );

  if (data.length === 0) {
    return (
      <div className="panel flex items-center justify-center text-muted text-sm" style={{ minHeight: 240 }}>
        Daily PnL will populate once fills settle into the ledger
      </div>
    );
  }

  return (
    <div className="panel" style={{ minHeight: 240 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Daily PnL</p>
          <p className="text-sm text-muted">Gross realized performance from Postgres-backed fill analytics</p>
        </div>
        <HeroSignal
          label={`${data.length} day${data.length === 1 ? "" : "s"}`}
          tone="violet"
        />
      </div>

      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#6B7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6B7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => `$${value.toFixed(0)}`}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            contentStyle={{
              background: "#0F1117",
              border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 10,
              color: "#E2E8F0",
            }}
            formatter={(value) => [formatCurrency(Number(value ?? 0)), "Gross PnL"]}
          />
          <Bar dataKey="pnlDollars" radius={[6, 6, 0, 0]}>
            {data.map((row) => (
              <Cell key={row.date} fill={row.pnlDollars >= 0 ? "#22C55E" : "#EF4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, BreakdownRow>;
}) {
  const entries = Object.entries(rows).sort((a, b) => (b[1].grossPnlCents ?? 0) - (a[1].grossPnlCents ?? 0));

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>{title}</p>
          <p className="text-sm text-muted">Backend-provided breakdown</p>
        </div>
        <HeroSignal label={`${entries.length} rows`} tone="blue" />
      </div>

      {entries.length === 0 ? (
        <div className="text-sm text-muted">No settled fills in this dimension yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                <th className="py-2 font-medium">Segment</th>
                <th className="py-2 font-medium">Settled / Total</th>
                <th className="py-2 font-medium">Win Rate</th>
                <th className="py-2 font-medium">Gross PnL</th>
                <th className="py-2 font-medium">Avg EV</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, row]) => (
                <tr key={key} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                  <td className="py-2 font-medium text-text">{key}</td>
                  <td className="py-2 font-mono text-muted">
                    {formatCount(row.settled)} / {formatCount(row.fills)}
                  </td>
                  <td className="py-2 font-mono text-muted">{formatPercent(row.winRate)}</td>
                  <td className="py-2 font-mono" style={{ color: row.grossPnlCents >= 0 ? "#22C55E" : "#EF4444" }}>
                    {formatCents(row.grossPnlCents)}
                  </td>
                  <td className="py-2 font-mono text-muted">
                    {row.avgEvCents != null ? `${row.avgEvCents >= 0 ? "+" : ""}${row.avgEvCents.toFixed(1)}c` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatProbabilityCell(value: number | null | undefined): string {
  return formatPercent(value);
}

function workerPricingLagMs(worker: TerminalWorkerSnapshot): number | null {
  const candidates = [
    worker.pricingLatency?.lastEvaluationLagMs,
    worker.pricingLatency?.cryptoApplyLagMs,
    worker.pricingLatency?.marketApplyLagMs,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function terminalPillTone(
  value: number | null | undefined,
  warningThreshold: number,
  criticalThreshold: number
): Tone {
  if (value == null) return 'blue';
  if (value > criticalThreshold) return 'red';
  if (value > warningThreshold) return 'amber';
  return 'green';
}

function probabilityTone(value: number | null | undefined, mode: 'model' | 'market' | 'confidence'): Tone {
  const pct = normalizedPercentValue(value);
  if (pct == null) return 'blue';
  if (mode === 'confidence') {
    if (pct >= 85) return 'green';
    if (pct >= 65) return 'amber';
    return 'red';
  }
  if (mode === 'market') {
    return pct >= 70 ? 'blue' : pct <= 30 ? 'violet' : 'amber';
  }
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'blue';
  if (pct >= 50) return 'amber';
  return 'red';
}

function MiniMeter({
  value,
  tone,
  compact = false,
}: {
  value: number | null | undefined;
  tone: Tone;
  compact?: boolean;
}) {
  const pct = normalizedPercentValue(value);
  const palette = toneValue(tone);
  if (pct == null) {
    return <span className="font-mono text-muted">—</span>;
  }

  const width = Math.max(8, Math.min(100, pct));
  return (
    <div className={compact ? "min-w-[4.5rem]" : "min-w-[5.5rem]"}>
      <div className={`font-mono ${compact ? "text-xs" : ""} text-text`}>{pct.toFixed(1)}%</div>
      <div
        className={`mt-1 rounded-full overflow-hidden ${compact ? "h-1" : "h-1.5"}`}
        style={{ backgroundColor: 'rgba(51,65,85,0.75)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${palette.color}, ${palette.color}CC)`,
          }}
        />
      </div>
    </div>
  );
}

function QuoteCell({
  bid,
  ask,
}: {
  bid: number | null | undefined;
  ask: number | null | undefined;
}) {
  const spread = bid != null && ask != null ? Math.max(0, ask - bid) : null;
  return (
    <div className="min-w-[4.75rem]">
      <div className="font-mono text-text">{`${bid ?? '—'}/${ask ?? '—'}`}</div>
      <div className="text-[11px] text-muted">{spread != null ? `spr ${spread}c` : 'spread —'}</div>
    </div>
  );
}

function StatusPill({
  value,
  tone,
  sub,
}: {
  value: string;
  tone: Tone;
  sub?: string;
}) {
  const palette = toneValue(tone);
  return (
    <div
      className="inline-flex flex-col rounded-xl px-2.5 py-1.5 min-w-[4.75rem]"
      style={{
        backgroundColor: palette.background,
        border: `1px solid ${palette.color}22`,
      }}
    >
      <span className="font-mono text-[13px] leading-tight" style={{ color: palette.color }}>
        {value}
      </span>
      {sub ? <span className="text-[10px] leading-tight text-muted mt-1">{sub}</span> : null}
    </div>
  );
}

function blockerLabel(blocker: BlockerCategory): string {
  if (blocker === 'clear') return 'clear';
  if (blocker === 'confidence') return 'confidence';
  if (blocker === 'ev') return 'edge / EV';
  if (blocker === 'data') return 'data';
  if (blocker === 'risk') return 'risk';
  if (blocker === 'window') return 'window';
  return 'other';
}

function WorkerCompactCard({
  worker,
  changedUntil,
  now,
}: {
  worker: TerminalWorkerSnapshot;
  changedUntil: number;
  now: number;
}) {
  const blocker = classifyWorkerBlocker(worker);
  const tone: Tone = blocker === 'clear' ? 'green' : blocker === 'data' ? 'red' : 'amber';
  const palette = toneValue(tone);
  const oneSided = isOneSidedBook(worker);
  const sourceTone: Tone =
    !worker.marketDataSource ? 'blue' : worker.marketDataSource === 'kalshi_ws_ticker' ? 'green' : 'amber';
  const spotAgeTone = terminalPillTone(
    worker.cryptoPriceAgeMs,
    ALERT_THRESHOLDS.warningQuoteAgeMs,
    ALERT_THRESHOLDS.criticalQuoteAgeMs
  );
  const lagMs = workerPricingLagMs(worker);
  const lagTone = terminalPillTone(
    lagMs,
    ALERT_THRESHOLDS.warningPricingLagMs,
    ALERT_THRESHOLDS.criticalPricingLagMs
  );
  const recentlyChanged = changedUntil > now;

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{
        background: recentlyChanged
          ? 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(15,17,23,0.96) 18%, rgba(15,17,23,0.92))'
          : 'linear-gradient(180deg, rgba(15,17,23,0.96), rgba(15,17,23,0.88))',
        border: '1px solid rgba(51,65,85,0.75)',
        boxShadow: `inset 3px 0 0 ${palette.color}22`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text text-lg">{worker.assetKey.toUpperCase()}</span>
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${recentlyChanged ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: recentlyChanged ? '#38BDF8' : 'rgba(148,163,184,0.45)' }}
            />
            <span className="badge badge-gray">{(worker.enginePhase ?? 'idle').replace(/_/g, ' ')}</span>
          </div>
          <p className="mt-2 font-mono text-sm text-text break-all">{worker.marketTicker ?? '—'}</p>
          <p className="text-xs text-muted mt-1">
            {formatTimeToExpiry(worker.marketCloseTime)} ·{' '}
            {worker.lastOrderableAt ? `orderable ${formatRelativeMoment(worker.lastOrderableAt)}` : 'never orderable'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={
              worker.hasValidAsk
                ? oneSided
                  ? 'badge badge-amber'
                  : 'badge badge-green'
                : 'badge badge-red'
            }
          >
            {worker.hasValidAsk ? (oneSided ? 'fragile book' : 'orderable') : 'blocked'}
          </span>
          <span className="badge" style={{ backgroundColor: palette.background, color: palette.color }}>
            {blockerLabel(blocker)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Spot</p>
          <p className="mt-1 font-mono text-text">
            {worker.currentPrice != null ? `$${worker.currentPrice.toLocaleString()}` : '—'}
          </p>
          <p className="text-[11px] text-muted">
            {worker.marketFloorStrike != null ? `strike $${worker.marketFloorStrike.toLocaleString()}` : 'strike —'}
          </p>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Source</p>
          <div className="mt-1">
            <span
              className="badge"
              style={{
                backgroundColor:
                  sourceTone === 'green'
                    ? 'rgba(34,197,94,0.12)'
                    : sourceTone === 'amber'
                      ? 'rgba(245,158,11,0.12)'
                      : 'rgba(148,163,184,0.12)',
                color:
                  sourceTone === 'green'
                    ? '#22C55E'
                    : sourceTone === 'amber'
                      ? '#F59E0B'
                      : '#94A3B8',
              }}
            >
              {formatMarketSource(worker.marketDataSource)}
            </span>
          </div>
          <p className="text-[11px] text-muted mt-2">
            {worker.lastCommittedCandidateAt
              ? `last commit ${formatRelativeMoment(worker.lastCommittedCandidateAt)}`
              : 'no recent commit'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mb-1">YES book</p>
          <QuoteCell bid={worker.marketYesBidCents} ask={worker.marketYesAskCents} />
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mb-1">NO book</p>
          <QuoteCell bid={worker.marketNoBidCents} ask={worker.marketNoAskCents} />
          {oneSided ? <span className="badge badge-amber mt-2">fragile</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Spot age</p>
          <StatusPill
            value={formatPriceAge(worker.cryptoPriceAgeMs)}
            tone={spotAgeTone}
            sub={worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs < 1000 ? 'fresh' : 'quote'}
          />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Lag</p>
          <StatusPill
            value={formatLatency(lagMs)}
            tone={lagTone}
            sub={lagMs != null && lagMs <= ALERT_THRESHOLDS.warningPricingLagMs ? 'hot path' : 'pipeline'}
          />
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">EV</p>
          <p
            className="mt-1 font-mono"
            style={{ color: worker.currentEV != null && worker.currentEV >= 0 ? '#22C55E' : worker.currentEV != null ? '#F59E0B' : '#94A3B8' }}
          >
            {worker.currentEV != null ? `${worker.currentEV >= 0 ? '+' : ''}${worker.currentEV.toFixed(1)}c` : '—'}
          </p>
          <p className="text-[11px] text-muted">
            {worker.candidateDirection ? `${worker.candidateDirection.toUpperCase()} bias` : 'no bias'}
          </p>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Blocker</p>
          <p className="mt-1 text-sm" style={{ color: palette.color }}>
            {blockerLabel(blocker)}
          </p>
          <p className="text-[11px] text-muted leading-snug mt-1">
            {worker.noTradeReason ?? 'Entry path clear'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mb-2">Model P</p>
          <MiniMeter value={worker.modelProbability} tone={probabilityTone(worker.modelProbability, 'model')} />
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mb-2">Market P</p>
          <MiniMeter value={worker.marketProbability} tone={probabilityTone(worker.marketProbability, 'market')} />
        </div>
        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.38)' }}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mb-2">Confidence</p>
          <MiniMeter value={worker.confidence} tone={probabilityTone(worker.confidence, 'confidence')} />
        </div>
      </div>
    </div>
  );
}

function WorkerMatrix({
  workers,
  connectionState,
  changedWorkerUntil,
  now,
}: {
  workers: TerminalWorkerSnapshot[];
  connectionState: TerminalConnectionState;
  changedWorkerUntil: Record<string, number>;
  now: number;
}) {
  const [sortKey, setSortKey] = useState<WorkerSortKey>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showBookColumns, setShowBookColumns] = useState(true);
  const [showFreshnessColumns, setShowFreshnessColumns] = useState(true);
  const [showProbabilityColumns, setShowProbabilityColumns] = useState(true);
  const [showBlockerColumns, setShowBlockerColumns] = useState(true);

  const staleQuotes = workers.filter(
    (worker) => (worker.cryptoPriceAgeMs ?? 0) > ALERT_THRESHOLDS.criticalQuoteAgeMs
  ).length;
  const elevatedLag = workers.filter(
    (worker) => (workerPricingLagMs(worker) ?? 0) > ALERT_THRESHOLDS.warningPricingLagMs
  ).length;
  const fragileBooks = workers.filter((worker) => isOneSidedBook(worker)).length;

  const sortedWorkers = useMemo(() => {
    const rows = [...workers];
    rows.sort((left, right) => {
      let result = 0;
      switch (sortKey) {
        case "asset":
          result = compareNullableString(left.assetKey, right.assetKey);
          break;
        case "status":
          result = statusPriority(left) - statusPriority(right);
          if (result === 0) result = blockerPriority(classifyWorkerBlocker(left)) - blockerPriority(classifyWorkerBlocker(right));
          break;
        case "market":
          result = compareNullableString(left.marketTicker, right.marketTicker);
          break;
        case "tte":
          result = compareNullableNumber(
            left.marketCloseTime ? new Date(left.marketCloseTime).getTime() - now : null,
            right.marketCloseTime ? new Date(right.marketCloseTime).getTime() - now : null
          );
          break;
        case "spot":
          result = compareNullableNumber(left.currentPrice, right.currentPrice);
          break;
        case "strike":
          result = compareNullableNumber(left.marketFloorStrike, right.marketFloorStrike);
          break;
        case "spread":
          result = compareNullableNumber(workerSpread(left), workerSpread(right));
          break;
        case "quoteAge":
          result = compareNullableNumber(left.cryptoPriceAgeMs, right.cryptoPriceAgeMs);
          break;
        case "lag":
          result = compareNullableNumber(workerPricingLagMs(left), workerPricingLagMs(right));
          break;
        case "source":
          result = compareNullableString(formatMarketSource(left.marketDataSource), formatMarketSource(right.marketDataSource));
          break;
        case "ev":
          result = compareNullableNumber(left.currentEV, right.currentEV);
          break;
        case "model":
          result = compareNullableNumber(normalizedPercentValue(left.modelProbability), normalizedPercentValue(right.modelProbability));
          break;
        case "marketProbability":
          result = compareNullableNumber(normalizedPercentValue(left.marketProbability), normalizedPercentValue(right.marketProbability));
          break;
        case "confidence":
          result = compareNullableNumber(normalizedPercentValue(left.confidence), normalizedPercentValue(right.confidence));
          break;
        case "blocker":
          result = blockerPriority(classifyWorkerBlocker(left)) - blockerPriority(classifyWorkerBlocker(right));
          break;
        case "lastCommit":
          result = compareNullableNumber(extractTimestamp(String(left.lastCommittedCandidateAt ?? "")), extractTimestamp(String(right.lastCommittedCandidateAt ?? "")));
          break;
      }
      if (result === 0) result = compareNullableString(left.assetKey, right.assetKey);
      return sortDirection === "asc" ? result : -result;
    });
    return rows;
  }, [workers, sortKey, sortDirection, now]);

  function toggleSort(nextKey: WorkerSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(["asset", "market", "source", "blocker"].includes(nextKey) ? "asc" : "desc");
  }

  function SortHeader({
    label,
    column,
    align = "left",
    left,
    widthClass,
  }: {
    label: string;
    column: WorkerSortKey;
    align?: "left" | "right" | "center";
    left?: number;
    widthClass?: string;
  }) {
    const active = sortKey === column;
    return (
      <th
        className={`sticky top-0 z-10 py-2 font-medium bg-[#0F1117] ${widthClass ?? ""} ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
        style={left != null ? { left } : undefined}
      >
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={`inline-flex items-center gap-1 transition-colors ${align === "right" ? "justify-end w-full" : align === "center" ? "justify-center w-full" : ""}`}
          style={{ color: active ? "#E2E8F0" : "#94A3B8" }}
        >
          <span>{label}</span>
          <span className="text-[10px]">{active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="panel text-sm text-muted">
        Worker snapshots have not loaded yet. Once `/status` responds, this section will show per-asset orderability,
        book quality, spot freshness, true pricing lag, probabilities, EV, and the exact blocker on each asset.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Worker Matrix</p>
          <p className="text-sm text-muted">Sortable terminal grid for live spot, book quality, freshness, pricing lag, probabilities, EV, and blockers per asset.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <HeroSignal label={`${workers.length} workers`} tone="blue" />
          <HeroSignal label={`${elevatedLag} elevated lag`} tone={elevatedLag > 0 ? 'amber' : 'green'} />
          <HeroSignal label={`${staleQuotes} stale quotes`} tone={staleQuotes > 0 ? 'amber' : 'green'} />
          <HeroSignal label={`${fragileBooks} fragile books`} tone={fragileBooks > 0 ? 'amber' : 'blue'} />
          <HeroSignal label={connectionBadge(connectionState, false).label} tone={connectionBadge(connectionState, false).tone} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowBookColumns((value) => !value)}
          className="badge transition-colors"
          style={{
            backgroundColor: showBookColumns ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
            color: showBookColumns ? "#38BDF8" : "#94A3B8",
            border: `1px solid ${showBookColumns ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
            cursor: "pointer",
          }}
        >
          {showBookColumns ? "Hide book" : "Show book"}
        </button>
        <button
          type="button"
          onClick={() => setShowFreshnessColumns((value) => !value)}
          className="badge transition-colors"
          style={{
            backgroundColor: showFreshnessColumns ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
            color: showFreshnessColumns ? "#38BDF8" : "#94A3B8",
            border: `1px solid ${showFreshnessColumns ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
            cursor: "pointer",
          }}
        >
          {showFreshnessColumns ? "Hide freshness" : "Show freshness"}
        </button>
        <button
          type="button"
          onClick={() => setShowProbabilityColumns((value) => !value)}
          className="badge transition-colors"
          style={{
            backgroundColor: showProbabilityColumns ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
            color: showProbabilityColumns ? "#38BDF8" : "#94A3B8",
            border: `1px solid ${showProbabilityColumns ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
            cursor: "pointer",
          }}
        >
          {showProbabilityColumns ? "Hide probabilities" : "Show probabilities"}
        </button>
        <button
          type="button"
          onClick={() => setShowBlockerColumns((value) => !value)}
          className="badge transition-colors"
          style={{
            backgroundColor: showBlockerColumns ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
            color: showBlockerColumns ? "#38BDF8" : "#94A3B8",
            border: `1px solid ${showBlockerColumns ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
            cursor: "pointer",
          }}
        >
          {showBlockerColumns ? "Hide blocker detail" : "Show blocker detail"}
        </button>
      </div>

      <div className="grid gap-3 lg:hidden">
        {sortedWorkers.map((worker) => (
          <WorkerCompactCard
            key={worker.assetKey}
            worker={worker}
            changedUntil={changedWorkerUntil[worker.assetKey] ?? 0}
            now={now}
          />
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm min-w-[2050px]">
          <thead>
            <tr className="text-left text-muted border-b" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              <SortHeader label="Asset" column="asset" left={0} widthClass="min-w-[9rem]" />
              <SortHeader label="Status" column="status" left={144} widthClass="min-w-[11rem]" />
              <SortHeader label="Market" column="market" widthClass="min-w-[18rem]" />
              <SortHeader label="TTE" column="tte" widthClass="min-w-[6rem]" />
              <SortHeader label="Spot" column="spot" align="right" widthClass="min-w-[8rem]" />
              <SortHeader label="Strike" column="strike" align="right" widthClass="min-w-[8rem]" />
              {showBookColumns ? <SortHeader label="YES Bid" column="spread" align="right" widthClass="min-w-[6rem]" /> : null}
              {showBookColumns ? <SortHeader label="YES Ask" column="spread" align="right" widthClass="min-w-[6rem]" /> : null}
              {showBookColumns ? <SortHeader label="NO Bid" column="spread" align="right" widthClass="min-w-[6rem]" /> : null}
              {showBookColumns ? <SortHeader label="NO Ask" column="spread" align="right" widthClass="min-w-[6rem]" /> : null}
              {showBookColumns ? <SortHeader label="Spread" column="spread" align="right" widthClass="min-w-[6rem]" /> : null}
              {showFreshnessColumns ? <SortHeader label="Spot Age" column="quoteAge" widthClass="min-w-[7rem]" /> : null}
              {showFreshnessColumns ? <SortHeader label="Lag" column="lag" widthClass="min-w-[7rem]" /> : null}
              <SortHeader label="Source" column="source" widthClass="min-w-[7rem]" />
              <SortHeader label="EV" column="ev" align="right" widthClass="min-w-[7rem]" />
              {showProbabilityColumns ? <SortHeader label="Model P" column="model" widthClass="min-w-[7rem]" /> : null}
              {showProbabilityColumns ? <SortHeader label="Market P" column="marketProbability" widthClass="min-w-[7rem]" /> : null}
              {showProbabilityColumns ? <SortHeader label="Confidence" column="confidence" widthClass="min-w-[7rem]" /> : null}
              {showBlockerColumns ? <SortHeader label="Blocker" column="blocker" widthClass="min-w-[9rem]" /> : null}
              {showBlockerColumns ? <th className="sticky top-0 z-10 py-2 font-medium bg-[#0F1117] min-w-[20rem] text-left">Detail</th> : null}
              <SortHeader label="Last Commit" column="lastCommit" widthClass="min-w-[8rem]" />
            </tr>
          </thead>
          <tbody>
            {sortedWorkers.map((worker) => {
              const blocker = classifyWorkerBlocker(worker);
              const tone: Tone = blocker === 'clear' ? 'green' : blocker === 'data' ? 'red' : 'amber';
              const palette = toneValue(tone);
              const oneSided = isOneSidedBook(worker);
              const sourceTone: Tone = !worker.marketDataSource ? 'blue' : worker.marketDataSource === 'kalshi_ws_ticker' ? 'green' : 'amber';
              const spotAgeTone = terminalPillTone(worker.cryptoPriceAgeMs, ALERT_THRESHOLDS.warningQuoteAgeMs, ALERT_THRESHOLDS.criticalQuoteAgeMs);
              const lagMs = workerPricingLagMs(worker);
              const lagTone = terminalPillTone(lagMs, ALERT_THRESHOLDS.warningPricingLagMs, ALERT_THRESHOLDS.criticalPricingLagMs);
              const recentlyChanged = (changedWorkerUntil[worker.assetKey] ?? 0) > now;
              const spread = workerSpread(worker);

              return (
                <tr
                  key={worker.assetKey}
                  className="border-b align-top"
                  style={{
                    borderColor: 'rgba(148,163,184,0.08)',
                    background: recentlyChanged
                      ? 'linear-gradient(90deg, rgba(56,189,248,0.06), rgba(15,17,23,0.12) 18%, transparent 68%)'
                      : 'transparent',
                    boxShadow: `inset 3px 0 0 ${palette.color}22`,
                  }}
                >
                  <td className="sticky left-0 z-[1] py-3 bg-[#0F1117]">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text">{worker.assetKey.toUpperCase()}</span>
                        <span
                          className={`inline-flex h-2.5 w-2.5 rounded-full ${recentlyChanged ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: recentlyChanged ? '#38BDF8' : 'rgba(148,163,184,0.45)' }}
                        />
                      </div>
                      <div className="text-[11px] text-muted">{worker.marketTicker ? 'live market' : 'no market'}</div>
                    </div>
                  </td>
                  <td className="sticky left-[9rem] z-[1] py-3 bg-[#0F1117]">
                    <div className="flex flex-wrap gap-1 max-w-[10rem]">
                      <span className={worker.hasValidAsk ? (oneSided ? 'badge badge-amber' : 'badge badge-green') : 'badge badge-red'}>
                        {worker.hasValidAsk ? (oneSided ? 'fragile' : 'orderable') : 'blocked'}
                      </span>
                      <span className="badge badge-gray">{(worker.enginePhase ?? 'idle').replace(/_/g, ' ')}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col gap-1 max-w-[17rem]">
                      <span className="font-mono text-text break-all leading-snug">{worker.marketTicker ?? '—'}</span>
                      <span className="text-[11px] text-muted leading-snug">{worker.lastOrderableAt ? `orderable ${formatRelativeMoment(worker.lastOrderableAt)}` : 'never orderable'}</span>
                    </div>
                  </td>
                  <td className="py-3 font-mono text-muted whitespace-nowrap">{formatTimeToExpiry(worker.marketCloseTime)}</td>
                  <td className="py-3 text-right font-mono text-text">{worker.currentPrice != null ? `$${worker.currentPrice.toLocaleString()}` : '—'}</td>
                  <td className="py-3 text-right font-mono text-muted">{worker.marketFloorStrike != null ? `$${worker.marketFloorStrike.toLocaleString()}` : '—'}</td>
                  {showBookColumns ? <td className="py-3 text-right font-mono text-text">{worker.marketYesBidCents ?? '—'}</td> : null}
                  {showBookColumns ? <td className="py-3 text-right font-mono text-text">{worker.marketYesAskCents ?? '—'}</td> : null}
                  {showBookColumns ? <td className="py-3 text-right font-mono text-text">{worker.marketNoBidCents ?? '—'}</td> : null}
                  {showBookColumns ? <td className="py-3 text-right font-mono text-text">{worker.marketNoAskCents ?? '—'}</td> : null}
                  {showBookColumns ? <td className="py-3 text-right font-mono text-muted">{spread != null ? `${spread.toFixed(1)}c` : '—'}</td> : null}
                  {showFreshnessColumns ? <td className="py-3">
                    <StatusPill value={formatPriceAge(worker.cryptoPriceAgeMs)} tone={spotAgeTone} sub={worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs < 1000 ? 'fresh' : 'quote'} />
                  </td> : null}
                  {showFreshnessColumns ? <td className="py-3">
                    <StatusPill value={formatLatency(lagMs)} tone={lagTone} sub={lagMs != null && lagMs <= ALERT_THRESHOLDS.warningPricingLagMs ? 'hot path' : 'pipeline'} />
                  </td> : null}
                  <td className="py-3">
                    <span className="badge" style={{ backgroundColor: sourceTone === 'green' ? 'rgba(34,197,94,0.12)' : sourceTone === 'amber' ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.12)', color: sourceTone === 'green' ? '#22C55E' : sourceTone === 'amber' ? '#F59E0B' : '#94A3B8' }}>
                      {formatMarketSource(worker.marketDataSource)}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono" style={{ color: worker.currentEV != null && worker.currentEV >= 0 ? '#22C55E' : worker.currentEV != null ? '#F59E0B' : '#94A3B8' }}>
                    {worker.currentEV != null ? `${worker.currentEV >= 0 ? '+' : ''}${worker.currentEV.toFixed(1)}c` : '—'}
                  </td>
                  {showProbabilityColumns ? <td className="py-3"><MiniMeter value={worker.modelProbability} tone={probabilityTone(worker.modelProbability, 'model')} compact /></td> : null}
                  {showProbabilityColumns ? <td className="py-3"><MiniMeter value={worker.marketProbability} tone={probabilityTone(worker.marketProbability, 'market')} compact /></td> : null}
                  {showProbabilityColumns ? <td className="py-3"><MiniMeter value={worker.confidence} tone={probabilityTone(worker.confidence, 'confidence')} compact /></td> : null}
                  {showBlockerColumns ? <td className="py-3">
                    <span className="badge" style={{ backgroundColor: palette.background, color: palette.color }}>{blockerLabel(blocker)}</span>
                  </td> : null}
                  {showBlockerColumns ? <td className="py-3">
                    <div className="max-w-[19rem] text-xs text-muted leading-snug">{worker.noTradeReason ?? 'Entry path clear'}</div>
                  </td> : null}
                  <td className="py-3">
                    {worker.lastCommittedCandidateAt ? <span className="badge badge-blue">{formatRelativeMoment(worker.lastCommittedCandidateAt)}</span> : <span className="text-xs text-muted">never</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentFillsPanel({
  fills,
  windowLabel,
  window,
  onWindowChange,
}: {
  fills: KalshiFill[] | undefined;
  windowLabel: string;
  window: LedgerWindow;
  onWindowChange: (next: LedgerWindow) => void;
}) {
  const rows = useMemo(
    () => [...(fills ?? [])]
      .filter((fill) => STRATEGY_ASSET_SET.has(assetFromFill(fill).toUpperCase()))
      .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime()),
    [fills]
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Recent Fills</p>
          <p className="text-sm text-muted">Dense ledger table with fill time, trade placed time, model probability, fee, linkage, and fill-level realized P/L.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FilterChipBar
            value={window}
            onChange={onWindowChange}
            options={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "all", label: "All" },
            ]}
          />
          <HeroSignal label={`${rows.length} fills · ${windowLabel}`} tone="violet" />
        </div>
      </div>

      {fills == null ? (
        <div className="text-sm text-muted">Loading the recent ledger tail from `/api/fills`…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted">No fills yet. The ledger table will populate after the first ingested fills.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1280px]">
            <thead>
              <tr className="text-left text-muted border-b" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
                <th className="sticky top-0 left-0 z-10 py-2 font-medium bg-[#0F1117] min-w-[8rem]">Time</th>
                <th className="sticky top-0 left-[8rem] z-10 py-2 font-medium bg-[#0F1117] min-w-[6rem]">Asset</th>
                <th className="py-2 font-medium min-w-[8rem]">Trade Placed</th>
                <th className="sticky top-0 z-10 py-2 font-medium bg-[#0F1117] min-w-[18rem]">Market</th>
                <th className="py-2 font-medium">Side</th>
                <th className="py-2 font-medium text-right">Count</th>
                <th className="py-2 font-medium text-right">Fill</th>
                <th className="py-2 font-medium text-right">Model P</th>
                <th className="py-2 font-medium text-right">Fee</th>
                <th className="py-2 font-medium">Outcome</th>
                <th className="py-2 font-medium text-right">Net P/L</th>
                <th className="py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fill) => {
                const outcome = fill.outcome ?? null;
                const netPnl = outcome ? deriveFillNetPnlCents(fill, outcome) : fill.pnl_net_cents ?? null;
                return (
                  <tr key={`${fill.trade_id}-${fill.order_id}`} className="border-b" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="sticky left-0 z-[1] py-2 bg-[#0F1117] text-muted">{formatShortTimestamp(fill.created_time)}</td>
                    <td className="sticky left-[8rem] z-[1] py-2 bg-[#0F1117] font-medium text-text">{assetFromFill(fill)}</td>
                    <td className="py-2 text-muted">{formatShortTimestampValue(fill.trade_entry_timestamp)}</td>
                    <td className="py-2 text-xs text-muted truncate max-w-[18rem]">{fill.ticker}</td>
                    <td className="py-2">
                      <span className={String(fill.side).toLowerCase() === 'yes' ? 'badge badge-green' : 'badge badge-red'}>
                        {String(fill.side).toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-muted">{formatCount(fill.count)}</td>
                    <td className="py-2 text-right font-mono text-text">{getFillPriceCents(fill)}c</td>
                    <td className="py-2 text-right font-mono text-text">{formatPercent(fill.trade_model_probability)}</td>
                    <td className="py-2 text-right font-mono text-muted">{fill.fee_cents != null ? `${fill.fee_cents}c` : '—'}</td>
                    <td className="py-2">
                      {outcome ? (
                        <span className={outcome === 'win' ? 'badge badge-green' : 'badge badge-red'}>{outcome.toUpperCase()}</span>
                      ) : (
                        <span className="badge badge-amber">PENDING</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono" style={{ color: (netPnl ?? 0) >= 0 ? '#22C55E' : '#EF4444' }}>
                      {netPnl != null ? formatCents(netPnl) : '—'}
                    </td>
                    <td className="py-2">
                      <span className={fill.paper_trade_id ? 'badge badge-blue' : 'badge badge-gray'}>
                        {fill.paper_trade_id ? 'linked' : 'unmatched'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StickyEscalations({
  alerts,
}: {
  alerts: Escalation[];
}) {
  const { data: storedPrefs = [], mutate } = useSWR<AlertPreference[]>(
    "alert-preferences",
    getAlertPreferences,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 5_000,
    }
  );

  const prefMap = useMemo(
    () =>
      storedPrefs.reduce<Record<string, AlertPreference>>((acc, item) => {
        acc[item.key] = item;
        return acc;
      }, {}),
    [storedPrefs]
  );

  useEffect(() => {
    const activeKeys = new Set(alerts.map(alertKey));
    const staleKeys = storedPrefs
      .filter((pref) => pref.acknowledged && !activeKeys.has(pref.key))
      .map((pref) => pref.key);

    if (staleKeys.length === 0) return;

    let cancelled = false;
    void (async () => {
      await Promise.all(staleKeys.map((key) => clearAlertPreference(key).catch(() => undefined)));
      if (!cancelled) await mutate();
    })();

    return () => {
      cancelled = true;
    };
  }, [alerts, storedPrefs, mutate]);

  const now = Date.now();
  const visibleAlerts = alerts.filter((alert) => {
    const pref = prefMap[alertKey(alert)];
    if (pref?.acknowledged) return false;
    if (pref?.muteUntil && new Date(pref.muteUntil).getTime() > now) return false;
    return true;
  });
  const mutedAlerts = alerts.filter((alert) => {
    const muteUntil = prefMap[alertKey(alert)]?.muteUntil;
    return muteUntil != null && new Date(muteUntil).getTime() > now;
  });
  const acknowledgedAlerts = alerts.filter((alert) => prefMap[alertKey(alert)]?.acknowledged);

  const updateAlertPref = async (
    key: string,
    next: { acknowledged?: boolean; muteUntil?: number | null }
  ) => {
    const optimistic: AlertPreference[] = [
      ...storedPrefs.filter((pref) => pref.key !== key),
      {
        key,
        acknowledged: next.acknowledged === true,
        muteUntil:
          next.muteUntil != null
            ? new Date(next.muteUntil).toISOString()
            : null,
        updatedAt: new Date().toISOString(),
      },
    ].filter((pref) => pref.acknowledged || pref.muteUntil != null);

    await mutate(optimistic, { revalidate: false });
    try {
      await upsertAlertPreference({
        key,
        acknowledged: next.acknowledged === true,
        muteUntil: next.muteUntil != null ? new Date(next.muteUntil).toISOString() : null,
      });
      await mutate();
    } catch {
      await mutate();
    }
  };

  const clearAllOverrides = async () => {
    await mutate([], { revalidate: false });
    try {
      await clearAlertPreference();
      await mutate([], { revalidate: false });
    } catch {
      await mutate();
    }
  };

  if (alerts.length === 0 && mutedAlerts.length === 0 && acknowledgedAlerts.length === 0) return null;

  return (
    <div className="sticky top-3 z-30 mb-6 flex flex-col gap-3">
      {(mutedAlerts.length > 0 || acknowledgedAlerts.length > 0) ? (
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(15,17,23,0.88)",
            border: "1px solid rgba(56,189,248,0.18)",
            boxShadow: "0 18px 30px rgba(2,6,23,0.18)",
          }}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <HeroSignal label="ALERT CONTROL" tone="blue" />
              {mutedAlerts.length > 0 ? <span>{mutedAlerts.length} muted</span> : null}
              {acknowledgedAlerts.length > 0 ? <span>{acknowledgedAlerts.length} acknowledged</span> : null}
              {mutedAlerts.length > 0 ? (
                <span>
                  next unmute{" "}
                  {new Date(
                    Math.min(
                      ...mutedAlerts
                        .map((alert) => {
                          const muteUntil = prefMap[alertKey(alert)]?.muteUntil;
                          return muteUntil ? new Date(muteUntil).getTime() : Number.POSITIVE_INFINITY;
                        })
                        .filter((value): value is number => Number.isFinite(value))
                    )
                  ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={clearAllOverrides}
              className="badge transition-colors"
              style={{
                backgroundColor: "rgba(15,23,42,0.65)",
                color: "#38BDF8",
                border: "1px solid rgba(56,189,248,0.28)",
                cursor: "pointer",
              }}
            >
              Clear alert mutes
            </button>
          </div>
        </div>
      ) : null}

      {visibleAlerts.map((alert) => {
        const palette = toneValue(alert.tone);
        const key = alertKey(alert);
        return (
          <div
            key={key}
            className="rounded-2xl px-4 py-3 backdrop-blur"
            style={{
              background: `linear-gradient(135deg, rgba(15,17,23,0.96), ${palette.background})`,
              border: `1px solid ${palette.color}40`,
              boxShadow: "0 18px 30px rgba(2,6,23,0.22)",
            }}
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <HeroSignal label={alert.kicker} tone={alert.tone} />
                  <span className="text-sm font-semibold text-text">{alert.title}</span>
                </div>
                <p className="text-sm text-slate-300">{alert.detail}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { void updateAlertPref(key, { acknowledged: true, muteUntil: null }); }}
                  className="badge transition-colors"
                  style={{
                    backgroundColor: "rgba(15,23,42,0.65)",
                    color: "#E2E8F0",
                    border: "1px solid rgba(148,163,184,0.2)",
                    cursor: "pointer",
                  }}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  onClick={() => { void updateAlertPref(key, { acknowledged: false, muteUntil: Date.now() + 15 * 60_000 }); }}
                  className="badge transition-colors"
                  style={{
                    backgroundColor: "rgba(15,23,42,0.65)",
                    color: "#F59E0B",
                    border: "1px solid rgba(245,158,11,0.28)",
                    cursor: "pointer",
                  }}
                >
                  Mute 15m
                </button>
                <button
                  type="button"
                  onClick={() => { void updateAlertPref(key, { acknowledged: false, muteUntil: Date.now() + 60 * 60_000 }); }}
                  className="badge transition-colors"
                  style={{
                    backgroundColor: "rgba(15,23,42,0.65)",
                    color: "#38BDF8",
                    border: "1px solid rgba(56,189,248,0.28)",
                    cursor: "pointer",
                  }}
                >
                  Mute 1h
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExecutionDrilldown({
  trades,
  fills,
  executionEvents,
  windowLabel,
}: {
  trades: Trade[] | undefined;
  fills: KalshiFill[] | undefined;
  executionEvents: ExecutionEvent[];
  windowLabel: string;
}) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const rows = useMemo(
    () => [...(trades ?? [])]
      .filter((trade) => trade.isLive)
      .sort((a, b) => b.entryTimestamp - a.entryTimestamp)
      .slice(0, 8),
    [trades]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tradeFromUrl = params.get("trade");
    if (tradeFromUrl) {
      setSelectedTradeId(tradeFromUrl);
    }
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedTradeId(null);
      return;
    }
    if (!selectedTradeId || !rows.some((trade) => trade.id === selectedTradeId)) {
      setSelectedTradeId(rows[0].id);
    }
  }, [rows, selectedTradeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedTradeId) {
      url.searchParams.set("trade", selectedTradeId);
    } else {
      url.searchParams.delete("trade");
    }
    window.history.replaceState({}, "", url.toString());
  }, [selectedTradeId]);

  useEffect(() => {
    if (rows.length === 0) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;

      if (!["ArrowUp", "ArrowDown", "j", "k"].includes(event.key)) return;
      event.preventDefault();

      const currentIndex = rows.findIndex((trade) => trade.id === selectedTradeId);
      const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        event.key === "ArrowUp" || event.key === "k"
          ? Math.max(0, fallbackIndex - 1)
          : Math.min(rows.length - 1, fallbackIndex + 1);
      setSelectedTradeId(rows[nextIndex]?.id ?? rows[0]?.id ?? null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, selectedTradeId]);

  const pending = rows.filter((trade) => trade.outcome === "pending").length;
  const settled = rows.filter((trade) => trade.outcome === "win" || trade.outcome === "loss").length;
  const realizedPnl = rows.reduce((sum, trade) => sum + (tradePnlTotal(trade) ?? 0), 0);
  const submittedCount = executionEvents.filter((event) => event.stage === "submitted").length;
  const acceptedCount = executionEvents.filter((event) => event.stage === "accepted" || event.stage === "settled").length;
  const acceptedRate = submittedCount > 0 ? acceptedCount / submittedCount : null;
  const selectedTrade = rows.find((trade) => trade.id === selectedTradeId) ?? rows[0] ?? null;
  const selectedTradeConfidencePct = normalizedPercentValue(selectedTrade?.confidence);
  const selectedTradeFills = useMemo(
    () => (selectedTrade ? linkedFillsForTrade(selectedTrade, fills ?? []) : []),
    [selectedTrade, fills]
  );
  const selectedTradeEvents = useMemo(
    () => (selectedTrade ? linkedEventsForTrade(selectedTrade, executionEvents) : []),
    [selectedTrade, executionEvents]
  );
  const reconciliation = useMemo(() => {
    if (!selectedTrade) {
      return {
        expectedCount: 0,
        filledCount: 0,
        orderLinked: 0,
        tradeLinked: 0,
        inferred: 0,
        coverageTone: "amber" as Tone,
        coverageLabel: "open",
        settlementTone: "amber" as Tone,
        settlementLabel: "awaiting trade",
        pnlTone: "blue" as Tone,
        pnlLabel: "awaiting pnl check",
      };
    }

    const expectedCount = selectedTrade.liveCount ?? selectedTrade.suggestedSize ?? 0;
    const filledCount = selectedTradeFills.reduce((sum, fill) => sum + (fill.count ?? 0), 0);
    const linkCounts = selectedTradeFills.reduce(
      (acc, fill) => {
        const kind = classifyFillLinkForTrade(selectedTrade, fill);
        if (kind) acc[kind] += 1;
        return acc;
      },
      { order: 0, trade: 0, inferred: 0 }
    );
    const settledFills = selectedTradeFills.filter((fill) => fill.outcome === "win" || fill.outcome === "loss");
    const fillNetTotal = settledFills.reduce(
      (sum, fill) => sum + (deriveFillNetPnlCents(fill, fill.outcome) ?? 0),
      0
    );
    const tradeNet = tradePnlTotal(selectedTrade);

    let coverageTone: Tone = "amber";
    let coverageLabel = "open";
    if (filledCount > 0 && expectedCount > 0 && filledCount >= expectedCount) {
      coverageTone = "green";
      coverageLabel = "full";
    } else if (filledCount > 0) {
      coverageTone = "amber";
      coverageLabel = "partial";
    }

    let settlementTone: Tone = "amber";
    let settlementLabel = "pending";
    if (selectedTrade.outcome === "pending") {
      settlementLabel = settledFills.length > 0 ? "fills settled first" : "pending";
      settlementTone = settledFills.length > 0 ? "amber" : "blue";
    } else if (settledFills.length === 0) {
      settlementLabel = "trade settled / fills open";
      settlementTone = "amber";
    } else if (settledFills.some((fill) => fill.outcome !== selectedTrade.outcome)) {
      settlementLabel = "outcome mismatch";
      settlementTone = "red";
    } else {
      settlementLabel = "settlement aligned";
      settlementTone = "green";
    }

    let pnlTone: Tone = "blue";
    let pnlLabel = "awaiting pnl check";
    if (tradeNet != null && settledFills.length > 0) {
      const drift = tradeNet - fillNetTotal;
      if (Math.abs(drift) <= 1) {
        pnlTone = "green";
        pnlLabel = "p/l aligned";
      } else {
        pnlTone = "red";
        pnlLabel = `p/l drift ${formatCents(drift)}`;
      }
    } else if (tradeNet != null) {
      pnlTone = "amber";
      pnlLabel = "trade only";
    }

    return {
      expectedCount,
      filledCount,
      orderLinked: linkCounts.order,
      tradeLinked: linkCounts.trade,
      inferred: linkCounts.inferred,
      coverageTone,
      coverageLabel,
      settlementTone,
      settlementLabel,
      pnlTone,
      pnlLabel,
    };
  }, [selectedTrade, selectedTradeEvents, selectedTradeFills]);

  return (
    <div className="panel overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Execution Drill-down</p>
            <p className="text-sm text-muted">Live trade rows in dense terminal form, with per-order detail and fill linkage beneath the selected row.</p>
          </div>
        <div className="flex flex-wrap gap-2">
          <HeroSignal label={windowLabel} tone="violet" />
          <HeroSignal label="↑ ↓ / j k to move" tone="blue" />
        </div>
      </div>

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
              <th className="py-2 font-medium">Summary</th>
              <th className="py-2 font-medium text-right">Current</th>
              <th className="py-2 font-medium">Signal</th>
              <th className="py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Pending live trades", value: formatCount(pending), tone: pending > 0 ? "amber" : "green", note: "accepted but not yet settled" },
              { label: "Settled trades", value: formatCount(settled), tone: settled > 0 ? "green" : "blue", note: "recent live trades resolved" },
              { label: "Accepted / submitted", value: formatPercent(acceptedRate), tone: acceptedRate != null && acceptedRate < 0.5 ? "amber" : "green", note: submittedCount > 0 ? `${acceptedCount} of ${submittedCount} recent submits` : "waiting for submissions in window" },
              { label: "Realized P/L", value: formatCents(realizedPnl), tone: realizedPnl < 0 ? "red" : "green", note: `${rows.length} recent live trade rows` },
            ].map((item) => {
              const palette = toneValue(item.tone as Tone);
              return (
                <tr key={item.label} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                  <td className="py-2 font-medium text-text">{item.label}</td>
                  <td className="py-2 text-right font-mono" style={{ color: palette.color }}>{item.value}</td>
                  <td className="py-2">
                    <span className="badge" style={{ backgroundColor: palette.background, color: palette.color }}>
                      {item.tone === "green" ? "healthy" : item.tone === "red" ? "critical" : item.tone === "amber" ? "watch" : "info"}
                    </span>
                  </td>
                  <td className="py-2 text-muted">{item.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trades == null ? (
        <div className="text-sm text-muted">Loading recent live-trade rows from `/api/trades`…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted">Live trade rows will appear here once `/api/trades` returns recent executions.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1380px]">
            <thead>
              <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                <th className="sticky top-0 left-0 z-10 py-2 font-medium bg-[#0F1117] min-w-[8rem]">Time</th>
                <th className="sticky top-0 left-[8rem] z-10 py-2 font-medium bg-[#0F1117] min-w-[6rem]">Asset</th>
                <th className="sticky top-0 z-10 py-2 font-medium bg-[#0F1117] min-w-[18rem]">Market</th>
                <th className="py-2 font-medium">Side</th>
                <th className="py-2 font-medium">Entry</th>
                <th className="py-2 font-medium">Size</th>
                <th className="py-2 font-medium">EV</th>
                <th className="py-2 font-medium">Model P</th>
                <th className="py-2 font-medium">Market P</th>
                <th className="py-2 font-medium">Confidence</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">P/L</th>
                <th className="py-2 font-medium">Order ID</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((trade) => {
                const pnl = tradePnlTotal(trade);
                const settledTrade = trade.outcome === "win" || trade.outcome === "loss";
                return (
                  <tr
                    key={trade.id}
                    className="border-b"
                    style={{
                      borderColor: "rgba(148,163,184,0.08)",
                      backgroundColor: selectedTrade?.id === trade.id ? "rgba(56,189,248,0.08)" : "transparent",
                    }}
                  >
                    <td className="sticky left-0 z-[1] py-2 bg-[#0F1117] text-muted">{formatShortTimestamp(new Date(trade.entryTimestamp).toISOString())}</td>
                    <td className="sticky left-[8rem] z-[1] py-2 bg-[#0F1117] font-medium text-text">{trade.asset}</td>
                    <td className="py-2">
                      <span className="text-xs text-muted truncate max-w-[18rem] block">{trade.ticker ?? "—"}</span>
                    </td>
                    <td className="py-2">
                      <span className={trade.direction === "yes" ? "badge badge-green" : "badge badge-red"}>
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-text">{trade.entryPrice}c</td>
                    <td className="py-2 font-mono text-muted">{formatCount(trade.liveCount ?? trade.suggestedSize)}</td>
                    <td className="py-2 font-mono text-text">{`${trade.ev >= 0 ? "+" : ""}${trade.ev.toFixed(1)}c`}</td>
                    <td className="py-2 font-mono text-text">{formatPercent(trade.modelProbability)}</td>
                    <td className="py-2 font-mono text-text">{formatPercent(trade.marketProbability)}</td>
                    <td className="py-2 font-mono text-text">{formatPercent(trade.confidence)}</td>
                    <td className="py-2">
                      <span className={settledTrade ? (trade.outcome === "win" ? "badge badge-green" : "badge badge-red") : "badge badge-amber"}>
                        {settledTrade ? trade.outcome.toUpperCase() : "PENDING"}
                      </span>
                    </td>
                    <td className="py-2 font-mono" style={{ color: (pnl ?? 0) >= 0 ? "#22C55E" : "#EF4444" }}>
                      {pnl != null ? formatCents(pnl) : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-muted">{trade.orderId ?? "—"}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTradeId(trade.id)}
                        className="badge transition-colors"
                        style={{
                          backgroundColor: selectedTrade?.id === trade.id ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.65)",
                          color: selectedTrade?.id === trade.id ? "#38BDF8" : "#94A3B8",
                          border: `1px solid ${selectedTrade?.id === trade.id ? "rgba(56,189,248,0.28)" : "rgba(51,65,85,0.8)"}`,
                          cursor: "pointer",
                        }}
                      >
                        {selectedTrade?.id === trade.id ? "Open" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTrade ? (
        <div
          className="mt-4 rounded-2xl p-4"
          style={{
            background: "linear-gradient(180deg, rgba(15,23,42,0.72), rgba(15,17,23,0.92))",
            border: "1px solid rgba(56,189,248,0.16)",
          }}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <HeroSignal label="ORDER DETAIL" tone="blue" />
                <HeroSignal label={selectedTrade.asset} tone="violet" />
                <HeroSignal
                  label={selectedTrade.outcome === "pending" ? "PENDING" : selectedTrade.outcome.toUpperCase()}
                  tone={selectedTrade.outcome === "pending" ? "amber" : ((tradePnlTotal(selectedTrade) ?? 0) >= 0 ? "green" : "red")}
                />
              </div>
              <h3 className="text-lg font-semibold text-text">Per-order drill-down</h3>
              <p className="text-sm text-muted">
                Linked trade row, fills, and execution trail for {selectedTrade.ticker ?? selectedTrade.asset}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <HeroSignal label={`order ${selectedTrade.orderId ?? "none"}`} tone="blue" />
              <HeroSignal label={`fills ${selectedTradeFills.length}`} tone={selectedTradeFills.length > 0 ? "green" : "amber"} />
              <HeroSignal label={`events ${selectedTradeEvents.length}`} tone={selectedTradeEvents.length > 0 ? "blue" : "amber"} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <HeroSignal label={`coverage ${reconciliation.filledCount}/${reconciliation.expectedCount || 0} · ${reconciliation.coverageLabel}`} tone={reconciliation.coverageTone} />
            <HeroSignal label={`order-linked ${reconciliation.orderLinked}`} tone={reconciliation.orderLinked > 0 ? "green" : "amber"} />
            <HeroSignal label={`trade-linked ${reconciliation.tradeLinked}`} tone={reconciliation.tradeLinked > 0 ? "green" : "amber"} />
            <HeroSignal label={`inferred ${reconciliation.inferred}`} tone={reconciliation.inferred > 0 ? "amber" : "blue"} />
            <HeroSignal label={reconciliation.settlementLabel} tone={reconciliation.settlementTone} />
            <HeroSignal label={reconciliation.pnlLabel} tone={reconciliation.pnlTone} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr] mb-4">
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                    <th className="py-2 px-3 font-medium">Order Field</th>
                    <th className="py-2 px-3 font-medium text-right">Value</th>
                    <th className="py-2 px-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Entry", value: `${selectedTrade.entryPrice}c`, note: selectedTrade.direction.toUpperCase(), tone: selectedTrade.direction === "yes" ? "green" : "red" },
                    { label: "Size", value: formatCount(selectedTrade.liveCount ?? selectedTrade.suggestedSize), note: "live or suggested count", tone: "blue" },
                    { label: "Expected EV", value: `${selectedTrade.ev >= 0 ? "+" : ""}${selectedTrade.ev.toFixed(1)}c`, note: "per contract at commit", tone: selectedTrade.ev >= 0 ? "green" : "amber" },
                    { label: "Confidence", value: formatPercent(selectedTrade.confidence), note: `regime ${selectedTrade.regime}`, tone: (selectedTradeConfidencePct ?? 0) >= 85 ? "green" : "amber" },
                    { label: "Realized P/L", value: formatCents(tradePnlTotal(selectedTrade)), note: selectedTrade.outcome === "pending" ? "unsettled" : "settled outcome", tone: (tradePnlTotal(selectedTrade) ?? 0) >= 0 ? "green" : "red" },
                    { label: "Linked fills", value: formatCount(selectedTradeFills.length), note: selectedTradeFills.length > 0 ? `${selectedTradeEvents.length} execution events` : "no linked fills yet", tone: selectedTradeFills.length > 0 ? "green" : "amber" },
                  ].map((row) => {
                    const palette = toneValue(row.tone as Tone);
                    return (
                      <tr key={row.label} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                        <td className="py-2 px-3 font-medium text-text">{row.label}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: palette.color }}>{row.value}</td>
                        <td className="py-2 px-3 text-muted">{row.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
              <table className="w-full text-sm min-w-[460px]">
                <thead>
                  <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                    <th className="py-2 px-3 font-medium">Reconciliation</th>
                    <th className="py-2 px-3 font-medium text-right">Current</th>
                    <th className="py-2 px-3 font-medium">Signal</th>
                    <th className="py-2 px-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Coverage", value: `${reconciliation.filledCount}/${reconciliation.expectedCount || 0}`, note: reconciliation.coverageLabel, tone: reconciliation.coverageTone },
                    { label: "Order-linked fills", value: String(reconciliation.orderLinked), note: "matched by order id", tone: reconciliation.orderLinked > 0 ? "green" : "amber" },
                    { label: "Trade-linked fills", value: String(reconciliation.tradeLinked), note: "matched by trade linkage", tone: reconciliation.tradeLinked > 0 ? "green" : "amber" },
                    { label: "Inferred fills", value: String(reconciliation.inferred), note: "ticker / timing fallback", tone: reconciliation.inferred > 0 ? "amber" : "blue" },
                    { label: "Settlement", value: reconciliation.settlementLabel, note: "trade vs fill outcome alignment", tone: reconciliation.settlementTone },
                    { label: "P/L check", value: reconciliation.pnlLabel, note: "trade row vs fill economics", tone: reconciliation.pnlTone },
                  ].map((row) => {
                    const palette = toneValue(row.tone as Tone);
                    return (
                      <tr key={row.label} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                        <td className="py-2 px-3 font-medium text-text">{row.label}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: palette.color }}>{row.value}</td>
                        <td className="py-2 px-3">
                          <span className="badge" style={{ backgroundColor: palette.background, color: palette.color }}>
                            {row.tone === "green" ? "aligned" : row.tone === "red" ? "drift" : row.tone === "amber" ? "watch" : "info"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-muted">{row.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(2,6,23,0.38)", border: "1px solid rgba(148,163,184,0.08)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Linked fills</p>
                  <p className="text-sm text-muted">Matched by order id, trade linkage, or ticker-time window.</p>
                </div>
                <HeroSignal label={`${selectedTradeFills.length} rows`} tone={selectedTradeFills.length > 0 ? "green" : "amber"} />
              </div>
              {selectedTradeFills.length === 0 ? (
                <p className="text-sm text-muted">No linked fills yet for this order.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                        <th className="py-2 font-medium">Time</th>
                        <th className="py-2 font-medium">Side</th>
                        <th className="py-2 font-medium text-right">Count</th>
                        <th className="py-2 font-medium text-right">Fill</th>
                        <th className="py-2 font-medium text-right">Fee</th>
                        <th className="py-2 font-medium">Outcome</th>
                        <th className="py-2 font-medium text-right">Net P/L</th>
                        <th className="py-2 font-medium">Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTradeFills.map((fill) => {
                        const pnl = fill.outcome ? deriveFillNetPnlCents(fill, fill.outcome) : fill.pnl_net_cents ?? null;
                        return (
                          <tr key={`${fill.trade_id}-${fill.order_id}`} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                            <td className="py-2 text-muted">{formatShortTimestamp(fill.created_time)}</td>
                            <td className="py-2">
                              <span className={String(fill.side).toLowerCase() === "yes" ? "badge badge-green" : "badge badge-red"}>
                                {String(fill.side).toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 text-right font-mono text-muted">{formatCount(fill.count)}</td>
                            <td className="py-2 text-right font-mono text-text">{getFillPriceCents(fill)}c</td>
                            <td className="py-2 text-right font-mono text-muted">{fill.fee_cents != null ? `${fill.fee_cents}c` : "—"}</td>
                            <td className="py-2">
                              {fill.outcome ? (
                                <span className={fill.outcome === "win" ? "badge badge-green" : "badge badge-red"}>
                                  {fill.outcome.toUpperCase()}
                                </span>
                              ) : (
                                <span className="badge badge-amber">PENDING</span>
                              )}
                            </td>
                            <td className="py-2 text-right font-mono" style={{ color: (pnl ?? 0) >= 0 ? "#22C55E" : "#EF4444" }}>
                              {pnl != null ? formatCents(pnl) : "—"}
                            </td>
                            <td className="py-2 font-mono text-xs text-muted">{fill.order_id}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(2,6,23,0.38)", border: "1px solid rgba(148,163,184,0.08)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Execution trail</p>
                  <p className="text-sm text-muted">Candidate to settlement timeline grouped onto this order.</p>
                </div>
                <HeroSignal label={`${selectedTradeEvents.length} steps`} tone="blue" />
              </div>
              {selectedTradeEvents.length === 0 ? (
                <p className="text-sm text-muted">No parsed execution events linked to this trade yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                        <th className="py-2 font-medium">Time</th>
                        <th className="py-2 font-medium">Stage</th>
                        <th className="py-2 font-medium">Message</th>
                        <th className="py-2 font-medium">Detail</th>
                        <th className="py-2 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTradeEvents.map((event) => (
                        <tr key={event.id} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                          <td className="py-2 text-muted">{formatRelativeMoment(event.iso)}</td>
                          <td className="py-2">
                            <HeroSignal label={executionStageLabel(event.stage)} tone={executionStageTone(event.stage)} />
                          </td>
                          <td className="py-2 text-text">{event.message}</td>
                          <td className="py-2 text-xs text-muted">{event.detail}</td>
                          <td className="py-2 font-mono text-xs text-muted">{event.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CandidateHistoryPanel({
  events,
  windowLabel,
}: {
  events: ExecutionEvent[];
  windowLabel: string;
}) {
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<"all" | ExecutionStage>("all");
  const assetOptions = useMemo(
    () => ["all", ...new Set(events.map((event) => event.asset).filter((asset): asset is string => !!asset))],
    [events]
  );
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (assetFilter !== "all" && event.asset !== assetFilter) return false;
        if (stageFilter !== "all" && event.stage !== stageFilter) return false;
        return true;
      }),
    [events, assetFilter, stageFilter]
  );
  const groups = useMemo(() => groupExecutionEvents(filteredEvents).slice(0, 8), [filteredEvents]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Candidate Replay</p>
          <p className="text-sm text-muted">Grouped by ticker so each market reads like one story instead of a flat pile of events.</p>
        </div>
        <HeroSignal label={`${groups.length} tickers · ${windowLabel}`} tone="blue" />
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <FilterChipBar
          value={assetFilter}
          onChange={setAssetFilter}
          options={assetOptions.map((asset) => ({
            value: asset,
            label: asset === "all" ? "All assets" : asset,
          }))}
        />
        <FilterChipBar
          value={stageFilter}
          onChange={setStageFilter}
          options={[
            { value: "all", label: "All stages" },
            { value: "candidate", label: "Candidate" },
            { value: "committed", label: "Committed" },
            { value: "blocked", label: "Blocked" },
            { value: "submitted", label: "Submitted" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "matched", label: "Matched" },
            { value: "settled", label: "Settled" },
          ]}
        />
      </div>

      {filteredEvents.length === 0 ? (
        <div className="text-sm text-muted">No recent execution-relevant events in this window.</div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const latest = group.events[0];
            const stageCounts = group.events.reduce<Record<ExecutionStage, number>>((acc, event) => {
              acc[event.stage] = (acc[event.stage] ?? 0) + 1;
              return acc;
            }, {
              candidate: 0,
              committed: 0,
              blocked: 0,
              submitted: 0,
              accepted: 0,
              rejected: 0,
              matched: 0,
              settled: 0,
            });

            return (
              <div
                key={group.key}
                className="rounded-xl px-3 py-3"
                style={{ backgroundColor: "rgba(2,6,23,0.45)", border: "1px solid rgba(148,163,184,0.08)" }}
              >
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <HeroSignal label={executionStageLabel(latest.stage)} tone={executionStageTone(latest.stage)} />
                      {group.asset ? <span className="text-sm font-semibold text-text">{group.asset}</span> : null}
                      {group.ticker ? <span className="text-xs font-mono text-muted truncate">{group.ticker}</span> : null}
                      <span className="text-xs text-muted">{formatRelativeMoment(latest.iso)}</span>
                    </div>
                    <p className="text-sm text-slate-200">{latest.message}</p>
                    <p className="text-xs text-muted mt-1">
                      {group.events.length} execution-relevant event{group.events.length === 1 ? "" : "s"} in this market replay.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["candidate", "committed", "blocked", "submitted", "accepted", "rejected", "matched", "settled"] as ExecutionStage[])
                      .filter((stage) => stageCounts[stage] > 0)
                      .map((stage) => (
                        <HeroSignal
                          key={stage}
                          label={`${executionStageLabel(stage)} ${stageCounts[stage]}`}
                          tone={executionStageTone(stage)}
                        />
                      ))}
                  </div>
                  <div className="space-y-2">
                    {group.events.slice(0, 5).map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl px-3 py-2"
                        style={{ backgroundColor: "rgba(15,23,42,0.58)", border: "1px solid rgba(148,163,184,0.08)" }}
                      >
                        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <HeroSignal label={executionStageLabel(event.stage)} tone={executionStageTone(event.stage)} />
                              <span className="text-sm text-text">{event.message}</span>
                            </div>
                            <p className="text-xs text-muted">{event.detail}</p>
                          </div>
                          <div className="flex flex-col items-start xl:items-end gap-1 text-xs text-muted">
                            <span>{formatRelativeMoment(event.iso)}</span>
                            <span className="font-mono">{event.source}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecentEventsRail({
  events,
  logs,
  windowLabel,
}: {
  events: string[];
  logs: string[];
  windowLabel: string;
}) {
  const warningLogs = useMemo(
    () => (logs ?? [])
      .filter((line) => {
        const upper = line.toUpperCase();
        return upper.includes("ERROR") || upper.includes("WARN") || upper.includes("TRADE BLOCKED") || upper.includes("TRADE SKIPPED");
      })
      .slice(-8)
      .reverse(),
    [logs]
  );
  const [showEngineTail, setShowEngineTail] = useState(false);
  const [showWarningTail, setShowWarningTail] = useState(false);
  const engineSummary = useMemo(() => ({
    committed: countMatches(events, /trade candidate committed/i),
    submitted: countMatches(events, /submitting live order|order request submitted/i) + countMatches(logs, /submitting live order|order request submitted/i),
    accepted: countMatches(events, /live order accepted|order accepted/i) + countMatches(logs, /live order accepted|order accepted/i),
    matched: countMatches(events, /matched .*fill/i) + countMatches(logs, /matched .*fill/i),
  }), [events, logs]);
  const warningSummary = useMemo(() => ({
    rejected: countMatches(logs, /rejected|invalid_order/i) + countMatches(events, /rejected|invalid_order/i),
    data: countMatches(logs, /market_data_unavailable|top[- ]of[- ]book|missing ask|crypto_unavailable/i) + countMatches(events, /market_data_unavailable|top[- ]of[- ]book|missing ask|crypto_unavailable/i),
    stale: countMatches(logs, /stale|heartbeat stale|logs stale/i),
    reconcile: countMatches(logs, /reconcil/i) + countMatches(events, /reconcil/i),
  }), [logs, events]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Engine Event Tail</p>
            <p className="text-sm text-muted">Recent trade, fill, and reconciliation activity from `/status`</p>
          </div>
          <HeroSignal label={`${events.length} events · ${windowLabel}`} tone="blue" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Committed" value={formatCount(engineSummary.committed)} sub="candidates that reached commit" tone={engineSummary.committed > 0 ? "green" : "blue"} />
          <MetricCard label="Submitted" value={formatCount(engineSummary.submitted)} sub="order submissions seen" tone={engineSummary.submitted > 0 ? "green" : "blue"} />
          <MetricCard label="Accepted" value={formatCount(engineSummary.accepted)} sub="live accepts in the window" tone={engineSummary.accepted > 0 ? "green" : "blue"} />
          <MetricCard label="Matched" value={formatCount(engineSummary.matched)} sub="fills linked back to trades" tone={engineSummary.matched > 0 ? "green" : "amber"} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Raw engine tail is collapsed by default so event noise stays secondary.</p>
          <button
            type="button"
            onClick={() => setShowEngineTail((value) => !value)}
            className="badge transition-colors"
            style={{
              backgroundColor: "rgba(15,23,42,0.65)",
              color: "#94A3B8",
              border: "1px solid rgba(51,65,85,0.8)",
              cursor: "pointer",
            }}
          >
            {showEngineTail ? "Hide raw tail" : "Show raw tail"}
          </button>
        </div>
        {showEngineTail ? (
          <div className="space-y-2 mt-4">
            {events.slice(-10).reverse().map((event, index) => (
              <div
                key={`${event}-${index}`}
                className="rounded-xl px-3 py-2 text-xs font-mono"
                style={{ backgroundColor: "rgba(2,6,23,0.45)", border: "1px solid rgba(148,163,184,0.08)" }}
              >
                {event}
              </div>
            ))}
            {events.length === 0 ? (
              <div className="text-sm text-muted">No recent engine events yet.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Warning Tail</p>
            <p className="text-sm text-muted">Recent warnings and blocked trades from `/logs`</p>
          </div>
          <HeroSignal label={warningLogs.length > 0 ? windowLabel : "no logs"} tone="amber" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard label="Rejected" value={formatCount(warningSummary.rejected)} sub="live rejects and invalid orders" tone={warningSummary.rejected > 0 ? "red" : "green"} />
          <MetricCard label="Data warnings" value={formatCount(warningSummary.data)} sub="crypto or market-data incidents" tone={warningSummary.data > 0 ? "amber" : "green"} />
          <MetricCard label="Staleness" value={formatCount(warningSummary.stale)} sub="heartbeat, logs, or stale warnings" tone={warningSummary.stale > 0 ? "amber" : "green"} />
          <MetricCard label="Reconcile" value={formatCount(warningSummary.reconcile)} sub="reconciliation mentions in current window" tone={warningSummary.reconcile > 0 ? "amber" : "green"} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Warning tail stays hidden unless you want the raw lines.</p>
          <button
            type="button"
            onClick={() => setShowWarningTail((value) => !value)}
            className="badge transition-colors"
            style={{
              backgroundColor: "rgba(15,23,42,0.65)",
              color: "#94A3B8",
              border: "1px solid rgba(51,65,85,0.8)",
              cursor: "pointer",
            }}
          >
            {showWarningTail ? "Hide raw tail" : "Show raw tail"}
          </button>
        </div>
        {showWarningTail ? (
          <div className="space-y-2 mt-4">
            {warningLogs.map((line, index) => (
              <div
                key={`${line}-${index}`}
                className="rounded-xl px-3 py-2 text-xs font-mono"
                style={{ backgroundColor: "rgba(2,6,23,0.45)", border: "1px solid rgba(148,163,184,0.08)" }}
              >
                {line}
              </div>
            ))}
            {warningLogs.length === 0 ? (
              <div className="text-sm text-muted">No recent warnings in the current log tail.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function OperatorConsoleClient({
  initialData,
}: {
  initialData?: DashboardConsoleBootstrap;
}) {
  const [opsWindow, setOpsWindow] = useState<OpsWindow>("15m");
  const [ledgerWindow, setLedgerWindow] = useState<LedgerWindow>("today");
  const [loadDeepData, setLoadDeepData] = useState(false);
  const [terminalSnapshot, setTerminalSnapshot] = useState<TerminalSnapshot | null>(() =>
    buildTerminalFallbackSnapshot(initialData?.health, initialData?.status, initialData?.analytics)
  );
  const [terminalConnection, setTerminalConnection] = useState<TerminalConnectionState>("reconnecting");
  const [lastTerminalUpdateAt, setLastTerminalUpdateAt] = useState<number>(() => Date.now());
  const [terminalClock, setTerminalClock] = useState<number>(() => Date.now());
  const [changedWorkerUntil, setChangedWorkerUntil] = useState<Record<string, number>>({});
  const terminalSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalenessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousTerminalFingerprintsRef = useRef<Record<string, string>>({});
  const lastSocketMessageAtRef = useRef<number>(Date.now());
  const healthRef = useRef<BackendHealth | undefined>(initialData?.health);
  const analyticsRef = useRef<FillAnalytics | undefined>(initialData?.analytics);

  useEffect(() => {
    setLoadDeepData(true);
  }, []);

  const { data: health } = useSWR<BackendHealth>("backend-health", getHealth, {
    refreshInterval: CORE_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 4_000,
    fallbackData: initialData?.health,
  });
  const { data: status } = useSWR<BackendStatus | null>("backend-status", getStatus, {
    refreshInterval: CORE_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 4_000,
    fallbackData: initialData?.status,
  });
  const { data: analytics } = useSWR<FillAnalytics>("dashboard-analytics", getAnalytics, {
    refreshInterval: ANALYTICS_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 10_000,
    fallbackData: initialData?.analytics,
  });
  const { data: liveBalance } = useSWR<AccountBalance>(loadDeepData ? "kalshi-balance" : null, getBalance, {
    refreshInterval: BALANCE_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 10_000,
    fallbackData: initialData?.liveBalance,
  });
  const { data: paperBalance } = useSWR<PaperBalance>(loadDeepData ? "paper-balance" : null, getPaperBalance, {
    refreshInterval: PAPER_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 15_000,
    fallbackData: initialData?.paperBalance,
  });
  const { data: paperStats } = useSWR<Stats>(loadDeepData ? "paper-stats" : null, getPaperStats, {
    refreshInterval: PAPER_REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 15_000,
    fallbackData: initialData?.paperStats,
  });
  const { data: fills } = useSWR<KalshiFill[]>(
    loadDeepData ? ["kalshi-fills", FILL_LIMIT] : null,
    () => getFills({ limit: FILL_LIMIT }),
    {
      refreshInterval: FILL_REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 15_000,
      fallbackData: initialData?.fills,
    }
  );
  const ledgerFillLimit = ledgerWindow === "today" ? FILL_LIMIT : EXTENDED_FILL_LIMIT;
  const { data: ledgerFillRows } = useSWR<KalshiFill[]>(
    loadDeepData ? ["kalshi-fills-ledger", ledgerWindow, ledgerFillLimit] : null,
    () => getFills({ limit: ledgerFillLimit, window: ledgerWindow }),
    {
      refreshInterval: FILL_REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 15_000,
    }
  );
  const { data: logs } = useSWR<LogsResponse>(
    loadDeepData ? ["backend-logs", LOG_LIMIT] : null,
    () => getLogs({ limit: LOG_LIMIT }),
    {
      refreshInterval: LOG_REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 10_000,
      fallbackData: initialData?.logs,
    }
  );
  const { data: trades } = useSWR<Trade[]>(
    loadDeepData ? ["live-trades", TRADE_LIMIT] : null,
    () => getTradesWithOptions({ limit: TRADE_LIMIT }),
    {
      refreshInterval: TRADE_REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 10_000,
      fallbackData: initialData?.trades,
    }
  );

  healthRef.current = health;
  analyticsRef.current = analytics;

  const applyTerminalSnapshot = (snapshot: TerminalSnapshot | null) => {
    if (!snapshot) return;
    const now = Date.now();
    const nextFingerprints: Record<string, string> = {};
    const changed: Record<string, number> = {};

    for (const worker of snapshot.workers) {
      const fingerprint = [
        worker.currentPrice ?? "—",
        worker.marketYesBidCents ?? "—",
        worker.marketYesAskCents ?? "—",
        worker.marketNoBidCents ?? "—",
        worker.marketNoAskCents ?? "—",
        worker.currentEV ?? "—",
        worker.modelProbability ?? "—",
        worker.marketProbability ?? "—",
        worker.confidence ?? "—",
        worker.noTradeReason ?? "clear",
        worker.enginePhase ?? "idle",
      ].join("|");
      nextFingerprints[worker.assetKey] = fingerprint;
      if (previousTerminalFingerprintsRef.current[worker.assetKey] !== fingerprint) {
        changed[worker.assetKey] = now + 1_200;
      }
    }

    previousTerminalFingerprintsRef.current = nextFingerprints;
    setChangedWorkerUntil((prev) => {
      const filtered = Object.fromEntries(
        Object.entries(prev).filter(([, until]) => until > now)
      );
      return { ...filtered, ...changed };
    });
    setTerminalSnapshot(snapshot);
    setLastTerminalUpdateAt(now);
    setTerminalClock(now);
  };

  useEffect(() => {
    const fallback = buildTerminalFallbackSnapshot(health, status, analytics);
    if (!fallback) return;
    if (terminalConnection !== "live") {
      applyTerminalSnapshot(fallback);
    }
  }, [analytics, health, status, terminalConnection]);

  useEffect(() => {
    const terminalUrl = getTerminalStreamUrl();
    let cancelled = false;
    let fallbackPollInFlight = false;

    const stopFallbackPolling = () => {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
    };

    const startFallbackPolling = () => {
      if (fallbackPollRef.current || cancelled) return;
      setTerminalConnection("polling");
      fallbackPollRef.current = setInterval(async () => {
        if (fallbackPollInFlight) return;
        fallbackPollInFlight = true;
        try {
          const nextStatus = await getStatus();
          if (!nextStatus) {
            setTerminalClock(Date.now());
            return;
          }
          const fallback = buildTerminalFallbackSnapshot(healthRef.current, nextStatus, analyticsRef.current);
          applyTerminalSnapshot(fallback);
          setTerminalConnection("polling");
        } finally {
          fallbackPollInFlight = false;
        }
      }, 1_000);
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectSocket();
      }, 1_500);
    };

    const connectSocket = () => {
      if (cancelled) return;
      if (!terminalUrl) {
        startFallbackPolling();
        return;
      }

      setTerminalConnection((current) => (current === "live" ? current : "reconnecting"));

      try {
        const socket = new WebSocket(terminalUrl);
        terminalSocketRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const snapshot = JSON.parse(String(event.data)) as TerminalSnapshot;
            lastSocketMessageAtRef.current = Date.now();
            stopFallbackPolling();
            setTerminalConnection("live");
            applyTerminalSnapshot(snapshot);
          } catch {
            setTerminalClock(Date.now());
          }
        };

        socket.onerror = () => {
          setTerminalClock(Date.now());
        };

        socket.onclose = () => {
          if (terminalSocketRef.current === socket) {
            terminalSocketRef.current = null;
          }
          if (cancelled) return;
          setTerminalConnection("reconnecting");
          startFallbackPolling();
          scheduleReconnect();
        };
      } catch {
        startFallbackPolling();
        scheduleReconnect();
      }
    };

    connectSocket();

    stalenessTimerRef.current = setInterval(() => {
      const now = Date.now();
      setTerminalClock(now);
      if (now - lastSocketMessageAtRef.current > 3_000) {
        setTerminalConnection((current) => (current === "live" ? "polling" : current));
        if (terminalSocketRef.current?.readyState === WebSocket.OPEN) {
          terminalSocketRef.current.close();
        }
        startFallbackPolling();
      }
    }, 1_000);

    return () => {
      cancelled = true;
      stopFallbackPolling();
      if (stalenessTimerRef.current) {
        clearInterval(stalenessTimerRef.current);
        stalenessTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      terminalSocketRef.current?.close();
      terminalSocketRef.current = null;
    };
  }, []);

  const operator = useMemo(() => deriveOperatorState(health, status), [health, status]);
  const terminalWorkers: TerminalWorkerSnapshot[] =
    terminalSnapshot?.workers ??
    ((status?.workers as TerminalWorkerSnapshot[] | undefined) ?? []);
  const terminalIsStale = terminalClock - lastTerminalUpdateAt > 3_000;
  const terminalBadge = useMemo(
    () => connectionBadge(terminalConnection, terminalIsStale),
    [terminalConnection, terminalIsStale]
  );
  const terminalBlockerSummary = useMemo(() => {
    if (terminalSnapshot) {
      return {
        counts: {
          clear: terminalSnapshot.blockerSummary.clear,
          confidence: terminalSnapshot.blockerSummary.confidence,
          ev: terminalSnapshot.blockerSummary.ev,
          data: terminalSnapshot.blockerSummary.data,
          risk: terminalSnapshot.blockerSummary.risk,
          window: terminalSnapshot.blockerSummary.window,
          other: terminalSnapshot.blockerSummary.other,
        } satisfies Record<BlockerCategory, number>,
        orderableCount: terminalSnapshot.operatorSummary.orderableWorkers,
        recentlyCommittedCount: terminalSnapshot.blockerSummary.recentlyCommitted,
      };
    }
    return buildBlockerSummary(terminalWorkers, windowMs(opsWindow));
  }, [opsWindow, terminalSnapshot, terminalWorkers]);
  const summary = analytics?.summary;
  const strategyFills = useMemo(
    () => (fills ?? []).filter((fill) => STRATEGY_ASSET_SET.has(assetFromFill(fill).toUpperCase())),
    [fills]
  );
  const ledgerFills = useMemo(
    () => (ledgerFillRows ?? []).filter((fill) => STRATEGY_ASSET_SET.has(assetFromFill(fill).toUpperCase())),
    [ledgerFillRows]
  );
  const sessionFills = useMemo(
    () => strategyFills.filter((fill) => localDayKey(fill.created_time) === localDayKey(new Date())),
    [strategyFills]
  );
  const opsFills = useMemo(
    () => strategyFills.filter((fill) => inOpsWindow(fill.created_time, opsWindow)),
    [strategyFills, opsWindow]
  );
  const opsRecentEvents = useMemo(
    () => (status?.recentEvents ?? []).filter((event) => inOpsWindow(event, opsWindow)),
    [status?.recentEvents, opsWindow]
  );
  const opsLogLines = useMemo(
    () => (logs?.logs ?? []).filter((line) => inOpsWindow(line, opsWindow)),
    [logs?.logs, opsWindow]
  );
  const opsTrades = useMemo(
    () => (trades ?? []).filter((trade) => inOpsWindow(new Date(trade.entryTimestamp).toISOString(), opsWindow)),
    [trades, opsWindow]
  );
  const executionEvents = useMemo(() => {
    const parsed = [
      ...opsRecentEvents.map((line) => parseExecutionLine(line, "status")),
      ...opsLogLines.map((line) => parseExecutionLine(line, "logs")),
      ...opsTrades.map(parseTradeExecutionEvent),
    ].filter((event): event is ExecutionEvent => event != null);

    return dedupeExecutionEvents(
      parsed.sort((a, b) => b.timestamp - a.timestamp)
    );
  }, [opsRecentEvents, opsLogLines, opsTrades]);
  const fillsSectionSummary = useMemo(() => {
    if (ledgerWindow === "all" && summary) return summary;
    const fallback = summarizeFills(ledgerFills);
    if (!fallback) return null;
    return {
      ...fallback,
      fillsFromDb: true,
    };
  }, [ledgerFills, ledgerWindow, summary]);
  const sessionSummary = useMemo(() => summarizeFills(sessionFills), [sessionFills]);
  const fillsMatchRate = fillsSectionSummary && fillsSectionSummary.totalFills > 0
    ? fillsSectionSummary.matchedFills / fillsSectionSummary.totalFills
    : null;
  const fillsSettledRate = fillsSectionSummary && fillsSectionSummary.totalFills > 0
    ? fillsSectionSummary.settledFills / fillsSectionSummary.totalFills
    : null;
  const sessionMatchRate = sessionSummary && sessionSummary.totalFills > 0
    ? sessionSummary.matchedFills / sessionSummary.totalFills
    : null;
  const sessionWinRate = sessionSummary && sessionSummary.settledFills > 0
    ? sessionSummary.winsCount / sessionSummary.settledFills
    : null;
  const fastestWorkerAge = useMemo(() => {
    const ages = terminalWorkers
      .map((worker) => worker.cryptoPriceAgeMs)
      .filter((age): age is number => age != null);
    if (ages.length === 0) return null;
    return Math.min(...ages);
  }, [terminalWorkers]);
  const slowestWorkerAge = useMemo(() => {
    const ages = terminalWorkers
      .map((worker) => worker.cryptoPriceAgeMs)
      .filter((age): age is number => age != null);
    if (ages.length === 0) return null;
    return Math.max(...ages);
  }, [terminalWorkers]);
  const terminalWorstQuoteAge = terminalSnapshot?.operatorSummary.worstQuoteAgeMs ?? slowestWorkerAge;
  const fastestWorkerLag = useMemo(() => {
    const lags = terminalWorkers
      .map((worker) => workerPricingLagMs(worker))
      .filter((lag): lag is number => lag != null);
    if (lags.length === 0) return null;
    return Math.min(...lags);
  }, [terminalWorkers]);
  const slowestWorkerLag = useMemo(() => {
    const lags = terminalWorkers
      .map((worker) => workerPricingLagMs(worker))
      .filter((lag): lag is number => lag != null);
    if (lags.length === 0) return null;
    return Math.max(...lags);
  }, [terminalWorkers]);
  const terminalFallbackWorkers = useMemo(
    () => terminalWorkers.filter((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker").length,
    [terminalWorkers]
  );
  const terminalFragileBooks = useMemo(
    () => terminalWorkers.filter((worker) => isOneSidedBook(worker)).length,
    [terminalWorkers]
  );
  const terminalStaleQuotes = useMemo(
    () => terminalWorkers.filter((worker) => (worker.cryptoPriceAgeMs ?? 0) > ALERT_THRESHOLDS.criticalQuoteAgeMs).length,
    [terminalWorkers]
  );
  const terminalPricingHealthy = terminalSnapshot?.operatorSummary.pricingPathHealthy ?? status?.pricing?.pricingPathHealthy ?? true;
  const terminalLatestCommitAt = useMemo(() => {
    const timestamps = terminalWorkers
      .map((worker) => {
        const value = worker.lastCommittedCandidateAt;
        if (value == null) return null;
        const ms = typeof value === "number" ? value : new Date(value).getTime();
        return Number.isFinite(ms) ? ms : null;
      })
      .filter((value): value is number => value != null);
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [terminalWorkers]);
  const terminalActivePositions = terminalSnapshot?.operatorSummary.activePositions ?? status?.positionTracker.active ?? 0;
  const workers = status?.workers ?? [];
  const blockerSummary = useMemo(() => buildBlockerSummary(workers, windowMs(opsWindow)), [workers, opsWindow]);
  const executionFunnel = useMemo<StageMetric[]>(() => {
    const candidateCount = workers.filter((worker) => worker.candidateDirection != null).length;
    const committedCount = workers.filter((worker) =>
      worker.lastCommittedCandidateAt != null &&
      inOpsWindow(String(worker.lastCommittedCandidateAt), opsWindow)
    ).length;
    const submittedCount =
      countMatches(opsRecentEvents, /submitting live order|order request submitted/i) +
      countMatches(opsLogLines, /submitting live order|order request submitted/i);
    const acceptedCount = opsTrades.length;
    const settledCount = opsTrades.filter((trade) => trade.outcome === "win" || trade.outcome === "loss").length;

    return [
      { label: "Orderable", value: blockerSummary.orderableCount, tone: blockerSummary.orderableCount > 0 ? "green" : "amber", sub: "workers with valid asks" },
      { label: "Candidate", value: candidateCount, tone: candidateCount > 0 ? "blue" : "amber", sub: "workers with a candidate side" },
      { label: "Committed", value: committedCount, tone: committedCount > 0 ? "green" : "blue", sub: "recent committed candidates" },
      { label: "Submitted", value: submittedCount, tone: submittedCount > 0 ? "green" : "blue", sub: "live submissions seen in logs" },
      { label: "Accepted", value: acceptedCount, tone: acceptedCount > 0 ? "green" : "blue", sub: "persisted live trade rows" },
      { label: "Filled", value: opsFills.length, tone: opsFills.length > 0 ? "green" : "blue", sub: "fills created in window" },
      { label: "Matched", value: opsFills.filter((fill) => !!fill.paper_trade_id).length, tone: opsFills.some((fill) => !!fill.paper_trade_id) ? "green" : "amber", sub: "fills linked to trades" },
      { label: "Settled", value: settledCount, tone: settledCount > 0 ? "green" : "blue", sub: "resolved live trades in window" },
    ];
  }, [workers, blockerSummary.orderableCount, opsRecentEvents, opsLogLines, opsFills, opsTrades, opsWindow]);
  const anomalySummary = useMemo<StageMetric[]>(() => {
    const rejectedOrders = countMatches(opsRecentEvents, /rejected|invalid_order/i) + countMatches(opsLogLines, /rejected|invalid_order/i);
    const dataWarnings = countMatches(opsRecentEvents, /market_data_unavailable|top[- ]of[- ]book|missing ask|crypto_unavailable/i)
      + countMatches(opsLogLines, /market_data_unavailable|top[- ]of[- ]book|missing ask|crypto_unavailable/i);
    const reconciliationWarnings = countMatches(opsRecentEvents, /reconcil/i) + countMatches(opsLogLines, /reconcil/i);
    const oneSidedBooks = workers.filter(isOneSidedBook).length;

    return [
      { label: "Stale Quotes", value: workers.filter((worker) => (worker.cryptoPriceAgeMs ?? 0) > ALERT_THRESHOLDS.criticalQuoteAgeMs).length, tone: workers.some((worker) => (worker.cryptoPriceAgeMs ?? 0) > ALERT_THRESHOLDS.criticalQuoteAgeMs) ? "red" : "green", sub: `workers above ${ALERT_THRESHOLDS.criticalQuoteAgeMs / 1000}s quote age` },
      { label: "Rejected Orders", value: rejectedOrders, tone: rejectedOrders > 0 ? "red" : "green", sub: "recent accepts vs rejects risk" },
      { label: "Data Warnings", value: dataWarnings, tone: dataWarnings > 0 ? "amber" : "green", sub: "crypto or market-data incidents" },
      { label: "One-sided Books", value: oneSidedBooks, tone: oneSidedBooks > 0 ? "amber" : "green", sub: "extreme top-of-book structure" },
      { label: "Fallback Sources", value: workers.filter((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker").length, tone: workers.some((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker") ? "amber" : "green", sub: "workers not on ws ticker" },
      { label: "Reconciliation", value: reconciliationWarnings, tone: reconciliationWarnings > 0 ? "amber" : "green", sub: "recent reconcile mentions" },
    ];
  }, [opsRecentEvents, opsLogLines, workers]);
  const opsWindowLabel = opsWindow === "15m" ? "Last 15m" : opsWindow === "1h" ? "Last 1h" : "Last 24h";
  const ledgerWindowLabel =
    ledgerWindow === "today" ? "Today" :
    ledgerWindow === "7d" ? "Last 7d" :
    ledgerWindow === "30d" ? "Last 30d" :
    "All time";
  const escalations = useMemo<Escalation[]>(() => {
    const staleWorkers = workers.filter((worker) => (worker.cryptoPriceAgeMs ?? 0) > ALERT_THRESHOLDS.criticalQuoteAgeMs).length;
    const fallbackWorkers = workers.filter((worker) => worker.marketDataSource && worker.marketDataSource !== "kalshi_ws_ticker").length;
    const oneSidedBooks = workers.filter(isOneSidedBook).length;
    const rejectedOrders = executionEvents.filter((event) => event.stage === "rejected").length;
    const submittedOrders = executionEvents.filter((event) => event.stage === "submitted").length;
    const acceptedOrders = executionEvents.filter((event) => event.stage === "accepted" || event.stage === "settled").length;
    const committedEvents = executionEvents.filter((event) => event.stage === "committed").length;
    const dataWarnings = anomalySummary.find((item) => item.label === "Data Warnings")?.value ?? 0;
    const items: Escalation[] = [];

    if (operator.label === "NO-GO" || operator.label === "CAUTION") {
      items.push({
        kicker: operator.label === "NO-GO" ? "NO-GO" : "CAUTION",
        title: operator.label === "NO-GO" ? "System trust is degraded" : "System trust needs attention",
        detail: operator.reasons.join(" · "),
        tone: operator.tone,
      });
    }
    if (blockerSummary.orderableCount === 0) {
      items.push({
        kicker: "ORDER FLOW",
        title: "No workers are orderable right now",
        detail: "The engine can scan, but none of the workers currently have a trustworthy path to an orderable entry.",
        tone: "red",
      });
    }
    if (staleWorkers > 0) {
      items.push({
        kicker: "QUOTE AGE",
        title: `${staleWorkers} worker${staleWorkers === 1 ? "" : "s"} above ${ALERT_THRESHOLDS.criticalQuoteAgeMs / 1000}s quote age`,
        detail: "Crypto freshness is outside the trust threshold. Treat execution as unsafe until quote ages recover.",
        tone: "red",
      });
    }
    if (rejectedOrders >= ALERT_THRESHOLDS.rejectedOrdersInWindow) {
      items.push({
        kicker: "EXECUTION",
        title: `${rejectedOrders} live order reject${rejectedOrders === 1 ? "" : "s"} in ${opsWindowLabel.toLowerCase()}`,
        detail: "Recent rejections mean the live path is not behaving cleanly. Check the execution drill-down before trusting new submissions.",
        tone: "red",
      });
    }
    if (committedEvents >= ALERT_THRESHOLDS.executionGapCommits && submittedOrders === 0 && (status?.positionTracker.active ?? 0) === 0) {
      items.push({
        kicker: "EXECUTION GAP",
        title: "Committed candidates are not reaching submission",
        detail: `${committedEvents} committed candidate${committedEvents === 1 ? "" : "s"} in ${opsWindowLabel.toLowerCase()} but no order submissions were observed.`,
        tone: "amber",
      });
    }
    if (submittedOrders > 0 && acceptedOrders === 0) {
      items.push({
        kicker: "CONVERSION",
        title: "Submissions are not converting to accepted trades",
        detail: `${submittedOrders} submitted with 0 accepted in ${opsWindowLabel.toLowerCase()}. Check rejects, payload validity, and fill linkage.`,
        tone: "amber",
      });
    }
    if (fallbackWorkers >= ALERT_THRESHOLDS.fallbackWorkers) {
      items.push({
        kicker: "MARKET DATA",
        title: `${fallbackWorkers} worker${fallbackWorkers === 1 ? "" : "s"} on fallback market source`,
        detail: "A fallback source is okay briefly, but it should not be the dominant state for live execution.",
        tone: "amber",
      });
    }
    if (oneSidedBooks >= ALERT_THRESHOLDS.oneSidedBooks) {
      items.push({
        kicker: "BOOK QUALITY",
        title: `${oneSidedBooks} one-sided book${oneSidedBooks === 1 ? "" : "s"} active`,
        detail: "Quotes may technically be orderable while still being operationally fragile. Watch spreads and fake availability.",
        tone: "amber",
      });
    }
    if (dataWarnings >= ALERT_THRESHOLDS.dataWarnings) {
      items.push({
        kicker: "DATA WARN",
        title: `${dataWarnings} market or crypto data warnings in ${opsWindowLabel.toLowerCase()}`,
        detail: "Repeated data warnings are usually the earliest sign that trust is degrading before the top strip flips to NO-GO.",
        tone: "amber",
      });
    }

    return items.slice(0, 3);
  }, [workers, executionEvents, anomalySummary, blockerSummary.orderableCount, operator, opsWindowLabel, status?.positionTracker.active]);
  const terminalOperator = useMemo(() => {
    const label = terminalSnapshot?.operatorSummary.systemTrust ?? operator.label;
    const tone: Tone = label === "GO" ? "green" : label === "CAUTION" ? "amber" : "red";
    return {
      label,
      tone,
      reasons: operator.reasons,
    };
  }, [operator.reasons, operator.label, terminalSnapshot]);
  const terminalOpportunity = useMemo(() => {
    if (!terminalSnapshot) {
      return deriveOpportunityState(terminalOperator, terminalWorkers, terminalBlockerSummary, status?.positionTracker);
    }

    const label = terminalSnapshot.operatorSummary.opportunityState;
    const tone: Tone =
      label === "EXECUTING" ? "green" :
      label === "COMMITTED" ? "blue" :
      label === "SCANNING" ? (terminalOperator.label === "GO" ? "green" : "blue") :
      (terminalOperator.label === "NO-GO" || terminalBlockerSummary.counts.data > 0 ? "red" : "amber");
    const sub =
      label === "EXECUTING"
        ? `${terminalSnapshot.operatorSummary.activePositions}/${status?.positionTracker.max ?? terminalSnapshot.operatorSummary.activePositions} active positions`
        : label === "COMMITTED"
          ? `${terminalBlockerSummary.recentlyCommittedCount} worker${terminalBlockerSummary.recentlyCommittedCount === 1 ? "" : "s"} with recent committed candidates`
          : label === "SCANNING"
            ? `${terminalSnapshot.operatorSummary.orderableWorkers}/${terminalWorkers.length || 0} workers orderable`
            : terminalBlockerSummary.counts.data > 0
              ? `${terminalBlockerSummary.counts.data} data-blocked worker${terminalBlockerSummary.counts.data === 1 ? "" : "s"}`
              : "No orderable workers right now";

    return { label, tone, sub };
  }, [status?.positionTracker, terminalBlockerSummary, terminalOperator, terminalSnapshot, terminalWorkers]);
  const latestWarning = useMemo(
    () => {
      const logWarning = (logs?.logs ?? []).slice().reverse().find((line) => {
        const upper = line.toUpperCase();
        return upper.includes("REJECT") || upper.includes("INVALID_ORDER") || upper.includes("ERROR") || upper.includes("WARN");
      });
      if (logWarning) return logWarning;
      return executionEvents.find((event) => event.stage === "blocked" || event.stage === "rejected")?.message ?? null;
    },
    [logs, executionEvents]
  );
  const terminalLastFillAt = terminalSnapshot?.operatorSummary.lastFillAt ?? fillsSectionSummary?.lastFillAt ?? null;
  const terminalLastWarningAt = terminalSnapshot?.operatorSummary.lastWarningAt ?? null;
  const terminalLastWarningMessage = terminalSnapshot?.operatorSummary.lastWarningMessage ?? latestWarning;
  const settledSample = sampleMeta(fillsSectionSummary?.settledFills, "settled fills");
  const linkedSample = sampleMeta(fillsSectionSummary?.matchedFills, "linked fills");
  const totalFillSample = sampleMeta(fillsSectionSummary?.totalFills, "fills");
  const sessionSettledSample = sampleMeta(sessionSummary?.settledFills, "session settled fills");
  const sessionLinkedSample = sampleMeta(sessionSummary?.matchedFills, "session linked fills");
  const statusBarGroups = useMemo(
    () => [
      {
        title: "System",
        items: [
          { label: "Trust", value: terminalOperator.label, tone: terminalOperator.tone },
          { label: "Opportunity", value: terminalOpportunity.label, tone: terminalOpportunity.tone },
          { label: "Stream", value: terminalBadge.label, tone: terminalBadge.tone },
          { label: "Mode", value: health?.liveTradingEnabled ? "ARMED" : "PAPER", tone: health?.liveTradingEnabled ? "green" as Tone : "amber" as Tone },
        ],
      },
      {
        title: "Market Data",
        items: [
          { label: "Orderable", value: `${terminalBlockerSummary.orderableCount}/${terminalWorkers.length || 0}`, tone: terminalBlockerSummary.orderableCount === terminalWorkers.length && terminalWorkers.length > 0 ? "green" as Tone : "amber" as Tone },
          { label: "Worst Spot Age", value: formatPriceAge(terminalWorstQuoteAge), tone: terminalWorstQuoteAge != null && terminalWorstQuoteAge > ALERT_THRESHOLDS.criticalQuoteAgeMs ? "red" as Tone : terminalWorstQuoteAge != null && terminalWorstQuoteAge > ALERT_THRESHOLDS.warningQuoteAgeMs ? "amber" as Tone : "blue" as Tone },
          { label: "Worst Lag", value: formatLatency(slowestWorkerLag), tone: slowestWorkerLag != null && slowestWorkerLag > ALERT_THRESHOLDS.criticalPricingLagMs ? "red" as Tone : slowestWorkerLag != null && slowestWorkerLag > ALERT_THRESHOLDS.warningPricingLagMs ? "amber" as Tone : "green" as Tone },
          { label: "Fallback", value: String(terminalFallbackWorkers), tone: terminalFallbackWorkers > 0 ? "amber" as Tone : "green" as Tone },
        ],
      },
      {
        title: "Execution",
        items: [
          { label: "Active Pos", value: `${terminalActivePositions}/${status?.positionTracker.max ?? 0}`, tone: terminalActivePositions > 0 ? "green" as Tone : "blue" as Tone },
          { label: "Recent Commit", value: terminalLatestCommitAt ? formatRelativeTime(terminalLatestCommitAt) : "none", tone: terminalLatestCommitAt ? "blue" as Tone : "violet" as Tone },
          { label: "Last Fill", value: terminalLastFillAt ? formatRelativeTime(terminalLastFillAt) : "none", tone: terminalLastFillAt ? "blue" as Tone : "violet" as Tone },
          { label: "Last Warning", value: terminalLastWarningAt ? formatRelativeTime(terminalLastWarningAt) : terminalLastWarningMessage ? "active" : "quiet", tone: terminalLastWarningAt || terminalLastWarningMessage ? "amber" as Tone : "green" as Tone },
        ],
      },
      {
        title: "Session",
        items: [
          { label: "Realized", value: formatCents(sessionSummary?.netPnlCents), tone: sessionSummary != null && sessionSummary.netPnlCents < 0 ? "red" as Tone : "green" as Tone },
          { label: "Pending", value: formatCount(health?.pendingTrades ?? 0), tone: (health?.pendingTrades ?? 0) > 0 ? "amber" as Tone : "green" as Tone },
          { label: "Settled", value: formatCount(health?.settledTrades ?? 0), tone: (health?.settledTrades ?? 0) > 0 ? "blue" as Tone : "violet" as Tone },
          { label: "Analytics", value: summary?.fillsFromDb ? "POSTGRES" : "FALLBACK", tone: summary?.fillsFromDb ? "violet" as Tone : "amber" as Tone },
        ],
      },
    ],
    [
      health?.liveTradingEnabled,
      health?.pendingTrades,
      health?.settledTrades,
      sessionSummary,
      slowestWorkerLag,
      status?.positionTracker.max,
      summary?.fillsFromDb,
      terminalActivePositions,
      terminalBadge.label,
      terminalBadge.tone,
      terminalBlockerSummary.orderableCount,
      terminalFallbackWorkers,
      terminalLastFillAt,
      terminalLastWarningAt,
      terminalLastWarningMessage,
      terminalLatestCommitAt,
      terminalOperator.label,
      terminalOperator.tone,
      terminalOpportunity.label,
      terminalOpportunity.tone,
      terminalWorkers.length,
      terminalWorstQuoteAge,
    ]
  );
  const statusBarFlags = useMemo(
    () => [
      {
        label: terminalPricingHealthy ? "pricing path healthy" : "pricing path degraded",
        tone: terminalPricingHealthy ? "green" as Tone : "amber" as Tone,
      },
      {
        label: `${terminalFragileBooks} fragile book${terminalFragileBooks === 1 ? "" : "s"}`,
        tone: terminalFragileBooks > 0 ? "amber" as Tone : "blue" as Tone,
      },
      {
        label: `${terminalStaleQuotes} stale quote worker${terminalStaleQuotes === 1 ? "" : "s"}`,
        tone: terminalStaleQuotes > 0 ? "red" as Tone : "green" as Tone,
      },
      {
        label: `${terminalFallbackWorkers} fallback worker${terminalFallbackWorkers === 1 ? "" : "s"}`,
        tone: terminalFallbackWorkers > 0 ? "amber" as Tone : "blue" as Tone,
      },
    ],
    [terminalFallbackWorkers, terminalFragileBooks, terminalPricingHealthy, terminalStaleQuotes]
  );
  const gateRows = useMemo(
    () => [
      {
        gate: "Orderable",
        count: terminalBlockerSummary.orderableCount,
        impact: "workers with valid asks and a live market path",
        tone: terminalBlockerSummary.orderableCount === terminalWorkers.length && terminalWorkers.length > 0 ? "green" as Tone : "amber" as Tone,
      },
      {
        gate: "Confidence gate",
        count: terminalBlockerSummary.counts.confidence,
        impact: "blocked by confidence threshold",
        tone: terminalBlockerSummary.counts.confidence > 0 ? "amber" as Tone : "green" as Tone,
      },
      {
        gate: "EV gate",
        count: terminalBlockerSummary.counts.ev,
        impact: "blocked by edge / EV threshold",
        tone: terminalBlockerSummary.counts.ev > 0 ? "amber" as Tone : "green" as Tone,
      },
      {
        gate: "Data gate",
        count: terminalBlockerSummary.counts.data,
        impact: "crypto, market, or ask unavailable",
        tone: terminalBlockerSummary.counts.data > 0 ? "red" as Tone : "green" as Tone,
      },
      {
        gate: "Risk gate",
        count: terminalBlockerSummary.counts.risk,
        impact: "cooldown, sizing, or exposure controls",
        tone: terminalBlockerSummary.counts.risk > 0 ? "amber" as Tone : "green" as Tone,
      },
      {
        gate: "Committed",
        count: terminalBlockerSummary.recentlyCommittedCount,
        impact: "workers with a recent committed candidate",
        tone: terminalBlockerSummary.recentlyCommittedCount > 0 ? "blue" as Tone : "gray" as Tone,
      },
    ],
    [terminalBlockerSummary, terminalWorkers.length]
  );
  const anomalyRows = useMemo(
    () =>
      anomalySummary.map((row) => ({
        alert: row.label,
        value: row.value,
        tone: row.tone,
        impact:
          row.label === "Stale Quotes" ? "pricing trust" :
          row.label === "Rejected Orders" ? "execution path" :
          row.label === "Data Warnings" ? "market-data integrity" :
          row.label === "One-sided Books" ? "fake orderability risk" :
          row.label === "Fallback Sources" ? "quote path degradation" :
          "ledger trust",
        sub: row.sub,
      })),
    [anomalySummary]
  );
  const executionStateRows = useMemo(
    () =>
      executionFunnel.map((row) => ({
        stage: row.label,
        value: row.value,
        tone: row.tone,
        sub: row.sub,
      })),
    [executionFunnel]
  );

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 28%), radial-gradient(circle at top right, rgba(139,92,246,0.10), transparent 24%), #0A0B0D",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 lg:px-8 lg:py-8">
        <div className="mb-6">
          <GlobalStatusBar groups={statusBarGroups} flags={statusBarFlags} />
          {terminalOperator.reasons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {terminalOperator.reasons.map((reason) => (
                <span
                  key={reason}
                  className="badge"
                  style={{
                    backgroundColor: terminalOperator.label === "NO-GO" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                    color: terminalOperator.label === "NO-GO" ? "#EF4444" : "#F59E0B",
                  }}
                >
                  {reason}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <StickyEscalations alerts={escalations} />

        <section className="mb-8">
          <SystemHealthTable health={health} status={status} />
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Live Engine"
            title="Tables first, matrix second"
            subtitle="Blockers, execution state, and anomalies are now expressed as dense terminal tables before you drop into per-worker rows."
            actions={
              <FilterChipBar
                value={opsWindow}
                onChange={setOpsWindow}
                options={[
                  { value: "15m", label: "Last 15m" },
                  { value: "1h", label: "Last 1h" },
                  { value: "24h", label: "Last 24h" },
                ]}
              />
            }
          />
          <div className="mb-4">
            <GateSummaryTable rows={gateRows} windowLabel={opsWindowLabel} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] mb-4">
            <ExecutionStateTable rows={executionStateRows} windowLabel={opsWindowLabel} />
            <AnomaliesTable rows={anomalyRows} windowLabel={opsWindowLabel} />
          </div>
          <WorkerMatrix
            workers={terminalWorkers}
            connectionState={terminalConnection}
            changedWorkerUntil={changedWorkerUntil}
            now={terminalClock}
          />
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Execution Path"
            title="Execution drill-down and candidate history"
            subtitle="This is the handoff from strategy to live execution: recent trade rows confirm what was accepted, and the candidate history shows where ideas were blocked, submitted, or rejected."
            actions={
              <FilterChipBar
                value={opsWindow}
                onChange={setOpsWindow}
                options={[
                  { value: "15m", label: "Last 15m" },
                  { value: "1h", label: "Last 1h" },
                  { value: "24h", label: "Last 24h" },
                ]}
              />
            }
          />
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
            <ExecutionDrilldown trades={opsTrades} fills={strategyFills} executionEvents={executionEvents} windowLabel={opsWindowLabel} />
            <CandidateHistoryPanel events={executionEvents} windowLabel={opsWindowLabel} />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Session Performance"
            title="Today’s realized view"
            subtitle="This row answers the live operational question: what has actually happened in the current session, with sample-size honesty carried into every rate."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6 mb-4">
            <MetricCard
              label="Session Net PnL"
              value={formatCents(sessionSummary?.netPnlCents)}
              sub={sessionSummary ? `${formatCount(sessionSummary.settledFills)} settled · ${formatCount(sessionSummary.pendingFills)} pending` : "no fills today"}
              tone={sessionSummary != null && sessionSummary.netPnlCents < 0 ? "red" : "green"}
              icon={<TrendingUp size={14} />}
              badge={sessionSettledSample ? { label: sessionSettledSample.label, tone: sessionSettledSample.tone } : null}
            />
            <MetricCard
              label="Session Win Rate"
              value={formatPercent(sessionWinRate)}
              sub={sessionSummary ? `${formatCount(sessionSummary.winsCount)} wins / ${formatCount(sessionSummary.lossesCount)} losses${sessionSettledSample ? ` · ${sessionSettledSample.detail}` : ""}` : "no settled fills today"}
              tone={sessionWinRate != null && sessionWinRate >= 0.5 ? "green" : "amber"}
              icon={<Target size={14} />}
              badge={sessionSettledSample ? { label: sessionSettledSample.label, tone: sessionSettledSample.tone } : null}
            />
            <MetricCard
              label="Session Match Rate"
              value={formatPercent(sessionMatchRate)}
              sub={sessionSummary ? `${formatCount(sessionSummary.matchedFills)} of ${formatCount(sessionSummary.totalFills)} fills linked${sessionLinkedSample ? ` · ${sessionLinkedSample.detail}` : ""}` : "no fills today"}
              tone={sessionMatchRate != null && sessionMatchRate > 0 ? "blue" : "amber"}
              icon={<Database size={14} />}
              badge={sessionLinkedSample ? { label: sessionLinkedSample.label, tone: sessionLinkedSample.tone } : null}
            />
            <MetricCard
              label="Session Settled"
              value={sessionSummary ? `${formatCount(sessionSummary.settledFills)}` : "0"}
              sub={sessionSummary ? `${formatCount(sessionSummary.totalFills)} total session fills` : "session ledger"}
              tone="violet"
              icon={<Activity size={14} />}
              badge={sessionSettledSample ? { label: sessionSettledSample.label, tone: sessionSettledSample.tone } : null}
            />
            <MetricCard
              label="Live Balance"
              value={formatCurrency(liveBalance?.balanceDollars)}
              sub="authoritative Kalshi balance"
              tone="green"
              icon={<DollarSign size={14} />}
            />
            <MetricCard
              label="Paper Balance"
              value={formatCurrency(paperBalance?.balanceDollars)}
              sub={paperBalance ? `start ${formatCurrency(paperBalance.startingBalanceDollars)}` : "paper ledger"}
              tone="violet"
              icon={<Wallet size={14} />}
            />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Historical Performance"
            title="Longer-horizon ledger context"
            subtitle="This section keeps all-time analytics, decomposition, and balance history together so historical context doesn’t compete with live session decisioning."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-4">
            <MetricCard
              label="Historical Win Rate"
              value={formatPercent(summary?.winRate)}
              sub={`${formatCount(summary?.winsCount)} wins / ${formatCount(summary?.lossesCount)} losses${settledSample ? ` · ${settledSample.detail}` : ""}`}
              tone={summary != null && (summary.winRate ?? 0) >= 0.5 ? "green" : "amber"}
              icon={<Target size={14} />}
              badge={settledSample ? { label: settledSample.label, tone: settledSample.tone } : null}
            />
            <MetricCard
              label="Avg EV"
              value={summary?.avgEvCents != null ? `${summary.avgEvCents >= 0 ? "+" : ""}${summary.avgEvCents.toFixed(1)}c` : "—"}
              sub={`linked fills only${linkedSample ? ` · ${linkedSample.detail}` : ""}`}
              tone="violet"
              icon={<Sparkles size={14} />}
              badge={linkedSample ? { label: linkedSample.label, tone: linkedSample.tone } : null}
            />
            <MetricCard
              label="Avg Confidence"
              value={formatPercent(summary?.avgConfidence)}
              sub={`linked fills only${linkedSample ? ` · ${linkedSample.detail}` : ""}`}
              tone="blue"
              icon={<Shield size={14} />}
              badge={linkedSample ? { label: linkedSample.label, tone: linkedSample.tone } : null}
            />
            <MetricCard
              label="Avg Slippage"
              value={summary?.avgSlippageCents != null ? `${summary.avgSlippageCents >= 0 ? "+" : ""}${summary.avgSlippageCents.toFixed(1)}c` : "—"}
              sub={`fill versus paper entry${linkedSample ? ` · ${linkedSample.detail}` : ""}`}
              tone={summary != null && (summary.avgSlippageCents ?? 0) > 0 ? "amber" : "green"}
              icon={<ArrowUpRight size={14} />}
              badge={linkedSample ? { label: linkedSample.label, tone: linkedSample.tone } : null}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr] mb-4">
            <div className="panel">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Balance Curve</p>
                  <p className="text-sm text-muted">Persisted balance snapshots from the backend ledger</p>
                </div>
                <HeroSignal label={summary?.dataLastUpdated ? formatRelativeTime(summary.dataLastUpdated) : "updating"} tone="blue" />
              </div>
              <RealAccountChart />
            </div>

            <div className="grid gap-4">
              <MetricCard
                label="Historical Net PnL"
                value={formatCents(summary?.netPnlCents)}
                sub="backend analytics"
                tone={summary != null && summary.netPnlCents < 0 ? "red" : "green"}
                icon={<TrendingUp size={14} />}
              />
              <MetricCard
                label="Capital Tracked"
                value={summary ? formatCurrency(summary.totalCapitalUSD) : "—"}
                sub="notional fill capital"
                tone="amber"
                icon={<Database size={14} />}
              />
              <MetricCard
                label="Paper Win Rate"
                value={paperStats ? `${(paperStats.winRate * 100).toFixed(1)}%` : "—"}
                sub={paperStats ? `${paperStats.totalTrades} paper trades` : "paper stats"}
                tone="blue"
                icon={<Activity size={14} />}
              />
              <MetricCard
                label="Latest Ledger Fill"
                value={summary?.lastFillAt ? formatRelativeTime(summary.lastFillAt) : "never"}
                sub={summary?.firstFillAt ? `first ${formatShortTimestamp(summary.firstFillAt)}` : "ledger timeline"}
                tone="violet"
                icon={<Database size={14} />}
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 mb-4">
            <DailyPnlChart analytics={analytics} />
            <div className="grid gap-4">
              <BreakdownTable title="By Asset" rows={analytics?.byAsset ?? {}} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BreakdownTable title="By Regime" rows={analytics?.byRegime ?? {}} />
            <BreakdownTable title="By Side" rows={analytics?.bySide ?? {}} />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Fills & Reconciliation"
            title="Persisted ledger, match rate, and settlement trail"
            subtitle="The fills section stays grounded in the stored fill ledger and the backend’s own reconciliation status rather than browser-side reconstruction."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-4">
            <MetricCard
              label="Net PnL"
              value={formatCents(fillsSectionSummary?.netPnlCents)}
              sub={fillsSectionSummary ? `${formatCents(fillsSectionSummary.grossPnlCents)} gross less ${formatCents(fillsSectionSummary.estimatedFeeCents)} fees` : "settled ledger PnL"}
              tone={fillsSectionSummary != null && fillsSectionSummary.netPnlCents < 0 ? "red" : "green"}
              icon={<TrendingUp size={14} />}
            />
            <MetricCard
              label="Match Rate"
              value={formatPercent(fillsMatchRate)}
              sub={fillsSectionSummary ? `${formatCount(fillsSectionSummary.matchedFills)} of ${formatCount(fillsSectionSummary.totalFills)} fills linked to trades${totalFillSample ? ` · ${totalFillSample.detail}` : ""}` : "trade linkage"}
              tone={fillsMatchRate != null && fillsMatchRate > 0 ? "blue" : "amber"}
              icon={<Database size={14} />}
              badge={totalFillSample ? { label: totalFillSample.label, tone: totalFillSample.tone } : null}
            />
            <MetricCard
              label="Settlement Trail"
              value={fillsSectionSummary ? `${formatCount(fillsSectionSummary.settledFills)} settled` : "—"}
              sub={fillsSectionSummary ? `${formatCount(fillsSectionSummary.winsCount)} wins / ${formatCount(fillsSectionSummary.lossesCount)} losses · ${formatPercent(fillsSettledRate)} settled${settledSample ? ` · ${settledSample.detail}` : ""}` : "reconciliation status"}
              tone={fillsSectionSummary != null && fillsSectionSummary.pendingFills > 0 ? "amber" : "green"}
              icon={<Activity size={14} />}
              badge={settledSample ? { label: settledSample.label, tone: settledSample.tone } : null}
            />
            <MetricCard
              label="Ledger Source"
              value={fillsSectionSummary?.fillsFromDb ? "Postgres" : "Fallback"}
              sub={
                fillsSectionSummary?.lastFillAt
                  ? `${ledgerWindowLabel} · ${formatRelativeTime(fillsSectionSummary.lastFillAt)} latest${fillsSectionSummary.firstFillAt ? ` · first ${formatShortTimestamp(fillsSectionSummary.firstFillAt)}` : ""}`
                  : "awaiting fills"
              }
              tone={fillsSectionSummary?.fillsFromDb ? "green" : "amber"}
              icon={<Shield size={14} />}
            />
          </div>

          {fillsSectionSummary != null && fillsSectionSummary.matchedFills === 0 ? (
            <div
              className="panel mb-4 text-sm text-muted"
              style={{ background: "linear-gradient(180deg, rgba(15,17,23,0.95), rgba(15,17,23,0.78))" }}
            >
              Match rate is currently zero because the backend has no linked trade rows for these fills yet. The ledger PnL above is still based on settled fill economics, not browser-side guesswork.
            </div>
          ) : null}

          <RecentFillsPanel
            fills={ledgerFills}
            window={ledgerWindow}
            onWindowChange={setLedgerWindow}
            windowLabel={ledgerWindowLabel}
          />
        </section>

        <section>
          <SectionHeading
            kicker="Recent Events"
            title="Operational tail for fast diagnosis"
            subtitle="Recent engine events from `/status` sit next to the warning tail from `/logs` so operator issues are visible without opening a second screen."
            actions={
              <FilterChipBar
                value={opsWindow}
                onChange={setOpsWindow}
                options={[
                  { value: "15m", label: "Last 15m" },
                  { value: "1h", label: "Last 1h" },
                  { value: "24h", label: "Last 24h" },
                ]}
              />
            }
          />
          <RecentEventsRail events={opsRecentEvents} logs={opsLogLines} windowLabel={opsWindowLabel} />
        </section>
      </div>
    </main>
  );
}
