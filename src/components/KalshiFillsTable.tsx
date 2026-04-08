"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { getFills, getTrades, getMarketPrice, deriveOutcome, derivePnlUSD, type KalshiFill, type Trade, type KalshiMarketPrice } from "@/lib/api";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertCircle,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeFilter = "1h" | "1d" | "7d" | "30d" | "all";
type StatusFilter = "all" | "win" | "loss" | "pending" | "error";
type ViewMode = "active" | "hidden";

interface EnrichedFill extends KalshiFill {
  resolvedAsset: string;
  fillPrice: number;
  paperTrade: Trade | null;
  slippage: number | null;
  capitalUSD: number;
  totalEV: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_FILTERS: { label: string; value: TimeFilter }[] = [
  { label: "1H", value: "1h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "7d" },
  { label: "1M", value: "30d" },
  { label: "All", value: "all" },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Win", value: "win" },
  { label: "Loss", value: "loss" },
  { label: "Pending", value: "pending" },
  { label: "Error", value: "error" },
];

const V = "#8B5CF6";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterCutoff(filter: TimeFilter): number {
  const now = Date.now();
  if (filter === "1h") return now - 3_600_000;
  if (filter === "1d") return now - 86_400_000;
  if (filter === "7d") return now - 7 * 86_400_000;
  if (filter === "30d") return now - 30 * 86_400_000;
  return 0;
}

function tickerToAsset(ticker: string): string {
  const m = ticker.match(/^KX([A-Z]+)\d/);
  return m ? m[1] : ticker.split("-")[0];
}

function fmtUSD(dollars: number): string {
  return dollars >= 0
    ? `+$${dollars.toFixed(2)}`
    : `-$${Math.abs(dollars).toFixed(2)}`;
}

// ─── Badge components ─────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  // H-25: 'error' means Kalshi settlement data is unavailable for a fill
  // that should be settled by now — it is NOT a loss. Previously error
  // rendered with the same red badge as an actual loss, so ops couldn't
  // tell them apart. Give it its own amber/orange styling.
  const cls =
    outcome === "win"
      ? "badge badge-green"
      : outcome === "loss"
      ? "badge badge-red"
      : outcome === "error"
      ? "badge badge-amber"
      : "badge badge-yellow";
  return <span className={cls}>{outcome === "error" ? "ERROR" : outcome}</span>;
}

function DirectionBadge({ dir }: { dir: string }) {
  return (
    <span className={dir === "yes" ? "badge badge-blue" : "badge badge-gray"}>
      {dir.toUpperCase()}
    </span>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const cls =
    regime === "R1"
      ? "badge badge-green"
      : regime === "R2"
      ? "badge badge-blue"
      : "badge badge-red";
  return <span className={cls}>{regime}</span>;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportToCsv(fills: EnrichedFill[], timeFilter: string) {
  const headers = [
    "Fill ID", "Order ID", "Time", "Asset", "Ticker",
    "Side", "Fill Price (¢)", "Model Entry (¢)", "Slippage (¢)",
    "Contracts", "Capital ($)", "Model P (%)", "EV/contract (¢)",
    "Total EV (¢)", "Confidence (%)", "Regime", "Status",
    "Outcome PNL ($)", "ROI (%)", "Action", "Taker",
  ];
  const rows = fills.map((f) => [
    f.trade_id,
    f.order_id,
    new Date(f.created_time).toISOString(),
    f.resolvedAsset,
    f.ticker,
    f.side.toUpperCase(),
    f.fillPrice,
    f.paperTrade?.entryPrice ?? "",
    f.slippage ?? "",
    f.count,
    f.capitalUSD.toFixed(2),
    f.paperTrade ? (f.paperTrade.modelProbability * 100).toFixed(2) : "",
    f.paperTrade ? f.paperTrade.ev.toFixed(2) : "",
    f.totalEV !== null ? f.totalEV.toFixed(2) : "",
    f.paperTrade ? f.paperTrade.confidence.toFixed(1) : "",
    f.paperTrade?.regime ?? "",
    "",  // outcome derived from Kalshi at display time, not pre-computed
    "",  // PnL derived from Kalshi at display time, not pre-computed
    "",  // ROI derived from Kalshi at display time, not pre-computed
    f.action,
    f.is_taker ? "yes" : "no",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kalshi_fills_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Checkbox column ──────────────────────────────────────────────────────────

const checkboxColumn: ColumnDef<EnrichedFill> = {
  id: "select",
  enableSorting: false,
  header: ({ table }) => (
    <input
      type="checkbox"
      className="accent-violet-500 cursor-pointer"
      checked={table.getIsAllPageRowsSelected()}
      ref={(el) => {
        if (el) el.indeterminate = table.getIsSomePageRowsSelected();
      }}
      onChange={table.getToggleAllPageRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <input
      type="checkbox"
      className="accent-violet-500 cursor-pointer"
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
};

// ─── Data columns ─────────────────────────────────────────────────────────────

const dataColumns: ColumnDef<EnrichedFill>[] = [
  {
    accessorKey: "created_time",
    header: "Time",
    cell: (info) => {
      const ts = new Date(info.getValue<string>());
      return (
        <div className="flex flex-col">
          <span className="text-xs text-text font-mono">{ts.toLocaleTimeString()}</span>
          <span className="text-xs text-muted">{ts.toLocaleDateString()}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "resolvedAsset",
    header: "Asset",
    cell: (info) => (
      <span className="font-semibold text-text">{info.getValue<string>()}</span>
    ),
  },
  // NOTE: status / outcomePnl / roi columns are defined inside the component
  // so they can close over `marketPrices`. They are injected via the `columns` useMemo.
  {
    accessorKey: "side",
    header: "Side",
    cell: (info) => <DirectionBadge dir={info.getValue<string>()} />,
  },
  {
    id: "regime",
    header: "Regime",
    accessorFn: (row) => row.paperTrade?.regime ?? null,
    cell: (info) => {
      const regime = info.getValue<string | null>();
      if (!regime) return <span className="text-muted">—</span>;
      return <RegimeBadge regime={regime} />;
    },
  },
  {
    accessorKey: "fillPrice",
    header: "Fill Price",
    cell: (info) => (
      <span className="font-mono text-sm" style={{ color: V }}>
        {info.getValue<number>()}¢
      </span>
    ),
  },
  {
    id: "modelEntry",
    header: "Model Entry",
    accessorFn: (row) => row.paperTrade?.entryPrice ?? null,
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      return <span className="font-mono text-sm text-muted">{v}¢</span>;
    },
  },
  {
    accessorKey: "slippage",
    header: "Slippage",
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      const color = v > 0 ? "text-loss" : v < 0 ? "text-profit" : "text-muted";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v}¢
        </span>
      );
    },
  },
  {
    accessorKey: "count",
    header: "Qty",
    cell: (info) => (
      <span className="font-mono text-sm font-semibold">{info.getValue<number>()}</span>
    ),
  },
  {
    accessorKey: "capitalUSD",
    header: "Capital",
    cell: (info) => (
      <span className="font-mono text-sm">${info.getValue<number>().toFixed(2)}</span>
    ),
  },
  {
    id: "modelP",
    header: "Model P",
    accessorFn: (row) => row.paperTrade?.modelProbability ?? null,
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      return <span className="font-mono text-sm text-accent">{(v * 100).toFixed(1)}%</span>;
    },
  },
  {
    id: "evPerContract",
    header: "EV/ct",
    accessorFn: (row) => row.paperTrade?.ev ?? null,
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      const color = v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(1)}¢
        </span>
      );
    },
  },
  {
    accessorKey: "totalEV",
    header: "Total EV",
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      const color = v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(1)}¢
        </span>
      );
    },
  },
  {
    id: "confidence",
    header: "Conf",
    accessorFn: (row) => row.paperTrade?.confidence ?? null,
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      return <span className="font-mono text-sm">{v.toFixed(0)}%</span>;
    },
  },
  // NOTE: outcomePnl and roi columns are defined inside the component (see `columns` useMemo)
];

// ─── Live market price hook ───────────────────────────────────────────────────

function useMarketPrices(tickers: string[]): Map<string, KalshiMarketPrice> {
  const key = tickers.length
    ? `market-prices:${Array.from(tickers).sort().join(",")}`
    : null;
  const { data } = useSWR<Map<string, KalshiMarketPrice>>(
    key,
    async () => {
      const pairs = await Promise.all(
        tickers.map((t) => getMarketPrice(t).then((p) => [t, p] as const))
      );
      return new Map(
        pairs.filter((pair): pair is [string, KalshiMarketPrice] => pair[1] !== null)
      );
    },
    { refreshInterval: 5_000, revalidateOnFocus: false }
  );
  return data ?? new Map();
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  hiddenIds: Set<string>;
  setHiddenIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function KalshiFillsTable({ hiddenIds, setHiddenIds }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [minEVInput, setMinEVInput] = useState("");
  const [minEVCents, setMinEVCents] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_time", desc: true },
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Debounce EV filter input
  useEffect(() => {
    const t = setTimeout(() => {
      const v = parseFloat(minEVInput);
      setMinEVCents(isNaN(v) ? null : v);
    }, 300);
    return () => clearTimeout(t);
  }, [minEVInput]);

  const { data: fills, error: fillsError, isLoading } = useSWR<KalshiFill[]>(
    "kalshi-fills",
    getFills,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const { data: trades, error: tradesError } = useSWR<Trade[]>(
    "trades-pnl",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const enrichedFills = useMemo((): EnrichedFill[] => {
    const byOrderId = new Map<string, Trade>(
      (trades ?? [])
        .filter((t): t is Trade & { orderId: string } => t.isLive === true && !!t.orderId)
        .map((t) => [t.orderId, t])
    );
    return (fills ?? []).map((fill): EnrichedFill => {
      const fillPrice = fill.side === "yes" ? fill.yes_price : fill.no_price;
      const pt = byOrderId.get(fill.order_id) ?? null;
      const totalEV = pt !== null ? pt.ev * fill.count : null;
      return {
        ...fill,
        resolvedAsset: pt?.asset ?? tickerToAsset(fill.ticker),
        fillPrice,
        paperTrade: pt,
        slippage: pt !== null ? fillPrice - pt.entryPrice : null,
        capitalUSD: (fillPrice * fill.count) / 100,
        totalEV,
      };
    });
  }, [fills, trades]);

  // Fetch Kalshi market data for ALL fill tickers so we can derive authoritative outcomes
  // Must be declared before filteredFills (which uses deriveOutcome via marketPrices)
  const allTickers = useMemo(
    () => Array.from(new Set(enrichedFills.map((f) => f.ticker))),
    [enrichedFills]
  );
  const marketPrices = useMarketPrices(allTickers);

  const filteredFills = useMemo((): EnrichedFill[] => {
    const cutoff = filterCutoff(timeFilter);
    return enrichedFills.filter((f) => {
      // View mode gate
      if (viewMode === "active" && hiddenIds.has(f.trade_id)) return false;
      if (viewMode === "hidden" && !hiddenIds.has(f.trade_id)) return false;
      // Time filter
      if (new Date(f.created_time).getTime() < cutoff) return false;
      // Status filter — use Kalshi-derived outcome, not paper store
      if (statusFilter !== "all") {
        const outcome = deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.paperTrade?.outcome);
        if (outcome !== statusFilter) return false;
      }
      // Asset search
      if (assetSearch) {
        const q = assetSearch.toLowerCase();
        if (
          !f.resolvedAsset.toLowerCase().includes(q) &&
          !f.ticker.toLowerCase().includes(q) &&
          !f.order_id.toLowerCase().includes(q)
        )
          return false;
      }
      // EV filter
      if (minEVCents !== null) {
        if (!f.paperTrade || f.paperTrade.ev < minEVCents) return false;
      }
      return true;
    });
  }, [enrichedFills, timeFilter, statusFilter, assetSearch, minEVCents, viewMode, hiddenIds, marketPrices]);

  // Columns that need marketPrices closure are defined here (not in module-level dataColumns)
  const statusColumn: ColumnDef<EnrichedFill> = {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const f = row.original;
      return <OutcomeBadge outcome={deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.paperTrade?.outcome)} />;
    },
  };

  const outcomePnlColumn: ColumnDef<EnrichedFill> = {
    id: "outcomePnl",
    header: "Outcome PNL",
    cell: ({ row }) => {
      const f = row.original;
      const outcome = deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.paperTrade?.outcome);
      const pnlUSD = derivePnlUSD(f.fillPrice, f.count, outcome);
      if (pnlUSD !== null) {
        return (
          <span className={`font-mono text-sm font-semibold ${pnlUSD >= 0 ? "text-profit" : "text-loss"}`}>
            {fmtUSD(pnlUSD)}
          </span>
        );
      }
      if (outcome === "error") return <span className="font-mono text-sm text-loss">ERROR</span>;
      if (f.totalEV !== null) {
        return <span className="font-mono text-sm italic text-muted">~${(f.totalEV / 100).toFixed(2)}</span>;
      }
      return <span className="text-muted">—</span>;
    },
  };

  const roiColumn: ColumnDef<EnrichedFill> = {
    id: "roi",
    header: "ROI",
    cell: ({ row }) => {
      const f = row.original;
      const outcome = deriveOutcome(f.side, f.created_time, marketPrices.get(f.ticker), f.paperTrade?.outcome);
      const pnlUSD = derivePnlUSD(f.fillPrice, f.count, outcome);
      if (pnlUSD === null || f.capitalUSD === 0) return <span className="text-muted">—</span>;
      const roi = (pnlUSD / f.capitalUSD) * 100;
      return (
        <span className={`font-mono text-sm ${roi >= 0 ? "text-profit" : "text-loss"}`}>
          {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
        </span>
      );
    },
  };

  const liveOddsColumn: ColumnDef<EnrichedFill> = {
    id: "liveOdds",
    header: "Live Odds",
    enableSorting: false,
    cell: ({ row }) => {
      const fill = row.original;
      const outcome = deriveOutcome(fill.side, fill.created_time, marketPrices.get(fill.ticker), fill.paperTrade?.outcome);
      if (outcome !== "pending") return <span className="text-muted">—</span>;
      const mp = marketPrices.get(fill.ticker);
      if (!mp) return <span className="text-muted animate-pulse text-xs">…</span>;
      const noBid = 100 - mp.yes_ask;
      const noAsk = 100 - mp.yes_bid;
      return (
        <div className="flex flex-col gap-0.5 font-mono text-xs leading-tight">
          <span style={{ color: V }}>Y {mp.yes_bid}–{mp.yes_ask}¢</span>
          <span className="text-muted">N {noBid}–{noAsk}¢</span>
        </div>
      );
    },
  };

  const columns = useMemo<ColumnDef<EnrichedFill>[]>(
    () => [checkboxColumn, statusColumn, ...dataColumns, outcomePnlColumn, roiColumn, liveOddsColumn],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketPrices]
  );

  const table = useReactTable({
    data: filteredFills,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.trade_id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const matchedCount = enrichedFills.filter((f) => f.paperTrade !== null).length;
  const selectedCount = Object.keys(rowSelection).length;

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    setRowSelection({});
  }

  function hideSelected() {
    setHiddenIds((prev) => new Set([...Array.from(prev), ...Object.keys(rowSelection)]));
    setRowSelection({});
  }

  function unhideSelected() {
    const toRemove = new Set(Object.keys(rowSelection));
    setHiddenIds((prev) => new Set(Array.from(prev).filter((id) => !toRemove.has(id))));
    setRowSelection({});
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {/* Left: label + view toggle */}
        <div className="flex items-center gap-2">
          <p className="section-label" style={{ marginBottom: 0 }}>
            Fill History
          </p>
          <div className="flex gap-1">
            {(["active", "hidden"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => switchView(mode)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === mode ? "text-white" : "text-muted hover:text-text"
                }`}
                style={viewMode === mode ? { backgroundColor: V } : {}}
              >
                {mode === "active" ? "Active" : "Hidden"}
              </button>
            ))}
          </div>
        </div>

        {/* Right: filters + bulk action + CSV */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Select All / Deselect All */}
          <button
            onClick={() => table.toggleAllRowsSelected(!table.getIsAllRowsSelected())}
            className="px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-accent transition-colors"
          >
            {table.getIsAllRowsSelected() ? "Deselect All" : `Select All (${filteredFills.length})`}
          </button>
          {/* Bulk action */}
          {selectedCount > 0 && (
            <button
              onClick={viewMode === "active" ? hideSelected : unhideSelected}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-accent transition-colors"
            >
              {viewMode === "active" ? <EyeOff size={11} /> : <Eye size={11} />}
              {viewMode === "active"
                ? `Hide ${selectedCount}`
                : `Unhide ${selectedCount}`}
            </button>
          )}
          {/* Asset search */}
          <input
            type="text"
            placeholder="Search asset..."
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            className="px-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent"
          />
          {/* Min EV */}
          <input
            type="number"
            placeholder="Min EV (¢)"
            value={minEVInput}
            onChange={(e) => setMinEVInput(e.target.value)}
            className="px-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent w-24"
          />
          {/* Model context warning */}
          {tradesError && (
            <span className="flex items-center gap-1 text-xs text-loss">
              <AlertCircle size={11} />
              Model context unavailable
            </span>
          )}
          {/* Status filter */}
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === f.value ? "text-white" : "text-muted hover:text-text"
                }`}
                style={statusFilter === f.value ? { backgroundColor: V } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Time filter */}
          <div className="flex gap-1">
            {TIME_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTimeFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeFilter === f.value ? "text-white" : "text-muted hover:text-text"
                }`}
                style={timeFilter === f.value ? { backgroundColor: V } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* CSV export */}
          <button
            onClick={() => exportToCsv(filteredFills, timeFilter)}
            disabled={filteredFills.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={11} />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="panel p-0 overflow-hidden">
        {fillsError && (
          <div className="flex items-center gap-2 text-loss text-sm p-4">
            <AlertCircle size={14} />
            Failed to load fills — check Kalshi credentials on Railway
          </div>
        )}

        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-panel" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-border">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          onClick={
                            header.column.getCanSort()
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                          className={`px-3 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider select-none whitespace-nowrap ${
                            header.column.getCanSort()
                              ? "cursor-pointer hover:text-text"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {header.column.getCanSort() && (
                              header.column.getIsSorted() === "asc" ? (
                                <ChevronUp size={12} className="text-accent" />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ChevronDown size={12} className="text-accent" />
                              ) : (
                                <ChevronsUpDown size={12} className="opacity-30" />
                              )
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="text-center text-muted py-10 text-sm"
                      >
                        {viewMode === "hidden"
                          ? "No hidden fills — hide rows from the Active view"
                          : "No fills found — try adjusting filters or wait for trades to settle"}
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={`border-b border-border hover:bg-white/5 transition-colors ${
                          i % 2 === 0 ? "" : "bg-white/[0.02]"
                        } ${row.getIsSelected() ? "bg-violet-500/5" : ""}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted">
              <span>
                {filteredFills.length} fill{filteredFills.length !== 1 ? "s" : ""}
                {viewMode === "active" && hiddenIds.size > 0 && (
                  <span className="ml-1.5 text-muted">· {hiddenIds.size} hidden</span>
                )}
                {viewMode === "active" && matchedCount > 0 && (
                  <span className="ml-1.5" style={{ color: V }}>
                    · {matchedCount} with model context
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 rounded hover:text-text disabled:opacity-30"
                >
                  Prev
                </button>
                <span>
                  {table.getState().pagination.pageIndex + 1} /{" "}
                  {Math.max(table.getPageCount(), 1)}
                </span>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 rounded hover:text-text disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
