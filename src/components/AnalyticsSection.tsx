"use client";

/**
 * AnalyticsSection — strategy performance monitor backed by persistent DB.
 *
 * All numbers come from /analytics (SQL aggregations over kalshi_fills table).
 * If fillsFromDb is false the backend fell back to in-memory data; a warning is shown.
 * No metrics are derived client-side — everything is computed in Postgres.
 */

import useSWR from "swr";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  Database,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  DollarSign,
  BarChart2,
  Clock,
} from "lucide-react";
import { getAnalytics, type FillAnalytics, type BreakdownRow } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(cents: number): string {
  const d = cents / 100;
  if (Math.abs(d) < 0.005) return "$0.00";
  return d >= 0 ? `+$${d.toFixed(2)}` : `-$${Math.abs(d).toFixed(2)}`;
}

function fmtPct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function pnlColor(cents: number): string {
  if (cents > 0) return "text-profit";
  if (cents < 0) return "text-loss";
  return "text-text";
}

function winRateColor(rate: number | null): string {
  if (rate === null) return "text-muted";
  if (rate >= 0.55) return "text-profit";
  if (rate >= 0.45) return "text-text";
  return "text-loss";
}

const ASSET_ORDER = ["BTC", "ETH", "SOL", "XRP"];
const REGIME_ORDER = ["R1", "R2", "R3"];
const REGIME_LABELS: Record<string, string> = {
  R1: "R1 — Low Vol",
  R2: "R2 — Med Vol",
  R3: "R3 — High Vol",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="section-label" style={{ color: "rgba(139,92,246,0.8)" }}>
      {children}
    </h3>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="panel flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-semibold font-mono ${color ?? "text-text"}`}>{value}</span>
    </div>
  );
}

/** Compact breakdown table for asset / regime / side rows. */
function BreakdownTable({
  rows,
  order,
  labelMap,
}: {
  rows: Record<string, BreakdownRow>;
  order: string[];
  labelMap?: Record<string, string>;
}) {
  const keys = order.filter((k) => k in rows);
  if (keys.length === 0) {
    return <p className="text-xs text-muted font-mono">No data yet</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-muted text-left border-b border-border">
            <th className="pr-4 py-1.5 font-normal">Asset/Group</th>
            <th className="pr-3 py-1.5 font-normal text-right">Fills</th>
            <th className="pr-3 py-1.5 font-normal text-right">Settled</th>
            <th className="pr-3 py-1.5 font-normal text-right">W / L</th>
            <th className="pr-3 py-1.5 font-normal text-right">Win%</th>
            <th className="pr-3 py-1.5 font-normal text-right">Gross PnL</th>
            <th className="pr-3 py-1.5 font-normal text-right">Avg EV</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const r = rows[k];
            return (
              <tr key={k} className="border-b border-border/40 hover:bg-panel/30 transition-colors">
                <td className="pr-4 py-1.5 text-text font-medium">
                  {labelMap?.[k] ?? k}
                </td>
                <td className="pr-3 py-1.5 text-right text-muted">{r.fills}</td>
                <td className="pr-3 py-1.5 text-right text-muted">{r.settled}</td>
                <td className="pr-3 py-1.5 text-right">
                  <span className="text-profit">{r.wins}</span>
                  <span className="text-muted mx-1">/</span>
                  <span className="text-loss">{r.losses}</span>
                </td>
                <td className={`pr-3 py-1.5 text-right ${winRateColor(r.winRate)}`}>
                  {fmtPct(r.winRate)}
                </td>
                <td className={`pr-3 py-1.5 text-right ${pnlColor(r.grossPnlCents)}`}>
                  {r.settled > 0 ? fmtUSD(r.grossPnlCents) : "—"}
                </td>
                <td className="pr-3 py-1.5 text-right text-muted">
                  {r.avgEvCents != null ? `${Number(r.avgEvCents).toFixed(1)}¢` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Daily PnL bar chart. */
function DailyPnlChart({
  data,
}: {
  data: FillAnalytics["dailyPnl"];
}) {
  const chartData = useMemo(
    () =>
      data.slice(-30).map((d) => ({
        date: d.date.slice(5), // MM-DD
        pnlUSD: d.grossPnlCents / 100,
        fills: d.fills,
        wins: d.wins,
        losses: d.losses,
      })),
    [data]
  );

  if (chartData.length === 0) {
    return <p className="text-xs text-muted font-mono">No daily data yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={38}
        />
        <Tooltip
          contentStyle={{
            background: "#0f1117",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "monospace",
          }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, "PnL"]}
          labelFormatter={(l) => `Date: ${l}`}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <Bar dataKey="pnlUSD" radius={[2, 2, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell
              key={i}
              fill={d.pnlUSD >= 0 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Balance history line chart. */
function BalanceChart({
  data,
}: {
  data: FillAnalytics["balanceHistory"];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ts: new Date(d.timestamp).toLocaleDateString(undefined, {
          month: "numeric",
          day: "numeric",
        }),
        balanceUSD: d.balanceCents / 100,
      })),
    [data]
  );

  if (chartData.length < 2) {
    return (
      <p className="text-xs text-muted font-mono">
        Balance history will appear after the first scheduled snapshot (~30 min after startup).
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="ts"
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "#0f1117",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "monospace",
          }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, "Balance"]}
        />
        <Line
          type="monotone"
          dataKey="balanceUSD"
          stroke="#8B5CF6"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsSection() {
  const { data, error, isLoading } = useSWR<FillAnalytics | null>(
    "analytics",
    getAnalytics,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="panel animate-pulse h-40 flex items-center justify-center">
        <span className="text-xs text-muted font-mono">Loading analytics…</span>
      </div>
    );
  }

  // ── Error / unavailable ───────────────────────────────────────────────────────
  if (error || data === null) {
    return (
      <div
        className="panel flex items-center gap-2 text-xs font-mono"
        style={{ color: "#F59E0B" }}
      >
        <AlertTriangle size={13} />
        Analytics unavailable — backend DB may not be connected.
        {error && <span className="text-muted ml-1">(network error)</span>}
      </div>
    );
  }

  if (!data) return null;

  const { summary, byAsset, byRegime, bySide, dailyPnl, balanceHistory } = data;

  // ── Data quality warnings ─────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (!summary.fillsFromDb) {
    warnings.push("Fill data is from in-memory fallback — DB not connected. History will reset on restart.");
  }
  if (summary.matchedFills === 0 && summary.totalFills > 0) {
    warnings.push("No fills matched to paper trades — regime/EV stats will be empty until fills are linked.");
  }
  if (summary.pendingFills > 0) {
    warnings.push(`${summary.pendingFills} fill(s) pending settlement — win rate and PnL are incomplete.`);
  }
  if (summary.estimatedFeeCents === 0 && summary.winsCount > 0) {
    warnings.push("Kalshi fees not yet captured — net PnL equals gross PnL. Fee column will populate once the fee field appears in the fills API.");
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Warnings ─────────────────────────────────────────────────────────── */}
      {warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2 text-xs px-3 py-2 rounded font-mono"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#F59E0B",
          }}
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {w}
        </div>
      ))}

      {/* ── Summary pills ────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Strategy Summary (Kalshi Fills — Persistent DB)</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
          <StatPill
            label="Total Fills"
            value={String(summary.totalFills)}
            color="text-text"
          />
          <StatPill
            label="Settled"
            value={String(summary.settledFills)}
            color="text-text"
          />
          <StatPill
            label="Win Rate"
            value={fmtPct(summary.winRate)}
            color={winRateColor(summary.winRate)}
          />
          <StatPill
            label="Gross PnL"
            value={fmtUSD(summary.grossPnlCents)}
            color={pnlColor(summary.grossPnlCents)}
          />
          <StatPill
            label="Net PnL (est.)"
            value={
              summary.estimatedFeeCents > 0
                ? fmtUSD(summary.netPnlCents)
                : fmtUSD(summary.grossPnlCents) + "*"
            }
            color={pnlColor(summary.netPnlCents)}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
          <StatPill
            label="Wins"
            value={String(summary.winsCount)}
            color="text-profit"
          />
          <StatPill
            label="Losses"
            value={String(summary.lossesCount)}
            color={summary.lossesCount > 0 ? "text-loss" : "text-text"}
          />
          <StatPill
            label="Pending"
            value={String(summary.pendingFills)}
            color={summary.pendingFills > 0 ? "text-accent" : "text-muted"}
          />
          <StatPill
            label="Capital Deployed"
            value={`$${summary.totalCapitalUSD.toFixed(2)}`}
            color="text-text"
          />
          <StatPill
            label="Avg Fill Price"
            value={`${summary.avgFillPrice.toFixed(0)}¢`}
            color="text-text"
          />
        </div>
      </div>

      {/* ── Model quality pills (only when matched fills exist) ─────────────── */}
      {summary.matchedFills > 0 && (
        <div>
          <SectionLabel>
            Model Quality ({summary.matchedFills}/{summary.totalFills} fills matched to trades)
          </SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
            <StatPill
              label="Avg EV at Entry"
              value={summary.avgEvCents != null ? `${summary.avgEvCents.toFixed(1)}¢` : "—"}
              color={
                summary.avgEvCents != null && summary.avgEvCents > 0
                  ? "text-profit"
                  : "text-muted"
              }
            />
            <StatPill
              label="Avg Confidence"
              value={
                summary.avgConfidence != null
                  ? `${(summary.avgConfidence).toFixed(1)}%`
                  : "—"
              }
              color="text-text"
            />
            <StatPill
              label="Avg Slippage"
              value={
                summary.avgSlippageCents != null
                  ? `${summary.avgSlippageCents > 0 ? "+" : ""}${summary.avgSlippageCents.toFixed(1)}¢`
                  : "—"
              }
              color={
                summary.avgSlippageCents != null
                  ? summary.avgSlippageCents > 2
                    ? "text-loss"
                    : summary.avgSlippageCents < -2
                    ? "text-profit"
                    : "text-muted"
                  : "text-muted"
              }
            />
            <StatPill
              label="Unmatched Fills"
              value={String(summary.totalFills - summary.matchedFills)}
              color={
                summary.totalFills - summary.matchedFills > 0
                  ? "text-accent"
                  : "text-muted"
              }
            />
          </div>
        </div>
      )}

      {/* ── Breakdown tables ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="panel">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={13} className="text-muted" />
            <SectionLabel>By Asset</SectionLabel>
          </div>
          <BreakdownTable rows={byAsset} order={ASSET_ORDER} />
        </div>

        <div className="panel">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-muted" />
            <SectionLabel>By Volatility Regime</SectionLabel>
          </div>
          {Object.keys(byRegime).length > 0 ? (
            <BreakdownTable rows={byRegime} order={REGIME_ORDER} labelMap={REGIME_LABELS} />
          ) : (
            <p className="text-xs text-muted font-mono">
              Regime data appears once fills are matched to paper trades.
            </p>
          )}
        </div>

        <div className="panel">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-muted" />
            <SectionLabel>By Direction (YES vs NO)</SectionLabel>
          </div>
          <BreakdownTable rows={bySide} order={["yes", "no"]} />
        </div>

        <div className="panel">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={13} className="text-muted" />
            <SectionLabel>Daily PnL (last 30 days)</SectionLabel>
          </div>
          <DailyPnlChart data={dailyPnl} />
        </div>

      </div>

      {/* ── Balance history ──────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={13} className="text-muted" />
          <SectionLabel>Account Balance History</SectionLabel>
        </div>
        <BalanceChart data={balanceHistory} />
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-muted opacity-50">
        <span className="flex items-center gap-1">
          <Database size={10} />
          {summary.fillsFromDb ? "Served from persistent Postgres DB" : "In-memory fallback (DB offline)"}
        </span>
        {summary.estimatedFeeCents === 0 && (
          <span>* Fees not yet captured — gross = net until fee field is confirmed in Kalshi fills API</span>
        )}
        {summary.dataLastUpdated && (
          <span className="flex items-center gap-1 ml-auto">
            <Clock size={10} />
            Updated {new Date(summary.dataLastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
