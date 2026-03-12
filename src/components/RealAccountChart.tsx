"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  getFills,
  getTrades,
  getBalance,
  getMarketPrice,
  deriveOutcome,
  derivePnlUSD,
  type KalshiFill,
  type Trade,
  type AccountBalance,
  type KalshiMarketPrice,
} from "@/lib/api";
import { buildEnrichedFills } from "@/components/KalshiFillsStats";

const V = "#8B5CF6";

interface ChartPoint {
  time: number;
  value: number;
  label: string;
}

interface ChartResult {
  points: ChartPoint[];
  /** True when implied start balance was negative, indicating external account activity */
  unreliableReconstruction: boolean;
}

// Same pattern as KalshiFillsStats — fetches live market data for all tickers
function useMarketPrices(tickers: string[]): Map<string, KalshiMarketPrice> {
  const key = tickers.length ? `market-prices-chart:${[...tickers].sort().join(",")}` : null;
  const { data } = useSWR<Map<string, KalshiMarketPrice>>(
    key,
    async () => {
      const pairs = await Promise.all(
        tickers.map((t) => getMarketPrice(t).then((p) => [t, p] as const))
      );
      return new Map(pairs.filter((pair): pair is [string, KalshiMarketPrice] => pair[1] !== null));
    },
    { refreshInterval: 5_000, revalidateOnFocus: false }
  );
  return data ?? new Map();
}

function buildChartData(
  fills: KalshiFill[],
  trades: Trade[],
  balanceDollars: number,
  marketPrices: Map<string, KalshiMarketPrice>
): ChartResult {
  const enriched = buildEnrichedFills(fills, trades);

  // Keep only settled fills — determined from live Kalshi market data, not backend pnlTotal
  const settled = enriched
    .filter((f) => {
      const outcome = deriveOutcome(
        f.side,
        f.created_time,
        marketPrices.get(f.ticker),
        f.outcome ?? f.paperTrade?.outcome
      );
      return outcome === "win" || outcome === "loss";
    })
    .sort((a, b) => {
      // Use settledAt if available, fall back to fill creation time
      const tsA = a.paperTrade?.settledAt ?? new Date(a.created_time).getTime();
      const tsB = b.paperTrade?.settledAt ?? new Date(b.created_time).getTime();
      return tsA - tsB;
    });

  if (settled.length === 0) return { points: [], unreliableReconstruction: false };

  // Reconstruct implied starting balance using the same PnL formula as KalshiFillsStats.
  // WARNING: This assumes no deposits, withdrawals, or manual trades occurred.
  const totalRealizedCents = settled.reduce((s, f) => {
    const outcome = deriveOutcome(
      f.side,
      f.created_time,
      marketPrices.get(f.ticker),
      f.outcome ?? f.paperTrade?.outcome
    );
    return s + (derivePnlUSD(f.fillPrice, f.count, outcome, f.pnl_gross_cents) ?? 0) * 100;
  }, 0);
  const rawImpliedStart = balanceDollars - totalRealizedCents / 100;
  // Guard: if implied start is negative, deposits/withdrawals have occurred
  const unreliableReconstruction = rawImpliedStart < 0;
  const impliedStartDollars = Math.max(rawImpliedStart, 0);

  const points: ChartPoint[] = [];
  // Opening point just before first settlement
  const firstTs =
    (settled[0].paperTrade?.settledAt ?? new Date(settled[0].created_time).getTime()) - 1;
  points.push({
    time: firstTs,
    value: parseFloat(impliedStartDollars.toFixed(2)),
    label: new Date(firstTs).toLocaleString(),
  });

  let running = impliedStartDollars;
  for (const f of settled) {
    const outcome = deriveOutcome(
      f.side,
      f.created_time,
      marketPrices.get(f.ticker),
      f.outcome ?? f.paperTrade?.outcome
    );
    running += derivePnlUSD(f.fillPrice, f.count, outcome, f.pnl_gross_cents) ?? 0;
    const ts = f.paperTrade?.settledAt ?? new Date(f.created_time).getTime();
    points.push({
      time: ts,
      value: parseFloat(running.toFixed(2)),
      label: new Date(ts).toLocaleString(),
    });
  }

  return { points, unreliableReconstruction };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const { value, label } = payload[0].payload;
  return (
    <div
      className="panel text-xs"
      style={{ border: "1px solid rgba(139,92,246,0.3)", padding: "6px 10px" }}
    >
      <p className="text-muted mb-0.5">{label}</p>
      <p style={{ color: value >= 0 ? V : "#EF4444" }} className="font-mono font-semibold">
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

export default function RealAccountChart() {
  const { data: fills } = useSWR<KalshiFill[]>("kalshi-fills", getFills, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: trades } = useSWR<Trade[]>("trades-pnl", getTrades, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const { data: balance } = useSWR<AccountBalance>("kalshi-balance", getBalance, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  const allTickers = useMemo(
    () => Array.from(new Set((fills ?? []).map((f) => f.ticker))),
    [fills]
  );
  const marketPrices = useMarketPrices(allTickers);

  const chartResult = useMemo(() => {
    if (!fills || !trades || !balance) return { points: [], unreliableReconstruction: false };
    return buildChartData(fills, trades, balance.balanceDollars, marketPrices);
  }, [fills, trades, balance, marketPrices]);

  const chartData = chartResult.points;

  if (chartData.length < 2) {
    return (
      <div
        className="panel flex items-center justify-center text-muted text-xs"
        style={{ height: 180, border: "1px solid rgba(139,92,246,0.15)" }}
      >
        No settled trades to chart yet
      </div>
    );
  }

  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max((maxVal - minVal) * 0.1, 2);

  return (
    <div>
      {chartResult.unreliableReconstruction && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded mb-2"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#F59E0B",
          }}
        >
          ⚠ Chart reconstruction may be inaccurate — deposits, withdrawals, or missing fills detected
        </div>
      )}
      <div
        className="panel"
        style={{ border: "1px solid rgba(139,92,246,0.15)", padding: "16px 8px 8px" }}
      >
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(139,92,246,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(ts: number) =>
              new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minVal - pad, maxVal + pad]}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={V}
            strokeWidth={2}
            dot={chartData.length <= 20}
            activeDot={{ r: 4, fill: V, stroke: "#0B0F1A", strokeWidth: 2 }}
          />
        </LineChart>
    </ResponsiveContainer>
    <div className="text-[10px] font-mono text-muted opacity-50 mt-1 px-2">
      Assumes no deposits or withdrawals. Gross PnL only.
    </div>
    </div>
    </div>
  );
}

