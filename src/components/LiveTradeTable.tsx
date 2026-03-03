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
import { getTrades, type Trade } from "@/lib/api";
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
type StatusFilter = "all" | "win" | "loss" | "pending";
type ViewMode = "active" | "hidden";

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
];

const G = "#10B981"; // emerald-500

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterCutoff(filter: TimeFilter): number {
  const now = Date.now();
  if (filter === "1h") return now - 3_600_000;
  if (filter === "1d") return now - 86_400_000;
  if (filter === "7d") return now - 7 * 86_400_000;
  if (filter === "30d") return now - 30 * 86_400_000;
  return 0;
}

function fmtUSD(dollars: number): string {
  return dollars >= 0
    ? `+$${dollars.toFixed(2)}`
    : `-$${Math.abs(dollars).toFixed(2)}`;
}

// ─── Badge components ─────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  const cls =
    outcome === "win"
      ? "badge badge-green"
      : outcome === "loss"
      ? "badge badge-red"
      : "badge badge-yellow";
  return <span className={cls}>{outcome}</span>;
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

function exportToCsv(trades: Trade[], timeFilter: string) {
  const headers = [
    "Trade ID", "Time", "Asset", "Direction", "Regime",
    "Entry Price (¢)", "Model P (%)", "Market P (%)", "EV/ct (¢)",
    "Total EV (¢)", "Confidence (%)", "Qty", "Capital ($)",
    "Outcome", "PNL ($)", "ROI (%)",
  ];
  const rows = trades.map((t) => {
    const qty = t.liveCount ?? t.suggestedSize ?? 1;
    const capitalUSD = (t.entryPrice * qty) / 100;
    const totalEV = t.ev * qty;
    const pnlUSD = t.pnlTotal != null ? t.pnlTotal / 100 : null;
    const roi =
      pnlUSD != null && capitalUSD > 0 ? (pnlUSD / capitalUSD) * 100 : null;
    return [
      t.id,
      new Date(t.entryTimestamp).toISOString(),
      t.asset,
      t.direction,
      t.regime,
      t.entryPrice,
      (t.modelProbability * 100).toFixed(2),
      (t.marketProbability * 100).toFixed(2),
      t.ev.toFixed(2),
      totalEV.toFixed(2),
      t.confidence.toFixed(1),
      qty,
      capitalUSD.toFixed(2),
      t.outcome,
      pnlUSD != null ? pnlUSD.toFixed(2) : "",
      roi != null ? roi.toFixed(1) : "",
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `live_trades_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Checkbox column ──────────────────────────────────────────────────────────

const checkboxColumn: ColumnDef<Trade> = {
  id: "select",
  enableSorting: false,
  header: ({ table }) => (
    <input
      type="checkbox"
      className="cursor-pointer"
      style={{ accentColor: G }}
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
      className="cursor-pointer"
      style={{ accentColor: G }}
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
};

// ─── Data columns ─────────────────────────────────────────────────────────────

const dataColumns: ColumnDef<Trade>[] = [
  {
    accessorKey: "entryTimestamp",
    header: "Time",
    cell: (info) => {
      const ts = new Date(info.getValue<number>());
      const t = info.row.original;
      return (
        <div className="flex flex-col">
          <span className="text-xs text-text font-mono">{ts.toLocaleTimeString()}</span>
          <span className="text-xs text-muted">{ts.toLocaleDateString()}</span>
          {t.closeTime && (
            <span className="text-xs text-muted">
              exp {new Date(t.closeTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "asset",
    header: "Asset",
    cell: (info) => (
      <span className="font-semibold text-text">{info.getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "outcome",
    header: "Status",
    cell: (info) => <OutcomeBadge outcome={info.getValue<string>()} />,
  },
  {
    accessorKey: "direction",
    header: "Side",
    cell: (info) => <DirectionBadge dir={info.getValue<string>()} />,
  },
  {
    accessorKey: "regime",
    header: "Regime",
    cell: (info) => <RegimeBadge regime={info.getValue<string>()} />,
  },
  {
    accessorKey: "entryPrice",
    header: "Entry Price",
    cell: (info) => (
      <span className="font-mono text-sm" style={{ color: G }}>
        {info.getValue<number>()}¢
      </span>
    ),
  },
  {
    accessorKey: "modelProbability",
    header: "Model P",
    cell: (info) => (
      <span className="font-mono text-sm text-accent">
        {(info.getValue<number>() * 100).toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: "marketProbability",
    header: "Market P",
    cell: (info) => (
      <span className="font-mono text-sm text-muted">
        {(info.getValue<number>() * 100).toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: "ev",
    header: "EV/ct",
    cell: (info) => {
      const v = info.getValue<number>();
      const color = v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(1)}¢
        </span>
      );
    },
  },
  {
    id: "totalEV",
    header: "Total EV",
    accessorFn: (row) => {
      const qty = row.liveCount ?? row.suggestedSize ?? 1;
      return row.ev * qty;
    },
    cell: (info) => {
      const v = info.getValue<number>();
      const color = v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(1)}¢
        </span>
      );
    },
  },
  {
    accessorKey: "confidence",
    header: "Conf",
    cell: (info) => (
      <span className="font-mono text-sm">{info.getValue<number>().toFixed(0)}%</span>
    ),
  },
  {
    id: "qty",
    header: "Qty",
    accessorFn: (row) => row.liveCount ?? row.suggestedSize ?? 1,
    cell: (info) => (
      <span className="font-mono text-sm font-semibold">{info.getValue<number>()}</span>
    ),
  },
  {
    id: "capital",
    header: "Capital",
    accessorFn: (row) => {
      const qty = row.liveCount ?? row.suggestedSize ?? 1;
      return (row.entryPrice * qty) / 100;
    },
    cell: (info) => (
      <span className="font-mono text-sm">${info.getValue<number>().toFixed(2)}</span>
    ),
  },
  {
    id: "outcomePnl",
    header: "Outcome PNL",
    accessorFn: (row) =>
      row.pnlTotal != null ? row.pnlTotal / 100 : null,
    cell: (info) => {
      const t = info.row.original;
      if (t.outcome !== "pending" && t.pnlTotal != null) {
        const usd = t.pnlTotal / 100;
        const color = usd >= 0 ? "text-profit" : "text-loss";
        return (
          <span className={`font-mono text-sm font-semibold ${color}`}>
            {fmtUSD(usd)}
          </span>
        );
      }
      // Pending: estimated via EV
      const qty = t.liveCount ?? t.suggestedSize ?? 1;
      const estUSD = (t.ev * qty) / 100;
      return (
        <span className="font-mono text-sm italic text-muted">
          ~${estUSD.toFixed(2)}
        </span>
      );
    },
  },
  {
    id: "roi",
    header: "ROI",
    accessorFn: (row) => {
      if (row.pnlTotal == null || row.outcome === "pending") return null;
      const qty = row.liveCount ?? row.suggestedSize ?? 1;
      const capital = row.entryPrice * qty;
      return capital > 0 ? (row.pnlTotal / capital) * 100 : null;
    },
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      const color = v >= 0 ? "text-profit" : "text-loss";
      return (
        <span className={`font-mono text-sm ${color}`}>
          {v >= 0 ? "+" : ""}{v.toFixed(1)}%
        </span>
      );
    },
  },
];

const allColumns: ColumnDef<Trade>[] = [checkboxColumn, ...dataColumns];

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  hiddenIds: Set<string>;
  setHiddenIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function LiveTradeTable({ hiddenIds, setHiddenIds }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [minEVInput, setMinEVInput] = useState("");
  const [minEVCents, setMinEVCents] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "entryTimestamp", desc: true },
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Debounce EV filter
  useEffect(() => {
    const t = setTimeout(() => {
      const v = parseFloat(minEVInput);
      setMinEVCents(isNaN(v) ? null : v);
    }, 300);
    return () => clearTimeout(t);
  }, [minEVInput]);

  const { data: trades, error, isLoading } = useSWR<Trade[]>(
    "trades-pnl",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const liveTrades = useMemo(
    () => (trades ?? []).filter((t) => t.isLive === true),
    [trades]
  );

  const filteredTrades = useMemo((): Trade[] => {
    const cutoff = filterCutoff(timeFilter);
    return liveTrades.filter((t) => {
      // View mode gate
      if (viewMode === "active" && hiddenIds.has(t.id)) return false;
      if (viewMode === "hidden" && !hiddenIds.has(t.id)) return false;
      // Time filter
      const ts = t.entryTimestamp ?? new Date(t.closeTime).getTime();
      if (ts < cutoff) return false;
      // Status filter
      if (statusFilter !== "all" && t.outcome !== statusFilter) return false;
      // Asset search
      if (assetSearch) {
        const q = assetSearch.toLowerCase();
        if (!t.asset.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q))
          return false;
      }
      // EV filter
      if (minEVCents !== null && t.ev < minEVCents) return false;
      return true;
    });
  }, [liveTrades, timeFilter, statusFilter, assetSearch, minEVCents, viewMode, hiddenIds]);

  const table = useReactTable({
    data: filteredTrades,
    columns: allColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

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
            Live Trade History
          </p>
          <div className="flex gap-1">
            {(["active", "hidden"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => switchView(mode)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === mode ? "text-white" : "text-muted hover:text-text"
                }`}
                style={viewMode === mode ? { backgroundColor: G } : {}}
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
            {table.getIsAllRowsSelected()
              ? "Deselect All"
              : `Select All (${filteredTrades.length})`}
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
          {/* Status filter */}
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === f.value ? "text-white" : "text-muted hover:text-text"
                }`}
                style={statusFilter === f.value ? { backgroundColor: G } : {}}
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
                style={timeFilter === f.value ? { backgroundColor: G } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* CSV export */}
          <button
            onClick={() => exportToCsv(filteredTrades, timeFilter)}
            disabled={filteredTrades.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={11} />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="panel p-0 overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 text-loss text-sm p-4">
            <AlertCircle size={14} />
            Failed to load live trades
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
                        colSpan={allColumns.length}
                        className="text-center text-muted py-10 text-sm"
                      >
                        {viewMode === "hidden"
                          ? "No hidden trades — hide rows from the Active view"
                          : "No live trades found — try adjusting filters"}
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={`border-b border-border hover:bg-white/5 transition-colors ${
                          i % 2 === 0 ? "" : "bg-white/[0.02]"
                        } ${row.getIsSelected() ? "bg-emerald-500/5" : ""}`}
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
                {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
                {viewMode === "active" && hiddenIds.size > 0 && (
                  <span className="ml-1.5 text-muted">· {hiddenIds.size} hidden</span>
                )}
                {viewMode === "active" && liveTrades.length > 0 && (
                  <span className="ml-1.5" style={{ color: G }}>
                    · {liveTrades.length} total live
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
