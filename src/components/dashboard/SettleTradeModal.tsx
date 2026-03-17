"use client";

import { useState, useEffect } from "react";
import type { Trade, Outcome } from "@/lib/types";

const TEAL = "#00E5CC";
const RED = "#FF3D57";
const AMBER = "#FFB300";
const GRAY = "#6B7280";
const GREEN = "#00E676";
const KALSHI_FEE_RATE = 0.01; // $0.01 per contract

function fmt$(n: number) {
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);
}

function StatLine({ label, value, color = "#E2E8F0" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1A1F2E" }}>
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: GRAY }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

export default function SettleTradeModal({
  trade,
  onClose,
  onSettle,
}: {
  trade: Trade | null;
  onClose: () => void;
  onSettle: (updated: Trade) => void;
}) {
  const [spotStr, setSpotStr] = useState("");

  useEffect(() => {
    if (trade) setSpotStr("");
  }, [trade]);

  if (!trade) return null;

  const spot = parseFloat(spotStr);
  const hasSpot = !isNaN(spot) && spot > 0;

  // Determine outcome: YES wins if spot >= strike; NO wins if spot < strike
  const yesWins = hasSpot ? spot >= trade.strike : null;
  const outcome: Outcome | null = hasSpot
    ? (trade.direction === "YES" ? (yesWins ? "WIN" : "LOSS") : (yesWins ? "LOSS" : "WIN"))
    : null;

  // Resolved price: 1 if YES contract wins (spot >= strike), else 0
  const resolvedPrice = hasSpot ? (yesWins ? 1 : 0) : null;

  // P&L: resolved_price is payout per contract (0 or 1 × $1)
  // Cost was: contracts_bought × ask_yes (YES direction) or contracts_bought × (1 - bid_yes) (NO direction)
  // Payout: contracts_bought × resolved_price (YES) or contracts_bought × (1 - resolved_price) (NO)
  const pnlGross = hasSpot && resolvedPrice !== null
    ? trade.direction === "YES"
      ? trade.contracts_bought * (resolvedPrice - trade.ask_yes)
      : trade.contracts_bought * ((1 - resolvedPrice) - (1 - trade.bid_yes))
    : null;

  const feePaid = hasSpot ? trade.contracts_bought * KALSHI_FEE_RATE : null;
  const pnlNet = pnlGross !== null && feePaid !== null ? pnlGross - feePaid : null;
  const bankrollAfter = pnlNet !== null ? trade.bankroll_at_entry + pnlNet : null;

  // Brier contribution: (p_model - outcome_binary)²
  // outcome_binary = 1 if YES resolved as 1, else 0
  const outcomeBinary = resolvedPrice;
  const brierContribution = outcomeBinary !== null
    ? Math.pow(trade.p_model - outcomeBinary, 2)
    : null;

  // EV realized: actual payout rate vs ask/bid
  const evRealized = hasSpot && resolvedPrice !== null
    ? trade.direction === "YES"
      ? resolvedPrice - trade.ask_yes - KALSHI_FEE_RATE
      : (1 - resolvedPrice) - (1 - trade.bid_yes) - KALSHI_FEE_RATE
    : null;

  const evError = evRealized !== null ? evRealized - trade.ev_entered : null;

  const canSettle = hasSpot && outcome !== null;

  function handleSettle() {
    if (!canSettle || !trade || outcome === null) return;
    const updated: Trade = {
      ...trade,
      timestamp_exit: new Date().toISOString(),
      outcome,
      spot_at_expiry: spot,
      resolved_price: resolvedPrice,
      pnl_gross: pnlGross,
      pnl_net: pnlNet,
      fee_paid: feePaid,
      bankroll_after: bankrollAfter,
      brier_contribution: brierContribution,
      ev_realized: evRealized,
      ev_error: evError,
    };
    onSettle(updated);
    onClose();
  }

  const outcomeColor = outcome === "WIN" ? GREEN : outcome === "LOSS" ? RED : GRAY;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0F1117",
          border: "1px solid #1A1F2E",
          borderRadius: 8,
          width: "100%",
          maxWidth: 440,
          padding: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: AMBER, letterSpacing: "0.1em" }}>
            SETTLE TRADE #{trade.trade_id}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* trade summary */}
        <div style={{ background: "#141720", borderRadius: 6, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: TEAL }}>{trade.asset}</span>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
              color: trade.direction === "YES" ? GREEN : RED,
            }}>{trade.direction}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: GRAY }}>
              strike: <span style={{ color: "#E2E8F0" }}>
                {trade.asset === "XRP" ? trade.strike.toFixed(3) :
                  trade.asset === "SOL" ? trade.strike.toFixed(1) :
                    trade.strike.toLocaleString()}
              </span>
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: GRAY }}>
              entry: <span style={{ color: "#E2E8F0" }}>
                {trade.asset === "XRP" ? trade.spot_price.toFixed(3) :
                  trade.asset === "SOL" ? trade.spot_price.toFixed(1) :
                    trade.spot_price.toLocaleString()}
              </span>
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: GRAY }}>
            {trade.contracts_bought} contracts @ ${trade.ask_yes.toFixed(3)} | cost ${trade.cost_basis.toFixed(2)} | p_model {trade.p_model.toFixed(4)}
          </div>
        </div>

        {/* spot input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: GRAY, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
            Spot Price at Expiry
          </label>
          <input
            type="number"
            value={spotStr}
            onChange={e => setSpotStr(e.target.value)}
            placeholder={trade.asset === "XRP" ? "1.505" : trade.asset === "SOL" ? "95.40" : "74800"}
            autoFocus
            style={{
              width: "100%",
              padding: "7px 10px",
              background: "#141720",
              border: `1px solid ${hasSpot ? (outcome === "WIN" ? GREEN : RED) : "#1A1F2E"}`,
              borderRadius: 4,
              color: "#E2E8F0",
              fontSize: 14,
              fontFamily: "'IBM Plex Mono', monospace",
              outline: "none",
            }}
          />
          {hasSpot && (
            <div style={{ marginTop: 4, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: GRAY }}>
              {spot} {yesWins ? "≥" : "<"} strike {trade.strike} →{" "}
              <span style={{ color: yesWins ? GREEN : RED }}>
                YES {yesWins ? "WINS" : "LOSES"}
              </span>
            </div>
          )}
        </div>

        {/* computed fields */}
        <div style={{ marginBottom: 16 }}>
          <StatLine label="Outcome" value={outcome ?? "—"} color={outcome ? outcomeColor : GRAY} />
          <StatLine label="Resolved Price" value={resolvedPrice !== null ? String(resolvedPrice) : "—"} />
          <StatLine
            label="P&L Gross"
            value={pnlGross !== null ? fmt$(pnlGross) : "—"}
            color={pnlGross !== null ? (pnlGross >= 0 ? GREEN : RED) : GRAY}
          />
          <StatLine label="Fee Paid" value={feePaid !== null ? `$${feePaid.toFixed(2)}` : "—"} color={RED} />
          <StatLine
            label="P&L Net"
            value={pnlNet !== null ? fmt$(pnlNet) : "—"}
            color={pnlNet !== null ? (pnlNet >= 0 ? GREEN : RED) : GRAY}
          />
          <StatLine
            label="Bankroll After"
            value={bankrollAfter !== null ? `$${bankrollAfter.toFixed(2)}` : "—"}
          />
          <StatLine
            label="Brier Contribution"
            value={brierContribution !== null ? brierContribution.toFixed(4) : "—"}
            color={brierContribution !== null ? (brierContribution < 0.25 ? TEAL : brierContribution < 0.35 ? AMBER : RED) : GRAY}
          />
          <StatLine
            label="EV Realized"
            value={evRealized !== null ? (evRealized >= 0 ? "+" : "") + evRealized.toFixed(4) : "—"}
            color={evRealized !== null ? (evRealized > 0 ? GREEN : RED) : GRAY}
          />
          <StatLine
            label="EV Error"
            value={evError !== null ? (evError >= 0 ? "+" : "") + evError.toFixed(4) : "—"}
            color={evError !== null ? (Math.abs(evError) < 0.05 ? TEAL : AMBER) : GRAY}
          />
        </div>

        {/* buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              background: "transparent",
              border: "1px solid #1A1F2E",
              borderRadius: 4,
              color: GRAY,
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSettle}
            disabled={!canSettle}
            style={{
              padding: "6px 20px",
              background: canSettle ? AMBER : "#1A1F2E",
              border: "none",
              borderRadius: 4,
              color: canSettle ? "#0A0B0D" : GRAY,
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              cursor: canSettle ? "pointer" : "not-allowed",
            }}
          >
            SETTLE
          </button>
        </div>
      </div>
    </div>
  );
}
