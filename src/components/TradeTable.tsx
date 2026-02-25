"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { getTrades, type Trade } from "@/lib/api";
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle } from "lucide-react";

type Filter = "1h" | "1d" | "7d" | "30d" | "365d" | "all";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "1H", value: "1h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "7d" },
  { label: "1M", value: "30d" },
  { label: "1Y", value: "365d" },
  { label: "All", value: "all" },
];

function filterCutoff(filter: Filter): number {
  const now = Date.now();
  if (filter === "1h") return now - 3600_000;
  if (filter === "1d") return now - 86400_000;
  if (filter === "7d") return now - 7 * 86400_000;
  if (filter === "30d") return now - 30 * 86400_000;
  if (filter === "365d") return now - 365 * 86400_000;
  return 0;
}

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

const columns: ColumnDef<Trade>[] = [
  {
    accessorKey: "closeTime",
    header: "Time",
    cell: (info) => (
      <span className="text-muted text-xs">
        {new Date(info.getValue<string>()).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "asset",
    header: "Asset",
    cell: (info) => (
      <span className="font-semibold text-text">{info.getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "floorStrike",
    header: "Strike",
    cell: (info) => (
      <span className="font-mono text-sm">
        ${info.getValue<number>().toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "regime",
    header: "Regime",
    cell: (info) => <RegimeBadge regime={info.getValue<string>()} />,
  },
  {
    accessorKey: "direction",
    header: "Dir",
    cell: (info) => <DirectionBadge dir={info.getValue<string>()} />,
  },
  {
    accessorKey: "entryPrice",
    header: "Entry",
    cell: (info) => (
      <span className="font-mono text-sm">{info.getValue<number>()}¢</span>
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
    header: "EV",
    cell: (info) => {
      const v = info.getValue<number>();
      return (
        <span
          className={`font-mono text-sm ${v >= 0 ? "text-profit" : "text-loss"}`}
        >
          {v >= 0 ? "+" : ""}
          {v.toFixed(1)}¢
        </span>
      );
    },
  },
  {
    accessorKey: "confidence",
    header: "Conf",
    cell: (info) => (
      <span className="font-mono text-sm">
        {info.getValue<number>().toFixed(0)}%
      </span>
    ),
  },
  {
    accessorKey: "outcome",
    header: "Outcome",
    cell: (info) => <OutcomeBadge outcome={info.getValue<string>()} />,
  },
  {
    accessorKey: "pnlCents",
    header: "PNL",
    cell: (info) => {
      const v = info.getValue<number | null>();
      if (v == null) return <span className="text-muted">—</span>;
      const dollars = v / 100;
      return (
        <span
          className={`font-mono text-sm font-semibold ${
            dollars >= 0 ? "text-profit" : "text-loss"
          }`}
        >
          {dollars >= 0 ? "+" : ""}${dollars.toFixed(2)}
        </span>
      );
    },
  },
];

export default function TradeTable() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "closeTime", desc: true },
  ]);

  const { data: trades, error, isLoading } = useSWR<Trade[]>(
    "trades-table",
    getTrades,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const filteredTrades = useMemo(() => {
    if (!trades) return [];
    const cutoff = filterCutoff(filter);
    return trades.filter((t) => {
      const inTime = new Date(t.closeTime).getTime() >= cutoff;
      const inSearch =
        !search ||
        t.asset.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase());
      return inTime && inSearch;
    });
  }, [trades, filter, search]);

  const table = useReactTable({
    data: filteredTrades,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Trade History
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search asset..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent"
          />
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  filter === f.value
                    ? "bg-accent text-white"
                    : "text-muted hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel p-0 overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 text-loss text-sm p-4">
            <AlertCircle size={14} />
            Failed to load trades
          </div>
        )}

        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted text-sm animate-pulse">
            Loading trades...
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
                          onClick={header.column.getToggleSortingHandler()}
                          className="px-3 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider cursor-pointer select-none hover:text-text whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {header.column.getIsSorted() === "asc" ? (
                              <ChevronUp size={12} className="text-accent" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ChevronDown size={12} className="text-accent" />
                            ) : (
                              <ChevronsUpDown size={12} className="opacity-30" />
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
                        No trades found
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
                          <td
                            key={cell.id}
                            className="px-3 py-2 whitespace-nowrap"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
