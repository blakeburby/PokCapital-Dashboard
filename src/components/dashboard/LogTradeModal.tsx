"use client";

import { useState, useEffect } from "react";
import type { Trade, Asset, Direction } from "@/lib/types";
import { modifiedBS, kellyFraction, annualizeVol, classifyVolRegime, classifyMoneyness } from "@/lib/math";

const TEAL = "#00E5CC";
const RED = "#FF3D57";
const AMBER = "#FFB300";
const GRAY = "#6B7280";
const GREEN = "#00E676";

interface FormState {
  asset: Asset;
  direction: Direction;
  contract_id: string;
  strike: string;
  expiry_time: string;
  spot_price: string;
  ask_yes: string;
  bid_yes: string;
  minutes_to_expiry: string;
  sigma_ewma_1min: string;
  bankroll_at_entry: string;
  tags: string;
  notes: string;
}

const DEFAULT_FORM: FormState = {
  asset: "BTC",
  direction: "YES",
  contract_id: "",
  strike: "",
  expiry_time: "",
  spot_price: "",
  ask_yes: "",
  bid_yes: "",
  minutes_to_expiry: "30",
  sigma_ewma_1min: "",
  bankroll_at_entry: "",
  tags: "",
  notes: "",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: GRAY, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "5px 8px",
        background: "#141720",
        border: "1px solid #1A1F2E",
        borderRadius: 4,
        color: "#E2E8F0",
        fontSize: 12,
        fontFamily: "'IBM Plex Mono', monospace",
        outline: "none",
      }}
    />
  );
}

function StatLine({ label, value, color = "#E2E8F0" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #1A1F2E" }}>
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: GRAY }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

export default function LogTradeModal({
  open,
  onClose,
  onSubmit,
  nextId,
  lastBankroll,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (trade: Trade) => void;
  nextId: number;
  lastBankroll: number;
}) {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, bankroll_at_entry: String(lastBankroll.toFixed(2)) });

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, bankroll_at_entry: String(lastBankroll.toFixed(2)) });
    }
  }, [open, lastBankroll]);

  function set(k: keyof FormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  const S = parseFloat(form.spot_price) || 0;
  const K = parseFloat(form.strike) || 0;
  const askYes = parseFloat(form.ask_yes) || 0;
  const bidYes = parseFloat(form.bid_yes) || 0;
  const tMin = parseFloat(form.minutes_to_expiry) || 0;
  const sigma1min = parseFloat(form.sigma_ewma_1min) || 0;
  const bankroll = parseFloat(form.bankroll_at_entry) || 0;

  const sigmaAnn = sigma1min > 0 ? annualizeVol(sigma1min) : 0;
  const contractMid = (askYes + bidYes) / 2;
  const spread = askYes - bidYes;
  const moneyness = S > 0 && K > 0 ? Math.log(S / K) : 0;

  const preview = S > 0 && K > 0 && sigmaAnn > 0 && tMin > 0 && askYes > 0 && bidYes > 0
    ? modifiedBS(S, K, sigmaAnn, tMin, askYes, bidYes)
    : null;

  const evEntered = preview
    ? (form.direction === "YES" ? preview.evYes : preview.evNo)
    : null;

  const kelly = evEntered !== null && evEntered > 0 ? kellyFraction(evEntered) : null;
  const contracts = kelly && bankroll > 0
    ? Math.floor((bankroll * kelly.positionPct) / Math.max(contractMid, 0.01))
    : 0;
  const costBasis = contracts * contractMid;

  const volRegime = sigmaAnn > 0 ? classifyVolRegime(sigmaAnn) : null;
  const moneynessBucket = S > 0 && K > 0 ? classifyMoneyness(moneyness) : null;

  const canSubmit =
    form.contract_id.trim() !== "" &&
    S > 0 && K > 0 &&
    askYes > 0 && bidYes > 0 &&
    tMin > 0 && sigma1min > 0 && bankroll > 0 &&
    preview !== null && evEntered !== null && evEntered > 0;

  function handleSubmit() {
    if (!canSubmit || !preview || evEntered === null || !kelly || !volRegime || !moneynessBucket) return;

    const now = new Date().toISOString();
    const expiryTime = form.expiry_time
      ? new Date(form.expiry_time).toISOString()
      : new Date(Date.now() + tMin * 60_000).toISOString();

    const trade: Trade = {
      trade_id: nextId,
      timestamp_entry: now,
      timestamp_exit: null,
      asset: form.asset,
      direction: form.direction,
      contract_id: form.contract_id.trim(),
      strike: K,
      expiry_time: expiryTime,
      spot_price: S,
      ask_yes: askYes,
      bid_yes: bidYes,
      contract_mid: contractMid,
      spread,
      minutes_to_expiry: tMin,
      p_model: preview.pModel,
      sigma_ewma_ann: sigmaAnn,
      sigma_ewma_1min: sigma1min,
      ev_yes: preview.evYes,
      ev_no: preview.evNo,
      ev_entered: evEntered,
      d2_base: preview.d2Base,
      jump_weight_n1: preview.jumpWeightN1,
      moneyness,
      kelly_raw: kelly.kellyRaw,
      position_pct: kelly.positionPct,
      contracts_bought: contracts,
      cost_basis: costBasis,
      bankroll_at_entry: bankroll,
      outcome: "OPEN",
      spot_at_expiry: null,
      resolved_price: null,
      pnl_gross: null,
      pnl_net: null,
      fee_paid: null,
      bankroll_after: null,
      brier_contribution: null,
      ev_realized: null,
      ev_error: null,
      vol_regime: volRegime,
      moneyness_bucket: moneynessBucket,
      tags: form.tags.trim(),
      notes: form.notes.trim(),
    };

    onSubmit(trade);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
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
          maxWidth: 760,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: TEAL, letterSpacing: "0.1em" }}>
            + LOG TRADE
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* LEFT: inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* asset + direction */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <Label>Asset</Label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["BTC", "ETH", "SOL", "XRP"] as Asset[]).map(a => (
                    <button key={a} onClick={() => set("asset", a)}
                      style={{
                        flex: 1, padding: "4px 0", border: `1px solid ${form.asset === a ? TEAL : "#1A1F2E"}`,
                        background: form.asset === a ? `${TEAL}22` : "transparent",
                        color: form.asset === a ? TEAL : GRAY,
                        borderRadius: 3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
                      }}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Direction</Label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["YES", "NO"] as Direction[]).map(d => (
                    <button key={d} onClick={() => set("direction", d)}
                      style={{
                        flex: 1, padding: "4px 0",
                        border: `1px solid ${form.direction === d ? (d === "YES" ? GREEN : RED) : "#1A1F2E"}`,
                        background: form.direction === d ? `${d === "YES" ? GREEN : RED}22` : "transparent",
                        color: form.direction === d ? (d === "YES" ? GREEN : RED) : GRAY,
                        borderRadius: 3, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Contract ID</Label>
              <Input value={form.contract_id} onChange={v => set("contract_id", v)} placeholder="BTC-USD-82000-0316" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <Label>Strike</Label>
                <Input value={form.strike} onChange={v => set("strike", v)} placeholder="82000" type="number" />
              </div>
              <div>
                <Label>Spot Price</Label>
                <Input value={form.spot_price} onChange={v => set("spot_price", v)} placeholder="82350" type="number" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <Label>Ask YES (0–1)</Label>
                <Input value={form.ask_yes} onChange={v => set("ask_yes", v)} placeholder="0.65" type="number" />
              </div>
              <div>
                <Label>Bid YES (0–1)</Label>
                <Input value={form.bid_yes} onChange={v => set("bid_yes", v)} placeholder="0.63" type="number" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <Label>Minutes to Expiry</Label>
                <Input value={form.minutes_to_expiry} onChange={v => set("minutes_to_expiry", v)} placeholder="30" type="number" />
              </div>
              <div>
                <Label>σ_EWMA 1-min</Label>
                <Input value={form.sigma_ewma_1min} onChange={v => set("sigma_ewma_1min", v)} placeholder="0.0125" type="number" />
              </div>
            </div>

            <div>
              <Label>Bankroll at Entry ($)</Label>
              <Input value={form.bankroll_at_entry} onChange={v => set("bankroll_at_entry", v)} placeholder="500.00" type="number" />
            </div>

            <div>
              <Label>Expiry Time (optional)</Label>
              <Input value={form.expiry_time} onChange={v => set("expiry_time", v)} type="datetime-local" />
            </div>

            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={v => set("tags", v)} placeholder="clean-entry, high-vol, ..." />
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={v => set("notes", v)} placeholder="Optional notes..." />
            </div>
          </div>

          {/* RIGHT: live model preview */}
          <div style={{ background: "#141720", borderRadius: 6, padding: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: GRAY, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              LIVE MODEL PREVIEW
            </div>

            <StatLine label="σ_EWMA ann" value={sigmaAnn > 0 ? sigmaAnn.toFixed(4) : "—"} color={TEAL} />
            <StatLine label="Vol Regime" value={volRegime ?? "—"} color={volRegime === "HIGH" ? RED : volRegime === "MEDIUM" ? AMBER : TEAL} />
            <StatLine label="Contract Mid" value={contractMid > 0 ? contractMid.toFixed(3) : "—"} />
            <StatLine label="Spread" value={spread > 0 ? spread.toFixed(3) : "—"} color={spread > 0.03 ? AMBER : "#E2E8F0"} />
            <StatLine label="Moneyness ln(S/K)" value={S > 0 && K > 0 ? moneyness.toFixed(5) : "—"} />
            <StatLine label="Moneyness Bucket" value={moneynessBucket ?? "—"} color={TEAL} />

            <div style={{ margin: "8px 0 4px", height: 1, background: "#1A1F2E" }} />

            <StatLine
              label="p_model"
              value={preview ? preview.pModel.toFixed(4) : "—"}
              color={preview ? TEAL : GRAY}
            />
            <StatLine label="d2_base" value={preview ? preview.d2Base.toFixed(4) : "—"} />
            <StatLine label="jump_weight_n1" value={preview ? preview.jumpWeightN1.toFixed(6) : "—"} />

            <div style={{ margin: "8px 0 4px", height: 1, background: "#1A1F2E" }} />

            <StatLine
              label="EV YES"
              value={preview ? (preview.evYes >= 0 ? "+" : "") + preview.evYes.toFixed(4) : "—"}
              color={preview && preview.evYes > 0.03 ? GREEN : RED}
            />
            <StatLine
              label="EV NO"
              value={preview ? (preview.evNo >= 0 ? "+" : "") + preview.evNo.toFixed(4) : "—"}
              color={preview && preview.evNo > 0.03 ? GREEN : RED}
            />
            <StatLine
              label={`EV (${form.direction})`}
              value={evEntered !== null ? (evEntered >= 0 ? "+" : "") + evEntered.toFixed(4) : "—"}
              color={evEntered !== null && evEntered > 0.03 ? GREEN : evEntered !== null && evEntered > 0 ? AMBER : RED}
            />

            <div style={{ margin: "8px 0 4px", height: 1, background: "#1A1F2E" }} />

            <StatLine
              label="Kelly Raw"
              value={kelly ? kelly.kellyRaw.toFixed(5) : "—"}
            />
            <StatLine
              label="Position Pct"
              value={kelly ? (kelly.positionPct * 100).toFixed(3) + "%" : "—"}
              color={TEAL}
            />
            <StatLine
              label="Contracts"
              value={contracts > 0 ? String(contracts) : "—"}
              color={TEAL}
            />
            <StatLine
              label="Cost Basis"
              value={costBasis > 0 ? "$" + costBasis.toFixed(2) : "—"}
              color={RED}
            />

            {/* EV signal */}
            <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 4, background: canSubmit ? "rgba(0,230,118,0.08)" : "rgba(255,61,87,0.08)", border: `1px solid ${canSubmit ? GREEN : RED}33` }}>
              <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: canSubmit ? GREEN : RED }}>
                {canSubmit ? "✓ POSITIVE EV — TRADE VALID" : evEntered !== null && evEntered <= 0 ? "✗ NEGATIVE EV — DO NOT TRADE" : "— FILL ALL FIELDS"}
              </span>
            </div>
          </div>
        </div>

        {/* submit */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", background: "transparent", border: "1px solid #1A1F2E", borderRadius: 4, color: GRAY, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer" }}>
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: "6px 20px",
              background: canSubmit ? TEAL : "#1A1F2E",
              border: "none",
              borderRadius: 4,
              color: canSubmit ? "#0A0B0D" : GRAY,
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            LOG TRADE
          </button>
        </div>
      </div>
    </div>
  );
}
