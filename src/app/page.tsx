"use client";

import useSWR from "swr";
import type {
  EngineState,
  AssetSnapshot,
  ContractSnapshot,
  SignalLog,
  AccountBalance,
  KalshiFill,
} from "@/lib/api";
import {
  getEngineState,
  getBalance,
  getFills,
  getSignals,
  deriveOutcome,
  derivePnlUSD,
  getMarketPrice,
} from "@/lib/api";
import { useState, useEffect, useMemo } from "react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const TEAL = "#00E5CC";
const RED = "#EF4444";
const YELLOW = "#FFB300";
const GRAY = "#4B5563";
const DIM = "#374151";
const BG = "#0A0B0D";
const CARD = "#111318";
const BORDER = "#1A1F2E";

const mono = "'IBM Plex Mono', monospace";

// ─── Fetchers ────────────────────────────────────────────────────────────────

const stateFetcher = () => getEngineState();
const balanceFetcher = () => getBalance();
const fillsFetcher = () => getFills();
const signalsFetcher = () => getSignals();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, d = 4): string {
  if (isNaN(n)) return "—";
  return n.toFixed(d);
}

function pct(n: number): string {
  if (isNaN(n)) return "—";
  return (n * 100).toFixed(2) + "%";
}

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const color = action === "YES" ? TEAL : action === "NO" ? RED : DIM;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontFamily: mono,
        fontWeight: 700,
        padding: "1px 8px",
        borderRadius: 3,
        background: `${color}22`,
        color,
        letterSpacing: "0.08em",
      }}
    >
      {action}
    </span>
  );
}

// ─── Asset Model Card ────────────────────────────────────────────────────────

function AssetModelCard({ snap }: { snap: AssetSnapshot }) {
  const best = snap.contracts.reduce<ContractSnapshot | null>((best, c) => {
    const ev = Math.max(c.evYes, c.evNo);
    if (!best) return c;
    return ev > Math.max(best.evYes, best.evNo) ? c : best;
  }, null);

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: "#E2E8F0" }}>
            {snap.asset}
          </span>
          {snap.isWarmedUp ? (
            <span style={{ fontSize: 9, fontFamily: mono, color: TEAL, background: `${TEAL}18`, padding: "1px 6px", borderRadius: 3 }}>
              LIVE
            </span>
          ) : (
            <span style={{ fontSize: 9, fontFamily: mono, color: YELLOW, background: `${YELLOW}18`, padding: "1px 6px", borderRadius: 3 }}>
              WARMUP {snap.candleCount}/30
            </span>
          )}
        </div>
        <span style={{ fontFamily: mono, fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>
          {usd(snap.spot)}
        </span>
      </div>

      {/* Sigma */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            σ ANN
          </div>
          <div style={{ fontFamily: mono, fontSize: 13, color: "#E2E8F0" }}>
            {pct(snap.sigma)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            CONTRACTS
          </div>
          <div style={{ fontFamily: mono, fontSize: 13, color: "#E2E8F0" }}>
            {snap.contracts.length}
          </div>
        </div>
      </div>

      {/* Contracts table */}
      {snap.contracts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 10 }}>
            <thead>
              <tr style={{ color: GRAY, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>STRIKE</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>T</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>P(YES)</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>EV_Y</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>EV_N</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>BID</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>ASK</th>
                <th style={{ padding: "4px 6px", fontWeight: 500 }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {snap.contracts.map((c) => (
                <tr key={c.ticker} style={{ borderBottom: `1px solid ${BORDER}15`, color: "#E2E8F0" }}>
                  <td style={{ padding: "4px 6px" }}>{usd(c.strike)}</td>
                  <td style={{ padding: "4px 6px" }}>{c.minutesLeft}m</td>
                  <td style={{ padding: "4px 6px" }}>{pct(c.pModel)}</td>
                  <td style={{ padding: "4px 6px", color: c.evYes >= 0.03 ? TEAL : GRAY }}>{fmt(c.evYes)}</td>
                  <td style={{ padding: "4px 6px", color: c.evNo >= 0.03 ? TEAL : GRAY }}>{fmt(c.evNo)}</td>
                  <td style={{ padding: "4px 6px" }}>{pct(c.bidYes)}</td>
                  <td style={{ padding: "4px 6px" }}>{pct(c.askYes)}</td>
                  <td style={{ padding: "4px 6px" }}><ActionBadge action={c.action} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.contracts.length === 0 && (
        <div style={{ fontSize: 10, fontFamily: mono, color: GRAY, textAlign: "center", padding: 12 }}>
          No active contracts
        </div>
      )}
    </div>
  );
}

// ─── Fills Table with Kalshi-derived outcomes ────────────────────────────────

function FillsTable({ fills }: { fills: KalshiFill[] }) {
  // Resolve market outcomes for fills
  const [outcomes, setOutcomes] = useState<Record<string, { outcome: "win" | "loss" | "pending" | "error"; pnl: number | null }>>({});

  useEffect(() => {
    if (fills.length === 0) return;
    const tickers = [...new Set(fills.map((f) => f.ticker))];
    Promise.all(
      tickers.map(async (t) => {
        const mp = await getMarketPrice(t).catch(() => null);
        return { ticker: t, mp };
      })
    ).then((results) => {
      const map: typeof outcomes = {};
      for (const f of fills) {
        const mp = results.find((r) => r.ticker === f.ticker)?.mp ?? undefined;
        const outcome = deriveOutcome(f.side, f.created_time, mp);
        const pnl = derivePnlUSD(f.yes_price, f.count, outcome);
        map[f.trade_id] = { outcome, pnl };
      }
      setOutcomes(map);
    });
  }, [fills]);

  if (fills.length === 0) {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 24, textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: GRAY }}>No fills yet</div>
      </div>
    );
  }

  const totalPnl = Object.values(outcomes).reduce((sum, o) => sum + (o.pnl ?? 0), 0);

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: GRAY, letterSpacing: "0.1em" }}>
          KALSHI FILLS ({fills.length})
        </span>
        <span style={{ fontFamily: mono, fontSize: 11, color: totalPnl >= 0 ? TEAL : RED }}>
          P&L: {usd(totalPnl)}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 10 }}>
        <thead>
          <tr style={{ color: GRAY, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>TIME</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>TICKER</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>SIDE</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>QTY</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>PRICE</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>RESULT</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>P&L</th>
          </tr>
        </thead>
        <tbody>
          {fills.slice().reverse().map((f) => {
            const o = outcomes[f.trade_id];
            return (
              <tr key={f.trade_id} style={{ borderBottom: `1px solid ${BORDER}15`, color: "#E2E8F0" }}>
                <td style={{ padding: "4px 6px" }}>{new Date(f.created_time).toLocaleTimeString()}</td>
                <td style={{ padding: "4px 6px" }}>{f.ticker}</td>
                <td style={{ padding: "4px 6px" }}>
                  <span style={{ color: f.side === "yes" ? TEAL : RED }}>{f.side.toUpperCase()}</span>
                </td>
                <td style={{ padding: "4px 6px" }}>{f.count}</td>
                <td style={{ padding: "4px 6px" }}>{f.yes_price}¢</td>
                <td style={{ padding: "4px 6px" }}>
                  {o ? (
                    <span style={{ color: o.outcome === "win" ? TEAL : o.outcome === "loss" ? RED : YELLOW }}>
                      {o.outcome.toUpperCase()}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "4px 6px", color: (o?.pnl ?? 0) >= 0 ? TEAL : RED }}>
                  {o?.pnl != null ? usd(o.pnl) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Signal Log Table ────────────────────────────────────────────────────────

function SignalLogTable({ signals }: { signals: SignalLog[] }) {
  // Show most recent first, only signals with action YES or NO (non-FLAT)
  const actionSignals = signals.filter((s) => s.action !== "FLAT").slice(-50).reverse();

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, overflowX: "auto" }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: GRAY, letterSpacing: "0.1em", marginBottom: 12 }}>
        RECENT TRADE SIGNALS ({actionSignals.length})
      </div>
      {actionSignals.length === 0 ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: GRAY, textAlign: "center", padding: 12 }}>
          No actionable signals yet — model is evaluating
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 10 }}>
          <thead>
            <tr style={{ color: GRAY, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>TIME</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>ASSET</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>SPOT</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>STRIKE</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>T</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>σ</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>P(YES)</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>EV_Y</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>EV_N</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {actionSignals.map((s, i) => (
              <tr key={`${s.timestamp}-${i}`} style={{ borderBottom: `1px solid ${BORDER}15`, color: "#E2E8F0" }}>
                <td style={{ padding: "4px 6px" }}>{timeAgo(s.timestamp)}</td>
                <td style={{ padding: "4px 6px", fontWeight: 600 }}>{s.asset}</td>
                <td style={{ padding: "4px 6px" }}>{usd(s.S)}</td>
                <td style={{ padding: "4px 6px" }}>{usd(s.K)}</td>
                <td style={{ padding: "4px 6px" }}>{s.T_min}m</td>
                <td style={{ padding: "4px 6px" }}>{pct(s.sigma_ann)}</td>
                <td style={{ padding: "4px 6px" }}>{pct(s.pModel)}</td>
                <td style={{ padding: "4px 6px", color: s.evYes >= 0.03 ? TEAL : GRAY }}>{fmt(s.evYes)}</td>
                <td style={{ padding: "4px 6px", color: s.evNo >= 0.03 ? TEAL : GRAY }}>{fmt(s.evNo)}</td>
                <td style={{ padding: "4px 6px" }}><ActionBadge action={s.action} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: engine, error: engineErr } = useSWR("engine-state", stateFetcher, {
    refreshInterval: 1000,
    dedupingInterval: 500,
  });
  const { data: balance } = useSWR("balance", balanceFetcher, {
    refreshInterval: 5000,
  });
  const { data: fills } = useSWR("fills", fillsFetcher, {
    refreshInterval: 5000,
  });
  const { data: signals } = useSWR("signals", signalsFetcher, {
    refreshInterval: 2000,
  });

  const assets = engine?.assets ?? {};
  const assetList = ["BTC", "ETH", "SOL", "XRP"]
    .map((a) => assets[a])
    .filter(Boolean) as AssetSnapshot[];

  const totalContracts = assetList.reduce((s, a) => s + a.contracts.length, 0);
  const warmedUp = assetList.filter((a) => a.isWarmedUp).length;

  return (
    <main style={{ backgroundColor: BG, minHeight: "100vh", color: "#E2E8F0" }}>

      {/* ── Sticky header ────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: engineErr ? RED : TEAL,
              boxShadow: `0 0 6px ${engineErr ? RED : TEAL}`,
            }}
          />
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: "#E2E8F0", letterSpacing: "0.12em" }}>
            POK CAPITAL
          </span>
          <span
            style={{
              fontFamily: mono,
              fontSize: 9,
              padding: "2px 7px",
              borderRadius: 3,
              background: "rgba(0,229,204,0.1)",
              color: TEAL,
              letterSpacing: "0.1em",
            }}
          >
            LIVE ENGINE
          </span>
          {engine?.liveTradingEnabled && (
            <span
              style={{
                fontFamily: mono,
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 3,
                background: `${RED}18`,
                color: RED,
                letterSpacing: "0.1em",
              }}
            >
              LIVE ORDERS
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: GRAY }}>
            {totalContracts} contracts &nbsp;|&nbsp;{" "}
            <span style={{ color: YELLOW }}>{warmedUp}/4 warmed up</span>
          </span>
          {balance && (
            <span style={{ fontFamily: mono, fontSize: 10, color: GRAY }}>
              balance{" "}
              <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{usd(balance.balanceDollars)}</span>
            </span>
          )}
        </div>
      </header>

      {/* ── Portfolio bar ─────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: "12px 20px",
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            KALSHI BALANCE
          </div>
          <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "#E2E8F0" }}>
            {balance ? usd(balance.balanceDollars) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            FILLS
          </div>
          <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "#E2E8F0" }}>
            {fills?.length ?? 0}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            ENGINE
          </div>
          <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: engine ? TEAL : GRAY }}>
            {engine ? "CONNECTED" : engineErr ? "OFFLINE" : "..."}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            KALSHI API
          </div>
          <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: engine?.kalshiConfigured ? TEAL : RED }}>
            {engine?.kalshiConfigured ? "OK" : "NOT SET"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.1em", marginBottom: 2 }}>
            UPDATED
          </div>
          <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 500, color: "#E2E8F0" }}>
            {engine?.timestamp ? new Date(engine.timestamp).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* Asset model cards */}
        <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
          Live Model Output — Refreshing Every 1s
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 12, marginBottom: 24 }}>
          {assetList.map((snap) => (
            <AssetModelCard key={snap.asset} snap={snap} />
          ))}
          {assetList.length === 0 && (
            <div style={{ fontFamily: mono, fontSize: 11, color: GRAY, padding: 24, textAlign: "center" }}>
              {engineErr ? "Engine offline — check Railway deployment" : "Waiting for engine data..."}
            </div>
          )}
        </div>

        {/* Signal log */}
        <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
          Trade Signal Log
        </div>
        <div style={{ marginBottom: 24 }}>
          <SignalLogTable signals={signals ?? []} />
        </div>

        {/* Fills table */}
        <div style={{ fontSize: 9, fontFamily: mono, color: GRAY, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
          Real Kalshi Fills
        </div>
        <FillsTable fills={fills ?? []} />
      </div>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          fontSize: 10,
          fontFamily: mono,
          color: GRAY,
          padding: "16px 0 24px",
          borderTop: `1px solid ${BORDER}`,
          letterSpacing: "0.08em",
        }}
      >
        POK CAPITAL &middot; MODIFIED BLACK-SCHOLES v1.1 &middot; KALSHI BINARY CONTRACTS &middot; LIVE
      </footer>
    </main>
  );
}
