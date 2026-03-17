// POK Capital — Trade Dashboard Types

export type VolRegime = "LOW" | "MEDIUM" | "HIGH";
export type MoneynessBucket = "ATM" | "OTM1" | "OTM2" | "DEEP";
export type Outcome = "WIN" | "LOSS" | "OPEN" | "VOID";
export type Asset = "BTC" | "ETH" | "SOL" | "XRP";
export type Direction = "YES" | "NO";

export interface Trade {
  // Identification
  trade_id: number;
  timestamp_entry: string;   // ISO datetime
  timestamp_exit: string | null;
  // Market
  asset: Asset;
  direction: Direction;
  contract_id: string;
  strike: number;
  expiry_time: string;
  // Prices at entry
  spot_price: number;
  ask_yes: number;         // 0–1
  bid_yes: number;         // 0–1
  contract_mid: number;
  spread: number;
  minutes_to_expiry: number;
  // Model outputs
  p_model: number;
  sigma_ewma_ann: number;
  sigma_ewma_1min: number;
  ev_yes: number;
  ev_no: number;
  ev_entered: number;
  d2_base: number;
  jump_weight_n1: number;
  moneyness: number;       // ln(S/K)
  // Position sizing
  kelly_raw: number;
  position_pct: number;
  contracts_bought: number;
  cost_basis: number;
  bankroll_at_entry: number;
  // Outcome
  outcome: Outcome;
  spot_at_expiry: number | null;
  resolved_price: number | null;  // 0 or 1
  pnl_gross: number | null;
  pnl_net: number | null;
  fee_paid: number | null;
  bankroll_after: number | null;
  // Post-hoc analysis
  brier_contribution: number | null;
  ev_realized: number | null;
  ev_error: number | null;
  vol_regime: VolRegime;
  moneyness_bucket: MoneynessBucket;
  // Notes
  tags: string;
  notes: string;
}

export interface AssetStats {
  asset: Asset;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgEvEntered: number;
  avgSpread: number;
  avgSigmaEwmaAnn: number;
  brierScore: number;
  yesCount: number;
  noCount: number;
}

export interface SliceRow {
  label: string;
  trades: number;
  winRate: number;
  netPnl: number;
  avgEvEntered: number;
  avgEvRealized: number;
  brierScore: number;
}

export interface DashboardStats {
  totalPnl: number;
  winRate: number;
  winRateLast50: number;
  totalTrades: number;
  openPositions: number;
  bankroll: number;
  sharpeRatio: number;
  maxDrawdownAllTime: number;
  maxDrawdownCurrent: number;
  brierScore: number;
  avgEvEntered: number;
  avgEvRealized: number;
  perAsset: AssetStats[];
  volRegimeTable: SliceRow[];
  moneynessTable: SliceRow[];
}

export interface EquityCurvePoint {
  t: string;
  label: string;
  pnl: number;
  pnlPct: number;
  wr20: number;
  isDrawdown: boolean;
}

export interface CalibrationBucket {
  bucket: string;
  modelMid: number;
  actualRate: number;
  count: number;
}

export interface RollingEVPoint {
  idx: number;
  label: string;
  avgEntered: number;
  avgRealized: number;
  divergence: number;
}

export interface ModifiedBSResult {
  pModel: number;
  d2Base: number;
  jumpWeightN1: number;
  evYes: number;
  evNo: number;
}
