"use client";

import { useState, useMemo, useCallback } from "react";
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
import type { Trade, Asset, Outcome, VolRegime, MoneynessBucket, Direction } from "@/lib/types";
import { exportTradeLog } from "@/lib/export";

const TEAL = "#00E5CC";
const RED = "#FF3D57";
const AMBER = "#FFB300";
const GRAY = "#6B7280";
const GREEN = "#00E676";

function outcomeColor(o: Outcome) {
  if (o === "WIN") return GREEN;
  if (o === "LOSS") return RED;
  if (o === "OPEN") return AMBER;
  return GRAY;
}
function outcomeBg(o: Outcome) {
  if (o === "WIN") return "rgba(0,230,118,0.06)";
  if (o === "LOSS") return "rgba(255,61,87,0.06)";
  if (o === "OPEN") return "rgba(255,179,0,0.06)";
  return "transparent";
}

function fmt$(n: number | null) {
  if (n === null) return "—";
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}
function fmtNum(n: number | null, dp = 4) {
  if (n === null) return "—";
  return n.toFixed(dp);
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const ASSETS: Asset[] = ["BTC", "ETH", "SOL", "XRP"];
const OUTCOMES: Outcome[] = ["WIN", "LOSS", "OPEN", "VOID"];
const DIRECTIONS: Direction[] = ["YES", "NO"];
const VOL_REGIMES: VolRegime[] = ["LOW", "MEDIUM", "HIGH"];
const MONEYNESS: MoneynessBucket[] = ["ATM", "OTM1", "OTM2", "DEEP"];

/* ── expanded detail row ────────────────────────────────────────── */
function ExpandedRow({ trade }: { trade: Trade }) {
  const fields: [string, string][] = [
    ["contract_id", trade.contract_id],
    ["expiry_time", fmtDate(trade.expiry_time)],
    ["timestamp_exit", trade.timestamp_exit ? fmtDate(trade.timestamp_exit) : "—"],
    ["ask_yes / bid_yes", `${trade.ask_yes.toFixed(3)} / ${trade.bid_yes.toFixed(3)}`],
    ["spread", trade.spread.toFixed(3)],
    ["minutes_to_expiry", String(trade.minutes_to_expiry)],
    ["p_model", fmtNum(trade.p_model)],
    ["sigma_ewma_ann", fmtNum(trade.sigma_ewma_ann, 4)],
    ["sigma_ewma_1min", fmtNum(trade.sigma_ewma_1min, 5)],
    ["ev_yes / ev_no", `${fmtNum(trade.ev_yes)} / ${fmtNum(trade.ev_no)}`],
    ["d2_base", fmtNum(trade.d2_base)],
    ["jump_weight_n1", fmtNum(trade.jump_weight_n1, 5)],
    ["moneyness ln(S/K)", fmtNum(trade.moneyness, 5)],
    ["kelly_raw", fmtNum(trade.kelly_raw, 5)],
    ["position_pct", fmtPct(trade.position_pct)],
    ["contracts_bought", String(trade.contracts_bought)],
    ["cost_basis", `$${trade.cost_basis.toFixed(2)}`],
    ["bankroll_at_entry", `$${trade.bankroll_at_entry.toFixed(2)}`],
    ["bankroll_after", trade.bankroll_after !== null ? `$${trade.bankroll_after.toFixed(2)}` : "—"],
    ["spot_at_expiry", trade.spot_at_expiry !== null ? String(trade.spot_at_expiry) : "—"],
    ["resolved_price", trade.resolved_price !== null ? String(trade.resolved_price) : "—"],
    ["pnl_gross", fmt$(trade.pnl_gross)],
    ["fee_paid", trade.fee_paid !== null ? `$${trade.fee_paid.toFixed(2)}` : "—"],
    ["brier_contribution", fmtNum(trade.brier_contribution, 4)],
    ["ev_realized", fmtNum(trade.ev_realized)],
    ["ev_error", fmtNum(trade.ev_error)],
    ["vol_regime", trade.vol_regime],
    ["moneyness_bucket", trade.moneyness_bucket],
    ["tags", trade.tags || "—"],
    ["notes", trade.notes || "—"],
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "6px 16px",
        padding: "10px 16px 12px 32px",
        background: "rgba(0,229,204,0.03)",
        borderBottom: "1px solid #1A1F2E",
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      {fields.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <span style={{ color: GRAY, minWidth: 140, flexShrink: 0 }}>{k}</span>
          <span style={{ color: "#E2E8F0" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ── filter chip button ─────────────────────────────────────────── */
function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${active ? (color ?? TEAL) : "#1A1F2E"}`,
        background: active ? `${color ?? TEAL}22` : "transparent",
        color: active ? (color ?? TEAL) : GRAY,
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
        cursor: "pointer",
        transition: "all 0.1s",
      }}
    >
      {label}
    </button>
  );
}

/* ── main component ─────────────────────────────────────────────── */
export default function TradeLogTable({
  trades,
  onLogTrade,
  onSettleTrade,
}: {
  trades: Trade[];
  onLogTrade: () => void;
  onSettleTrade: (trade: Trade) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp_entry", desc: true },
  ]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [assetFilter, setAssetFilter] = useState<Set<Asset>>(new Set());
  const [dirFilter, setDirFilter] = useState<Set<Direction>>(new Set());
  const [outcomeFilter, setOutcomeFilter] = useState<Set<Outcome>>(new Set());
  const [volFilter, setVolFilter] = useState<Set<VolRegime>>(new Set());
  const [moneyFilter, setMoneyFilter] = useState<Set<MoneynessBucket>>(new Set());
  const [search, setSearch] = useState("");

  const toggleExpand = useCallback((id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function toggleFilter<T>(set: Set<T>, setFn: (s: Set<T>) => void, val: T) {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setFn(next);
  }

  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (assetFilter.size > 0 && !assetFilter.has(t.asset)) return false;
      if (dirFilter.size > 0 && !dirFilter.has(t.direction)) return false;
      if (outcomeFilter.size > 0 && !outcomeFilter.has(t.outcome)) return false;
      if (volFilter.size > 0 && !volFilter.has(t.vol_regime)) return false;
      if (moneyFilter.size > 0 && !moneyFilter.has(t.moneyness_bucket)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.contract_id.toLowerCase().includes(q) && !t.notes.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [trades, assetFilter, dirFilter, outcomeFilter, volFilter, moneyFilter, search]);

  const columns = useMemo<ColumnDef<Trade>[]>(() => [
    {
      id: "expand",
      header: "",
      size: 28,
      cell: ({ row }) => (
        <button
          onClick={() => toggleExpand(row.original.trade_id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: GRAY, fontSize: 10, padding: "0 4px" }}
        >
          {expandedRows.has(row.original.trade_id) ? "▼" : "▶"}
        </button>
      ),
    },
    {
      accessorKey: "timestamp_entry",
      header: "Entry",
      size: 120,
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: GRAY }}>
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "asset",
      header: "Asset",
      size: 55,
      cell: ({ getValue }) => (
        <span style={{ color: TEAL, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 12 }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "direction",
      header: "Dir",
      size: 45,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return (
          <span style={{
            color: v === "YES" ? GREEN : RED,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
          }}>
            {v}
          </span>
        );
      },
    },
    {
      accessorKey: "strike",
      header: "Strike",
      size: 80,
      cell: ({ getValue, row }) => {
        const v = getValue() as number;
        const asset = row.original.asset;
        const formatted = asset === "XRP" ? v.toFixed(3) : asset === "SOL" ? v.toFixed(1) : v.toLocaleString();
        return <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{formatted}</span>;
      },
    },
    {
      accessorKey: "spot_price",
      header: "Spot",
      size: 80,
      cell: ({ getValue, row }) => {
        const v = getValue() as number;
        const asset = row.original.asset;
        const formatted = asset === "XRP" ? v.toFixed(3) : asset === "SOL" ? v.toFixed(1) : v.toLocaleString();
        return <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: GRAY }}>{formatted}</span>;
      },
    },
    {
      accessorKey: "p_model",
      header: "p_model",
      size: 72,
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TEAL }}>
          {(getValue() as number).toFixed(3)}
        </span>
      ),
    },
    {
      accessorKey: "ev_entered",
      header: "EV",
      size: 65,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: v >= 0.03 ? GREEN : AMBER }}>
            {v >= 0 ? "+" : ""}{v.toFixed(3)}
          </span>
        );
      },
    },
    {
      accessorKey: "sigma_ewma_ann",
      header: "σ_ann",
      size: 65,
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: GRAY }}>
          {(getValue() as number).toFixed(3)}
        </span>
      ),
    },
    {
      accessorKey: "contracts_bought",
      header: "Qty",
      size: 45,
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
          {getValue() as number}
        </span>
      ),
    },
    {
      accessorKey: "cost_basis",
      header: "Cost",
      size: 65,
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: RED }}>
          ${(getValue() as number).toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "outcome",
      header: "Result",
      size: 65,
      cell: ({ getValue }) => {
        const v = getValue() as Outcome;
        return (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            color: outcomeColor(v),
          }}>
            {v}
          </span>
        );
      },
    },
    {
      accessorKey: "pnl_net",
      header: "P&L",
      size: 72,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null) return <span style={{ color: GRAY, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>—</span>;
        return (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: v >= 0 ? GREEN : RED, fontWeight: 600 }}>
            {fmt$(v)}
          </span>
        );
      },
    },
    {
      accessorKey: "brier_contribution",
      header: "Brier",
      size: 65,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null) return <span style={{ color: GRAY, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>—</span>;
        return (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: v < 0.25 ? GREEN : v < 0.35 ? AMBER : RED }}>
            {v.toFixed(4)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      size: 60,
      cell: ({ row }) => {
        if (row.original.outcome !== "OPEN") return null;
        return (
          <button
            onClick={() => onSettleTrade(row.original)}
            style={{
              padding: "2px 7px",
              background: "transparent",
              border: `1px solid ${AMBER}`,
              borderRadius: 3,
              color: AMBER,
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            SETTLE
          </button>
        );
      },
    },
  ], [expandedRows, toggleExpand, onSettleTrade]);

  const table = useReactTable({
    data: filtered,
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
    <div style={{ background: "#0F1117", border: "1px solid #1A1F2E", borderRadius: 8 }}>
      {/* ── header bar ─────────────────────────────────────────── */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #1A1F2E",
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: GRAY, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          TRADE LOG — {filtered.length} / {trades.length}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onLogTrade}
            style={{
              padding: "4px 12px",
              background: TEAL,
              border: "none",
              borderRadius: 4,
              color: "#0A0B0D",
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + LOG TRADE
          </button>
          <button
            onClick={() => exportTradeLog(trades)}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: "1px solid #1A1F2E",
              borderRadius: 4,
              color: GRAY,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* ── filters ─────────────────────────────────────────────── */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #1A1F2E", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {/* asset */}
        {ASSETS.map(a => (
          <FilterChip key={a} label={a} active={assetFilter.has(a)} color={TEAL}
            onClick={() => toggleFilter(assetFilter, setAssetFilter, a)} />
        ))}
        <span style={{ color: "#1A1F2E", margin: "0 2px" }}>|</span>
        {/* direction */}
        {DIRECTIONS.map(d => (
          <FilterChip key={d} label={d} active={dirFilter.has(d)}
            color={d === "YES" ? GREEN : RED}
            onClick={() => toggleFilter(dirFilter, setDirFilter, d)} />
        ))}
        <span style={{ color: "#1A1F2E", margin: "0 2px" }}>|</span>
        {/* outcome */}
        {OUTCOMES.map(o => (
          <FilterChip key={o} label={o} active={outcomeFilter.has(o)}
            color={outcomeColor(o)}
            onClick={() => toggleFilter(outcomeFilter, setOutcomeFilter, o)} />
        ))}
        <span style={{ color: "#1A1F2E", margin: "0 2px" }}>|</span>
        {/* vol regime */}
        {VOL_REGIMES.map(v => (
          <FilterChip key={v} label={v} active={volFilter.has(v)} color={AMBER}
            onClick={() => toggleFilter(volFilter, setVolFilter, v)} />
        ))}
        <span style={{ color: "#1A1F2E", margin: "0 2px" }}>|</span>
        {/* moneyness */}
        {MONEYNESS.map(m => (
          <FilterChip key={m} label={m} active={moneyFilter.has(m)} color={GRAY}
            onClick={() => toggleFilter(moneyFilter, setMoneyFilter, m)} />
        ))}
        {/* search */}
        <input
          placeholder="search contract / notes"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            background: "#141720",
            border: "1px solid #1A1F2E",
            borderRadius: 4,
            color: "#E2E8F0",
            fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
            width: 200,
          }}
        />
      </div>

      {/* ── table ───────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{
                      padding: "6px 8px",
                      textAlign: "left",
                      fontSize: 9,
                      fontFamily: "'IBM Plex Mono', monospace",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: GRAY,
                      borderBottom: "1px solid #1A1F2E",
                      cursor: header.column.getCanSort() ? "pointer" : "default",
                      whiteSpace: "nowrap",
                      width: header.getSize(),
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <>
                <tr
                  key={row.id}
                  onClick={() => toggleExpand(row.original.trade_id)}
                  style={{
                    background: outcomeBg(row.original.outcome),
                    borderBottom: expandedRows.has(row.original.trade_id) ? "none" : "1px solid #1A1F2E",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = outcomeBg(row.original.outcome))}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      onClick={cell.column.id === "actions" ? e => e.stopPropagation() : undefined}
                      style={{ padding: "6px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {expandedRows.has(row.original.trade_id) && (
                  <tr key={`${row.id}-expanded`}>
                    <td colSpan={columns.length} style={{ padding: 0 }}>
                      <ExpandedRow trade={row.original} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: 32, textAlign: "center", color: GRAY, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                >
                  No trades match filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── pagination ──────────────────────────────────────────── */}
      <div style={{
        padding: "8px 16px",
        borderTop: "1px solid #1A1F2E",
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: GRAY }}>
          Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            ["«", () => table.setPageIndex(0)],
            ["‹", () => table.previousPage()],
            ["›", () => table.nextPage()],
            ["»", () => table.setPageIndex(table.getPageCount() - 1)],
          ].map(([label, action], i) => (
            <button
              key={i}
              onClick={action as () => void}
              style={{
                padding: "2px 8px",
                background: "transparent",
                border: "1px solid #1A1F2E",
                borderRadius: 3,
                color: GRAY,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
