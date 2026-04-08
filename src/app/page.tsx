"use client";

import useSWR from "swr";
import { useMemo } from "react";
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
import BackendStatusPanel from "@/components/BackendStatusPanel";
import RealAccountChart from "@/components/RealAccountChart";
import {
  deriveFillNetPnlCents,
  getAnalytics,
  getBalance,
  getFillPriceCents,
  getFills,
  getHealth,
  getLogs,
  getPaperBalance,
  getPaperStats,
  getStatus,
  type AccountBalance,
  type BackendHealth,
  type BackendStatus,
  type BreakdownRow,
  type FillAnalytics,
  type KalshiFill,
  type LogsResponse,
  type PaperBalance,
  type Stats,
} from "@/lib/api";

const REFRESH_MS = 10_000;
const STRATEGY_ASSET_SET = new Set(["BTC", "ETH", "SOL", "XRP"]);

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

function formatPriceAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
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

type Tone = "green" | "amber" | "red" | "blue" | "violet";
type BlockerCategory = "clear" | "confidence" | "ev" | "data" | "risk" | "window" | "other";
type OpportunityState = "BLOCKED" | "SCANNING" | "COMMITTED" | "EXECUTING";

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

function toneValue(tone: Tone): { color: string; background: string } {
  if (tone === "green") return { color: "#22C55E", background: "rgba(34,197,94,0.12)" };
  if (tone === "amber") return { color: "#F59E0B", background: "rgba(245,158,11,0.12)" };
  if (tone === "red") return { color: "#EF4444", background: "rgba(239,68,68,0.12)" };
  if (tone === "blue") return { color: "#38BDF8", background: "rgba(56,189,248,0.12)" };
  return { color: "#8B5CF6", background: "rgba(139,92,246,0.12)" };
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

function formatBook(worker: BackendStatus["workers"][number]): string {
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

function classifyWorkerBlocker(worker: BackendStatus["workers"][number]): BlockerCategory {
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

function sampleMeta(
  n: number | null | undefined,
  unit: string
): { label: string; detail: string; tone: Tone } | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n < 5) return { label: `n=${n}`, detail: `very low ${unit}`, tone: "red" };
  if (n < 20) return { label: `n=${n}`, detail: `provisional ${unit}`, tone: "amber" };
  return { label: `n=${n}`, detail: `${unit}`, tone: "green" };
}

function deriveOperatorState(health: BackendHealth | undefined, status: BackendStatus | null | undefined) {
  const connected = !!health && health.status === "ok";
  const heartbeatStale = !!health?.lastHeartbeatTimestamp &&
    Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
  const logStale = !!health?.lastLogTimestamp &&
    Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;
  const highLatency = (health?.latencyMs ?? 0) > 1_500;
  const workers = status?.workers ?? [];
  const staleWorkers = workers.filter((worker) => worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000);
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
  workers: BackendStatus["workers"],
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

function SectionHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-1 mb-4">
      <span className="section-label">{kicker}</span>
      <div className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted max-w-3xl">{subtitle}</p>
        </div>
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

function WorkerMatrix({ workers }: { workers: BackendStatus["workers"] }) {
  if (workers.length === 0) {
    return (
      <div className="panel text-sm text-muted">
        Worker snapshots have not loaded yet. Once `/status` responds, this section will show per-asset orderability,
        book quality, quote age, and the exact blocker on each asset.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Worker Matrix</p>
          <p className="text-sm text-muted">Fast scan of trust, book quality, and trade blockers per asset</p>
        </div>
        <HeroSignal label={`${workers.length} workers`} tone="blue" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
              <th className="py-2 font-medium">Asset</th>
              <th className="py-2 font-medium">Market</th>
              <th className="py-2 font-medium">TTE</th>
              <th className="py-2 font-medium">Spot</th>
              <th className="py-2 font-medium">Book</th>
              <th className="py-2 font-medium">Age</th>
              <th className="py-2 font-medium">Source</th>
              <th className="py-2 font-medium">EV</th>
              <th className="py-2 font-medium">Confidence</th>
              <th className="py-2 font-medium">Blocker</th>
              <th className="py-2 font-medium">Last commit</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => {
              const blocker = classifyWorkerBlocker(worker);
              const tone: Tone =
                blocker === "clear" ? "green" :
                blocker === "data" ? "red" :
                blocker === "other" ? "amber" :
                "blue";
              const palette = toneValue(tone);

              return (
                <tr
                  key={worker.assetKey}
                  className="border-b align-top"
                  style={{ borderColor: "rgba(148,163,184,0.08)" }}
                >
                  <td className="py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-text">{worker.assetKey.toUpperCase()}</span>
                      <div className="flex flex-wrap gap-1">
                        <span className={worker.hasValidAsk ? "badge badge-green" : "badge badge-amber"}>
                          {worker.hasValidAsk ? "orderable" : "blocked"}
                        </span>
                        <span className="badge badge-gray">{worker.enginePhase ?? "idle"}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-text">{worker.marketTicker ?? "—"}</span>
                      <span className="text-xs text-muted">
                        {worker.lastOrderableAt ? `orderable ${formatRelativeMoment(worker.lastOrderableAt)}` : "never orderable"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 font-mono text-muted">{formatTimeToExpiry(worker.marketCloseTime)}</td>
                  <td className="py-3 font-mono text-text">
                    {worker.currentPrice != null ? `$${worker.currentPrice.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-3 font-mono text-text">{formatBook(worker)}</td>
                  <td className="py-3 font-mono" style={{ color: worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000 ? "#EF4444" : "#E2E8F0" }}>
                    {formatPriceAge(worker.cryptoPriceAgeMs)}
                  </td>
                  <td className="py-3">
                    <span className="badge badge-gray">{formatMarketSource(worker.marketDataSource)}</span>
                  </td>
                  <td className="py-3 font-mono text-text">
                    {worker.currentEV != null ? `${worker.currentEV >= 0 ? "+" : ""}${worker.currentEV.toFixed(1)}c` : "—"}
                  </td>
                  <td className="py-3 font-mono text-text">{formatPercent(worker.confidence)}</td>
                  <td className="py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className="badge"
                        style={{ backgroundColor: palette.background, color: palette.color }}
                      >
                        {blocker}
                      </span>
                      <span className="text-xs text-muted max-w-[18rem]">
                        {worker.noTradeReason ?? "Entry path clear"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    {worker.lastCommittedCandidateAt ? (
                      <span className="badge badge-blue">{formatRelativeMoment(worker.lastCommittedCandidateAt)}</span>
                    ) : (
                      <span className="text-xs text-muted">never</span>
                    )}
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

function RecentFillsPanel({ fills }: { fills: KalshiFill[] | undefined }) {
  const rows = useMemo(
    () => [...(fills ?? [])]
      .filter((fill) => STRATEGY_ASSET_SET.has(assetFromFill(fill).toUpperCase()))
      .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
      .slice(0, 10),
    [fills]
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Recent Fills</p>
          <p className="text-sm text-muted">Strategy ledger rows, with trade profit/loss derived from stored fill economics and settlement outcome</p>
        </div>
        <HeroSignal label={`${rows.length} strategy fills`} tone="violet" />
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted">No fills yet. The ledger table will populate after the first ingested fills.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">Market</th>
                <th className="py-2 font-medium">Side</th>
                <th className="py-2 font-medium">Count</th>
                <th className="py-2 font-medium">Fill</th>
                <th className="py-2 font-medium">Fee</th>
                <th className="py-2 font-medium">Outcome</th>
                <th className="py-2 font-medium">Net PnL</th>
                <th className="py-2 font-medium">Matched</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fill) => {
                const outcome = fill.outcome ?? null;
                const netPnl = outcome
                  ? deriveFillNetPnlCents(fill, outcome)
                  : fill.pnl_net_cents ?? null;
                return (
                  <tr key={fill.trade_id} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                    <td className="py-2 text-muted">{formatShortTimestamp(fill.created_time)}</td>
                    <td className="py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-text">{assetFromFill(fill)}</span>
                        <span className="text-xs text-muted truncate max-w-[14rem]">{fill.ticker}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={String(fill.side).toLowerCase() === "yes" ? "badge badge-green" : "badge badge-red"}>
                        {String(fill.side).toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-muted">{formatCount(fill.count)}</td>
                    <td className="py-2 font-mono text-text">{getFillPriceCents(fill)}c</td>
                    <td className="py-2 font-mono text-muted">
                      {fill.fee_cents != null ? `${fill.fee_cents}c` : "—"}
                    </td>
                    <td className="py-2">
                      {outcome ? (
                        <span className={outcome === "win" ? "badge badge-green" : "badge badge-red"}>
                          {outcome.toUpperCase()}
                        </span>
                      ) : (
                        <span className="badge badge-amber">PENDING</span>
                      )}
                    </td>
                    <td className="py-2 font-mono" style={{ color: (netPnl ?? 0) >= 0 ? "#22C55E" : "#EF4444" }}>
                      {netPnl != null ? formatCents(netPnl) : "—"}
                    </td>
                    <td className="py-2">
                      <span className={fill.paper_trade_id ? "badge badge-blue" : "badge badge-gray"}>
                        {fill.paper_trade_id ? "linked" : "unmatched"}
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

function RecentEventsRail({
  status,
  logs,
}: {
  status: BackendStatus | null | undefined;
  logs: LogsResponse | undefined;
}) {
  const warningLogs = useMemo(
    () => (logs?.logs ?? [])
      .filter((line) => {
        const upper = line.toUpperCase();
        return upper.includes("ERROR") || upper.includes("WARN") || upper.includes("TRADE BLOCKED") || upper.includes("TRADE SKIPPED");
      })
      .slice(-8)
      .reverse(),
    [logs]
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Engine Event Tail</p>
            <p className="text-sm text-muted">Recent trade, fill, and reconciliation activity from `/status`</p>
          </div>
          <HeroSignal label={`${status?.recentEvents.length ?? 0} events`} tone="blue" />
        </div>
        <div className="space-y-2">
          {(status?.recentEvents ?? []).slice(-10).reverse().map((event, index) => (
            <div
              key={`${event}-${index}`}
              className="rounded-xl px-3 py-2 text-xs font-mono"
              style={{ backgroundColor: "rgba(2,6,23,0.45)", border: "1px solid rgba(148,163,184,0.08)" }}
            >
              {event}
            </div>
          ))}
          {(status?.recentEvents.length ?? 0) === 0 ? (
            <div className="text-sm text-muted">No recent engine events yet.</div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Warning Tail</p>
            <p className="text-sm text-muted">Recent warnings and blocked trades from `/logs`</p>
          </div>
          <HeroSignal label={logs?.meta.lastTimestamp ? formatRelativeTime(logs.meta.lastTimestamp) : "no logs"} tone="amber" />
        </div>
        <div className="space-y-2">
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
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data: health } = useSWR<BackendHealth>("backend-health", getHealth, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: status } = useSWR<BackendStatus | null>("backend-status", getStatus, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: analytics } = useSWR<FillAnalytics>("dashboard-analytics", getAnalytics, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: liveBalance } = useSWR<AccountBalance>("kalshi-balance", getBalance, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: paperBalance } = useSWR<PaperBalance>("paper-balance", getPaperBalance, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: paperStats } = useSWR<Stats>("paper-stats", getPaperStats, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: fills } = useSWR<KalshiFill[]>("kalshi-fills", getFills, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });
  const { data: logs } = useSWR<LogsResponse>("backend-logs", getLogs, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });

  const operator = useMemo(() => deriveOperatorState(health, status), [health, status]);
  const summary = analytics?.summary;
  const strategyFills = useMemo(
    () => (fills ?? []).filter((fill) => STRATEGY_ASSET_SET.has(assetFromFill(fill).toUpperCase())),
    [fills]
  );
  const sessionFills = useMemo(
    () => strategyFills.filter((fill) => localDayKey(fill.created_time) === localDayKey(new Date())),
    [strategyFills]
  );
  const fillsSectionSummary = useMemo(() => {
    if (summary) return summary;
    const fallback = summarizeFills(strategyFills);
    if (!fallback) return null;
    return {
      ...fallback,
      fillsFromDb: true,
    };
  }, [strategyFills, summary]);
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
    const ages = (status?.workers ?? [])
      .map((worker) => worker.cryptoPriceAgeMs)
      .filter((age): age is number => age != null);
    if (ages.length === 0) return null;
    return Math.min(...ages);
  }, [status]);
  const slowestWorkerAge = useMemo(() => {
    const ages = (status?.workers ?? [])
      .map((worker) => worker.cryptoPriceAgeMs)
      .filter((age): age is number => age != null);
    if (ages.length === 0) return null;
    return Math.max(...ages);
  }, [status]);
  const workers = status?.workers ?? [];
  const blockerSummary = useMemo(() => {
    const counts: Record<BlockerCategory, number> = {
      clear: 0,
      confidence: 0,
      ev: 0,
      data: 0,
      risk: 0,
      window: 0,
      other: 0,
    };

    for (const worker of workers) {
      counts[classifyWorkerBlocker(worker)] += 1;
    }

    const orderableCount = workers.filter((worker) => worker.hasValidAsk).length;
    const recentlyCommittedCount = workers.filter((worker) => worker.lastCommittedCandidateAt != null).length;

    return { counts, orderableCount, recentlyCommittedCount };
  }, [workers]);
  const opportunity = useMemo(
    () => deriveOpportunityState(operator, workers, blockerSummary, status?.positionTracker),
    [operator, workers, blockerSummary, status?.positionTracker]
  );
  const latestWarning = useMemo(
    () => (logs?.logs ?? []).slice().reverse().find((line) => {
      const upper = line.toUpperCase();
      return upper.includes("REJECT") || upper.includes("INVALID_ORDER") || upper.includes("ERROR") || upper.includes("WARN");
    }) ?? null,
    [logs]
  );
  const settledSample = sampleMeta(fillsSectionSummary?.settledFills, "settled fills");
  const linkedSample = sampleMeta(fillsSectionSummary?.matchedFills, "linked fills");
  const totalFillSample = sampleMeta(fillsSectionSummary?.totalFills, "fills");
  const sessionSettledSample = sampleMeta(sessionSummary?.settledFills, "session settled fills");
  const sessionLinkedSample = sampleMeta(sessionSummary?.matchedFills, "session linked fills");

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 28%), radial-gradient(circle at top right, rgba(139,92,246,0.10), transparent 24%), #0A0B0D",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 lg:px-8 lg:py-8">
        <section
          className="rounded-3xl p-5 md:p-7 mb-6"
          style={{
            background:
              "linear-gradient(140deg, rgba(15,23,42,0.94), rgba(15,17,23,0.96) 52%, rgba(14,165,233,0.08))",
            border: "1px solid rgba(51,65,85,0.7)",
            boxShadow: "0 20px 40px rgba(2,6,23,0.28)",
          }}
        >
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <HeroSignal label={`System ${operator.label}`} tone={operator.tone} />
                <HeroSignal label={`Opportunity ${opportunity.label}`} tone={opportunity.tone} />
                <HeroSignal label={health?.liveTradingEnabled ? "Live trading armed" : "Paper mode"} tone={health?.liveTradingEnabled ? "green" : "amber"} />
                <HeroSignal label={summary?.fillsFromDb ? "Postgres analytics" : "Fallback analytics"} tone="violet" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-text mb-3">
                Live operator console for trust, blockers, and execution readiness
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-2xl">
                The first scan is now intentionally operational: can you trust the engine, is anything orderable, what is blocking trade flow,
                and only then what the ledger says about session and historical performance.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 min-w-0 xl:min-w-[52rem]">
              <MetricCard
                label="System Trust"
                value={operator.label}
                sub={operator.reasons[0] ?? "backend, workers, and logs are healthy"}
                tone={operator.tone}
                icon={<Shield size={14} />}
              />
              <MetricCard
                label="Opportunity State"
                value={opportunity.label}
                sub={opportunity.sub}
                tone={opportunity.tone}
                icon={<Target size={14} />}
              />
              <MetricCard
                label="Orderable Workers"
                value={`${blockerSummary.orderableCount}/${workers.length || 0}`}
                sub={`${blockerSummary.counts.data} data-blocked · ${blockerSummary.counts.ev + blockerSummary.counts.confidence} strategy-gated`}
                tone={blockerSummary.orderableCount === workers.length && workers.length > 0 ? "green" : "amber"}
                icon={<Activity size={14} />}
              />
              <MetricCard
                label="Worst Quote Age"
                value={formatPriceAge(slowestWorkerAge)}
                sub={fastestWorkerAge != null ? `best ${formatPriceAge(fastestWorkerAge)}` : "waiting for worker prices"}
                tone={slowestWorkerAge != null && slowestWorkerAge > 6_000 ? "red" : "blue"}
                icon={<Waves size={14} />}
              />
              <MetricCard
                label="Active Positions"
                value={`${status?.positionTracker.active ?? 0}/${status?.positionTracker.max ?? 0}`}
                sub={health ? `${health.pendingTrades} pending trades · ${health.settledTrades} settled` : "position tracker"}
                tone={(status?.positionTracker.active ?? 0) > 0 ? "green" : "blue"}
                icon={<Wallet size={14} />}
              />
              <MetricCard
                label="Last Fill / Warning"
                value={fillsSectionSummary?.lastFillAt ? formatRelativeTime(fillsSectionSummary.lastFillAt) : "no fills"}
                sub={latestWarning ? latestWarning.slice(0, 88) : "no recent warning or reject"}
                tone={latestWarning ? "amber" : "green"}
                icon={<AlertTriangle size={14} />}
              />
            </div>
          </div>

          {operator.reasons.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {operator.reasons.map((reason) => (
                <span
                  key={reason}
                  className="badge"
                  style={{
                    backgroundColor: operator.label === "NO-GO" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                    color: operator.label === "NO-GO" ? "#EF4444" : "#F59E0B",
                  }}
                >
                  {reason}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="System Health"
            title="Explicit go/no-go visibility"
            subtitle="Backend reachability, worker status, heartbeat freshness, latency, and crypto price age all surface here first."
          />
          <BackendStatusPanel />
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Live Engine"
            title="Blockers first, worker state second"
            subtitle="The summary row tells you what class of problem is dominating. The matrix below makes each worker’s orderability, book quality, and blocker visible in one scan."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 mb-4">
            <MetricCard
              label="Orderable"
              value={`${blockerSummary.orderableCount}/${workers.length || 0}`}
              sub="workers with valid asks"
              tone={blockerSummary.orderableCount === workers.length && workers.length > 0 ? "green" : "amber"}
              icon={<Shield size={14} />}
            />
            <MetricCard
              label="Confidence Gate"
              value={formatCount(blockerSummary.counts.confidence)}
              sub="blocked by confidence threshold"
              tone={blockerSummary.counts.confidence > 0 ? "amber" : "green"}
              icon={<Target size={14} />}
            />
            <MetricCard
              label="EV Gate"
              value={formatCount(blockerSummary.counts.ev)}
              sub="blocked by edge/EV threshold"
              tone={blockerSummary.counts.ev > 0 ? "amber" : "green"}
              icon={<Sparkles size={14} />}
            />
            <MetricCard
              label="Data Gate"
              value={formatCount(blockerSummary.counts.data)}
              sub="crypto, market, or ask unavailable"
              tone={blockerSummary.counts.data > 0 ? "red" : "green"}
              icon={<AlertTriangle size={14} />}
            />
            <MetricCard
              label="Risk Gate"
              value={formatCount(blockerSummary.counts.risk)}
              sub="cooldown, sizing, or exposure controls"
              tone={blockerSummary.counts.risk > 0 ? "amber" : "green"}
              icon={<Shield size={14} />}
            />
            <MetricCard
              label="Committed"
              value={formatCount(blockerSummary.recentlyCommittedCount)}
              sub="workers with a recent committed candidate"
              tone={blockerSummary.recentlyCommittedCount > 0 ? "green" : "blue"}
              icon={<Activity size={14} />}
            />
          </div>
          <WorkerMatrix workers={workers} />
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
                  ? `${formatRelativeTime(fillsSectionSummary.lastFillAt)} latest · ${fillsSectionSummary.firstFillAt ? `first ${formatShortTimestamp(fillsSectionSummary.firstFillAt)}` : "no first fill"}`
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

          <RecentFillsPanel fills={fills} />
        </section>

        <section>
          <SectionHeading
            kicker="Recent Events"
            title="Operational tail for fast diagnosis"
            subtitle="Recent engine events from `/status` sit next to the warning tail from `/logs` so operator issues are visible without opening a second screen."
          />
          <RecentEventsRail status={status} logs={logs} />
        </section>
      </div>
    </main>
  );
}
