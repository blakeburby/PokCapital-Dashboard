"use client";

import { useState, useMemo } from "react";
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
import { getFills, type KalshiFill } from "@/lib/api";
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle, Download } from "lucide-react";

type Filter = "1h" | "1d" | "7d" | "30d" | "all";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "1H", value: "1h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "7d" },
  { label: "1M", value: "30d" },
  { label: "All", value: "all" },
];

function filterCutoff(filter: Filter): number {
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

function exportToCsv(fills: KalshiFill[], filter: string) {
  const headers = [
    "Fill ID", "Order ID", "Time", "Market", "Side",
    "Fill Price (¢)", "Contracts", "Action", "Taker",
  ];
  const rows = fills.map((f) => [
    f.trade_id,
    f.order_id,
    new Date(f.created_time).toISOString(),
    f.ticker,
    f.side.toUpperCase(),
    f.side === "yes" ? f.yes_price : f.no_price,
    f.count,
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
  a.download = `kalshi_fills_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const columns: ColumnDef<KalshiFill>[] = [
  {
    accessorKey: "created_time",
    header: "Time",
    cell: (info) => {
      const ts = new Date(info.getValue<string>());
      return (
        <div className="flex flex-col">
          <span className="text-xs text-text font-mono">
            {ts.toLocaleTimeString()}
          </span>
          <span className="text-xs text-muted">
            {ts.toLocaleDateString()}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "ticker",
    header: "Market",
    cell: (info) => {
      const ticker = info.getValue<string>();
      return (
        <div className="flex flex-col">
          <span className="font-semibold text-text">{tickerToAsset(ticker)}</span>
          <span className="text-xs text-muted font-mono">{ticker.split("-")[0]}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "side",
    header: "Side",
    cell: (info) => {
      const side = info.getValue<string>();
      return (
        <span className={side === "yes" ? "badge badge-blue" : "badge badge-gray"}>
          {side.toUpperCase()}
        </span>
      );
    },
  },
  {
    id: "fillPrice",
    header: "Fill Price",
    cell: (info) => {
      const fill = info.row.original;
      const price = fill.side === "yes" ? fill.yes_price : fill.no_price;
      return (
        <span className="font-mono text-sm" style={{ color: "#8B5CF6" }}>
          {price}¢
        </span>
      );
    },
  },
  {
    accessorKey: "count",
    header: "Contracts",
    cell: (info) => (
      <span className="font-mono text-sm font-semibold">
        {info.getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: (info) => (
      <span className="text-xs text-muted uppercase font-mono">
        {info.getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "order_id",
    header: "Order ID",
    cell: (info) => {
      const id = info.getValue<string>();
      return (
        <span className="font-mono text-xs text-muted" title={id}>
          {id.slice(0, 8)}…
        </span>
      );
    },
  },
];

export default function KalshiFillsTable() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_time", desc: true },
  ]);

  const { data: fills, error, isLoading } = useSWR<KalshiFill[]>(
    "kalshi-fills",
    getFills,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const filteredFills = useMemo(() => {
    if (!fills) return [];
    const cutoff = filterCutoff(filter);
    return fills.filter((f) => {
      const inTime = new Date(f.created_time).getTime() >= cutoff;
      const inSearch =
        !search ||
        tickerToAsset(f.ticker).toLowerCase().includes(search.toLowerCase()) ||
        f.ticker.toLowerCase().includes(search.toLowerCase()) ||
        f.order_id.toLowerCase().includes(search.toLowerCase());
      return inTime && inSearch;
    });
  }, [fills, filter, search]);

  const table = useReactTable({
    data: filteredFills,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Fill History
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search market..."
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
                    ? "text-white"
                    : "text-muted hover:text-text"
                }`}
                style={filter === f.value ? { backgroundColor: "#8B5CF6" } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportToCsv(filteredFills, filter)}
            disabled={filteredFills.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={11} />
            CSV
          </button>
        </div>
      </div>

      <div className="panel p-0 overflow-hidden">
        {error && (
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
                        No fills found — orders may still be resting or no trades placed yet
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

            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted">
              <span>
                {filteredFills.length} fill{filteredFills.length !== 1 ? "s" : ""}
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
