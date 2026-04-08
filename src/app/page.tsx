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
  getAnalytics,
  getBalance,
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
  return `${(value * 100).toFixed(1)}%`;
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

function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US");
}

type Tone = "green" | "amber" | "red" | "blue" | "violet";

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

function fillPrice(fill: KalshiFill): number {
  if (fill.fill_price != null) return fill.fill_price;
  return String(fill.side).toLowerCase() === "yes" ? fill.yes_price : fill.no_price;
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
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const palette = toneValue(tone);
  return (
    <div
      className="panel flex flex-col gap-1 min-w-0"
      style={{ background: "linear-gradient(180deg, rgba(15,17,23,0.95), rgba(15,17,23,0.78))" }}
    >
      <div className="flex items-center gap-2">
        {icon ? <span style={{ color: palette.color }}>{icon}</span> : null}
        <span className="section-label" style={{ marginBottom: 0 }}>{label}</span>
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
                <th className="py-2 font-medium">Fills</th>
                <th className="py-2 font-medium">Win Rate</th>
                <th className="py-2 font-medium">Gross PnL</th>
                <th className="py-2 font-medium">Avg EV</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, row]) => (
                <tr key={key} className="border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                  <td className="py-2 font-medium text-text">{key}</td>
                  <td className="py-2 font-mono text-muted">{formatCount(row.fills)}</td>
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

function RecentFillsPanel({ fills }: { fills: KalshiFill[] | undefined }) {
  const rows = useMemo(
    () => [...(fills ?? [])]
      .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
      .slice(0, 10),
    [fills]
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Recent Fills</p>
          <p className="text-sm text-muted">Persisted ledger rows from the backend fill store</p>
        </div>
        <HeroSignal label={`${rows.length} shown`} tone="violet" />
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
                const netPnl = fill.pnl_net_cents ?? null;
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
                    <td className="py-2 font-mono text-text">{fillPrice(fill)}c</td>
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
                <HeroSignal label={`Operator ${operator.label}`} tone={operator.tone} />
                <HeroSignal label={health?.liveTradingEnabled ? "Live trading armed" : "Paper mode"} tone={health?.liveTradingEnabled ? "green" : "amber"} />
                <HeroSignal label={summary?.fillsFromDb ? "Postgres analytics" : "Fallback analytics"} tone="violet" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-text mb-3">
                Hybrid backend dashboard for trading operations and real PnL
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-2xl">
                This view is now anchored to the backend’s own health, worker snapshots, and Postgres-backed fill analytics.
                It is designed to answer the live question fast: is the engine healthy enough to trust, and how is the ledger actually performing?
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0 xl:min-w-[34rem]">
              <MetricCard
                label="Net PnL"
                value={formatCents(summary?.netPnlCents)}
                sub="backend analytics"
                tone={summary != null && summary.netPnlCents < 0 ? "red" : "green"}
                icon={<TrendingUp size={14} />}
              />
              <MetricCard
                label="Live Balance"
                value={formatCurrency(liveBalance?.balanceDollars)}
                sub="Kalshi balance"
                tone="blue"
                icon={<Wallet size={14} />}
              />
              <MetricCard
                label="Matched Fills"
                value={formatCount(summary?.matchedFills)}
                sub={`${formatCount(summary?.totalFills)} total fills`}
                tone="violet"
                icon={<Database size={14} />}
              />
              <MetricCard
                label="Price Freshness"
                value={formatPriceAge(slowestWorkerAge)}
                sub={fastestWorkerAge != null ? `best ${formatPriceAge(fastestWorkerAge)}` : "waiting for worker prices"}
                tone={slowestWorkerAge != null && slowestWorkerAge > 6_000 ? "red" : "blue"}
                icon={<Waves size={14} />}
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
            title="Worker readiness and operator gates"
            subtitle="This strip condenses the current worker state into quick operational signals without hiding the reasons behind a blocked engine."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(status?.workers ?? []).map((worker) => (
              <div
                key={worker.assetKey}
                className="panel"
                style={{
                  background: "linear-gradient(180deg, rgba(15,17,23,0.95), rgba(15,17,23,0.78))",
                  borderColor:
                    worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000
                      ? "rgba(239,68,68,0.24)"
                      : "rgba(26,31,46,1)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="section-label" style={{ marginBottom: 4 }}>{worker.assetKey.toUpperCase()}</p>
                    <p className="font-mono text-lg text-text font-semibold">
                      {worker.currentPrice != null ? `$${worker.currentPrice.toLocaleString()}` : "No spot"}
                    </p>
                    <p className="text-xs text-muted truncate">{worker.marketTicker ?? "No market ticker"}</p>
                  </div>
                  <HeroSignal
                    label={worker.enginePhase ?? "idle"}
                    tone={worker.noTradeReason ? "amber" : "green"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted">Confidence</p>
                    <p className="font-mono text-text">{formatPercent(worker.confidence)}</p>
                  </div>
                  <div>
                    <p className="text-muted">EV</p>
                    <p className="font-mono text-text">
                      {worker.currentEV != null ? `${worker.currentEV >= 0 ? "+" : ""}${worker.currentEV.toFixed(1)}c` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Regime</p>
                    <p className="font-mono text-text">{worker.regime ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted">Price age</p>
                    <p className="font-mono" style={{ color: worker.cryptoPriceAgeMs != null && worker.cryptoPriceAgeMs > 6_000 ? "#EF4444" : "#E2E8F0" }}>
                      {formatPriceAge(worker.cryptoPriceAgeMs)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(2,6,23,0.42)" }}>
                  <p className="text-xs text-muted mb-1">No-trade reason</p>
                  <p className="text-sm text-text">
                    {worker.noTradeReason ?? "Entry path clear; worker is waiting for a valid committed setup"}
                  </p>
                </div>
              </div>
            ))}
            {(status?.workers.length ?? 0) === 0 ? (
              <div className="panel md:col-span-2 xl:col-span-4 text-sm text-muted">
                Worker snapshots have not loaded yet. Once `/status` responds, this section will show per-asset readiness and trade blockers.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mb-8">
          <SectionHeading
            kicker="Performance & Balance"
            title="Backend-native portfolio view"
            subtitle="Primary financial metrics now come from `/analytics`, with live and paper balances displayed beside the persisted ledger curve."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-4">
            <MetricCard
              label="Win Rate"
              value={formatPercent(summary?.winRate)}
              sub={`${formatCount(summary?.winsCount)} wins / ${formatCount(summary?.lossesCount)} losses`}
              tone={summary != null && (summary.winRate ?? 0) >= 0.5 ? "green" : "amber"}
              icon={<Target size={14} />}
            />
            <MetricCard
              label="Avg EV"
              value={summary?.avgEvCents != null ? `${summary.avgEvCents >= 0 ? "+" : ""}${summary.avgEvCents.toFixed(1)}c` : "—"}
              sub="matched fills only"
              tone="violet"
              icon={<Sparkles size={14} />}
            />
            <MetricCard
              label="Avg Confidence"
              value={formatPercent(summary?.avgConfidence)}
              sub="matched fills only"
              tone="blue"
              icon={<Shield size={14} />}
            />
            <MetricCard
              label="Avg Slippage"
              value={summary?.avgSlippageCents != null ? `${summary.avgSlippageCents >= 0 ? "+" : ""}${summary.avgSlippageCents.toFixed(1)}c` : "—"}
              sub="fill versus paper entry"
              tone={summary != null && (summary.avgSlippageCents ?? 0) > 0 ? "amber" : "green"}
              icon={<ArrowUpRight size={14} />}
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
              <MetricCard
                label="Paper Win Rate"
                value={paperStats ? `${(paperStats.winRate * 100).toFixed(1)}%` : "—"}
                sub={paperStats ? `${paperStats.totalTrades} paper trades` : "paper stats"}
                tone="blue"
                icon={<Activity size={14} />}
              />
              <MetricCard
                label="Capital Tracked"
                value={summary ? formatCurrency(summary.totalCapitalUSD) : "—"}
                sub="notional fill capital"
                tone="amber"
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
              label="Total Fills"
              value={formatCount(summary?.totalFills)}
              sub={summary ? `${summary.pendingFills} pending / ${summary.settledFills} settled` : "fill ledger"}
              tone="violet"
              icon={<Database size={14} />}
            />
            <MetricCard
              label="Fees"
              value={formatCents(summary?.estimatedFeeCents)}
              sub="estimated from fills"
              tone="amber"
              icon={<DollarSign size={14} />}
            />
            <MetricCard
              label="Ledger Source"
              value={summary?.fillsFromDb ? "Postgres" : "Fallback"}
              sub={summary?.lastFillAt ? `last fill ${formatRelativeTime(summary.lastFillAt)}` : "awaiting fills"}
              tone={summary?.fillsFromDb ? "green" : "amber"}
              icon={<Shield size={14} />}
            />
            <MetricCard
              label="First / Last Fill"
              value={summary?.firstFillAt ? formatShortTimestamp(summary.firstFillAt) : "—"}
              sub={summary?.lastFillAt ? `latest ${formatShortTimestamp(summary.lastFillAt)}` : "no fill timestamps"}
              tone="blue"
              icon={<Activity size={14} />}
            />
          </div>

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
