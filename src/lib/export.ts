import type { Trade, DashboardStats } from "./types";

const TRADE_COLUMNS = [
  "trade_id","timestamp_entry","timestamp_exit","asset","direction","contract_id",
  "strike","expiry_time","spot_price","ask_yes","bid_yes","contract_mid","spread",
  "minutes_to_expiry","p_model","sigma_ewma_ann","sigma_ewma_1min","ev_yes","ev_no",
  "ev_entered","d2_base","jump_weight_n1","moneyness","kelly_raw","position_pct",
  "contracts_bought","cost_basis","bankroll_at_entry","outcome","spot_at_expiry",
  "resolved_price","pnl_gross","pnl_net","fee_paid","bankroll_after",
  "brier_contribution","ev_realized","ev_error","vol_regime","moneyness_bucket",
  "tags","notes",
] as const;

function csvQuote(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportTradeLog(trades: Trade[]): void {
  const header = TRADE_COLUMNS.join(",");
  const rows = trades.map(t =>
    TRADE_COLUMNS.map(col => csvQuote((t as unknown as Record<string, unknown>)[col])).join(",")
  );
  downloadCsv([header, ...rows].join("\n"), `POK_Capital_TradeLog_${todayStr()}.csv`);
}

export function exportStatsSummary(stats: DashboardStats): void {
  const lines: string[] = [
    "POK Capital — Strategy Stats Summary",
    `Generated,${todayStr()}`,
    "",
    "PORTFOLIO OVERVIEW",
    `Total P&L,$${stats.totalPnl.toFixed(2)}`,
    `Win Rate,${(stats.winRate * 100).toFixed(1)}%`,
    `Win Rate (L50),${(stats.winRateLast50 * 100).toFixed(1)}%`,
    `Total Trades,${stats.totalTrades}`,
    `Open Positions,${stats.openPositions}`,
    `Bankroll,$${stats.bankroll.toFixed(2)}`,
    `Sharpe Ratio,${stats.sharpeRatio.toFixed(3)}`,
    `Max Drawdown (All-Time),$${stats.maxDrawdownAllTime.toFixed(2)}`,
    `Max Drawdown (Current),$${stats.maxDrawdownCurrent.toFixed(2)}`,
    `Brier Score,${stats.brierScore.toFixed(4)}`,
    `Avg EV Entered,${stats.avgEvEntered.toFixed(4)}`,
    `Avg EV Realized,${stats.avgEvRealized.toFixed(4)}`,
    "",
    "PER-ASSET BREAKDOWN",
    "Asset,Trades,Wins,Losses,Win%,Net P&L,Avg EV,Avg Spread,Avg σ_EWMA,Brier,YES,NO",
    ...stats.perAsset.map(a =>
      [a.asset, a.trades, a.wins, a.losses,
       (a.winRate*100).toFixed(1)+"%",
       "$"+a.netPnl.toFixed(2),
       a.avgEvEntered.toFixed(4),
       a.avgSpread.toFixed(4),
       a.avgSigmaEwmaAnn.toFixed(3),
       a.brierScore.toFixed(4),
       a.yesCount, a.noCount].join(",")
    ),
    "",
    "VOL REGIME BREAKDOWN",
    "Regime,Trades,Win%,Net P&L,Avg EV Entered,Avg EV Realized,Brier",
    ...stats.volRegimeTable.map(r =>
      [r.label, r.trades, (r.winRate*100).toFixed(1)+"%",
       "$"+r.netPnl.toFixed(2), r.avgEvEntered.toFixed(4),
       r.avgEvRealized.toFixed(4), r.brierScore.toFixed(4)].join(",")
    ),
    "",
    "MONEYNESS BREAKDOWN",
    "Bucket,Trades,Win%,Net P&L,Avg EV Entered,Avg EV Realized,Brier",
    ...stats.moneynessTable.map(r =>
      [r.label, r.trades, (r.winRate*100).toFixed(1)+"%",
       "$"+r.netPnl.toFixed(2), r.avgEvEntered.toFixed(4),
       r.avgEvRealized.toFixed(4), r.brierScore.toFixed(4)].join(",")
    ),
  ];
  downloadCsv(lines.join("\n"), `POK_Capital_Stats_${todayStr()}.csv`);
}
