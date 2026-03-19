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
import { getPaperTrades, type Trade } from "@/lib/api";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertCircle,
  Download,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeFilter = "1h" | "1d" | "7d" | "30d" | "all";
type StatusFilter = "all" | "win" | "loss" | "pending";

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

const A = "#F59E0B"; // amber-500

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
  return <span className={cls}>{outcome.toUpperCase()}</span>;
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
    "ID", "Time", "Asset", "Ticker", "Side", "Regime",
    "Entry Price (¢)", "Qty", "Capital ($)",
    "Model P (%)", "EV/contract (¢)", "Confidence (%)",
    "Status", "PNL (¢)", "ROI (%)",
  ];
  const rows = trades.map((t) => {
    const capitalUSD = (t.entryPrice * (t.liveCount ?? t.suggestedSize)) / 100;
    const qty = t.liveCount ?? t.suggestedSize;
    const pnlUSD = t.pnlTotal != null ? t.pnlTotal / 100 : "";
    const roi = t.pnlTotal != null && capitalUSD > 0
      ? ((t.pnlTotal / 100 / capitalUSD) * 100).toFixed(1)
      : "";
    return [
      t.id,
      new Date(t.entryTimestamp).toISOString(),
      t.asset,
      t.ticker ?? "",
      t.direction.toUpperCase(),
      t.regime,
      t.entryPrice,
      qty,
      capitalUSD.toFixed(2),
      (t.modelProbability * 100).toFixed(2),
      t.ev.toFixed(2),
      t.confidence.toFixed(1),
      t.outcome,
      pnlUSD,
      roi,
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paper_trades_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Table columns ───────────────────────────────────────────────────────────

const columns: ColumnDef<Trade>[] = [
  {
    id: "status",
    header: "Status",
    accessorKey: "outcome",
    cell: (info) => <OutcomeBadge outcome={info.getValue<string>()} />,
  },
  {
    accessorKey: "entryTimestamp",
    header: "Time",
    cell: (info) => {
      const ts = new Date(info.getValue<number>());
      return (
        <div className="flex flex-col">
          <span className="text-xs text-text font-mono">{ts.toLocaleTimeString()}</span>
          <span className="text-xs text-muted">{ts.toLocaleDateString()}</span>
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
      <span className="font-mono text-sm" style={{ color: A }}>
        {info.getValue<number>()}¢
      </span>
    ),
  },
  {
    id: "qty",
    header: "Qty",
    accessorFn: (row) => row.liveCount ?? row.suggestedSize,
    cell: (info) => (
      <span className="font-mono text-sm font-semibold">{info.getValue<number>()}</span>
    ),
  },
  {
    id: "capital",
    header: "Capital",
    accessorFn: (row) => (row.entryPrice * (row.liveCount ?? row.suggestedSize)) / 100,
    cell: (info) => (
      <span className="font-mono text-sm">${info.getValue<number>().toFixed(2)}</span>
    ),
  },
  {
    id: "modelP",
    header: "Model P",
    accessorFn: (row) => row.modelProbability,
    cell: (info) => (
      <span className="font-mono text-sm text-accent">
        {(info.getValue<number>() * 100).toFixed(1)}%
      </span>
    ),
  },
  {
    id: "evPerContract",
    header: "EV/ct",
    accessorFn: (row) => row.ev,
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
    id: "confidence",
    header: "Conf",
    accessorFn: (row) => row.confidence,
    cell: (info) => (
      <span className="font-mono text-sm">{info.getValue<number>().toFixed(0)}%</span>
    ),
  },
  {
    id: "outcomePnl",
    header: "PNL",
    accessorFn: (row) => row.pnlTotal,
    cell: (info) => {
      const cents = info.getValue<number | null>();
      if (cents == null) return <span className="text-muted">—</span>;
      const dollars = cents / 100;
      return (
        <span className={`font-mono text-sm font-semibold ${dollars >= 0 ? "text-profit" : "text-loss"}`}>
          {fmtUSD(dollars)}
        </span>
      );
    },
  },
  {
    id: "roi",
    header: "ROI",
    accessorFn: (row) => {
      if (row.pnlTotal == null) return null;
      const capital = (row.entryPrice * (row.liveCount ?? row.suggestedSize)) / 100;
      return capital > 0 ? (row.pnlTotal / 100 / capital) * 100 : null;
    },
    cell: (info) => {
      const roi = info.getValue<number | null>();
      if (roi == null) return <span className="text-muted">—</span>;
      return (
        <span className={`font-mono text-sm ${roi >= 0 ? "text-profit" : "text-loss"}`}>
          {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
        </span>
      );
    },
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaperFillsTable() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [minEVInput, setMinEVInput] = useState("");
  const [minEVCents, setMinEVCents] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "entryTimestamp", desc: true },
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      const v = parseFloat(minEVInput);
      setMinEVCents(isNaN(v) ? null : v);
    }, 300);
    return () => clearTimeout(t);
  }, [minEVInput]);

  const { data: trades, error, isLoading } = useSWR<Trade[]>(
    "paper-trades-table",
    getPaperTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const filteredTrades = useMemo((): Trade[] => {
    const cutoff = filterCutoff(timeFilter);
    return (trades ?? []).filter((t) => {
      if (t.entryTimestamp < cutoff) return false;
      if (statusFilter !== "all" && t.outcome !== statusFilter) return false;
      if (assetSearch) {
        const q = assetSearch.toLowerCase();
        if (
          !t.asset.toLowerCase().includes(q) &&
          !(t.ticker ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (minEVCents !== null && t.ev < minEVCents) return false;
      return true;
    });
  }, [trades, timeFilter, statusFilter, assetSearch, minEVCents]);

  const table = useReactTable({
    data: filteredTrades,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Paper Fill History
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search asset..."
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            className="px-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            placeholder="Min EV (¢)"
            value={minEVInput}
            onChange={(e) => setMinEVInput(e.target.value)}
            className="px-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent w-24"
          />
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === f.value ? "text-white" : "text-muted hover:text-text"
                }`}
                style={statusFilter === f.value ? { backgroundColor: A } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {TIME_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTimeFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeFilter === f.value ? "text-white" : "text-muted hover:text-text"
                }`}
                style={timeFilter === f.value ? { backgroundColor: A } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
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
            Failed to load paper trades
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
                        No paper trades found — engine will record trades as signals fire
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={`border-b border-border hover:bg-white/5 transition-colors ${
                          i % 2 === 0 ? "" : "bg-white/[0.02]"
                        }`}
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
