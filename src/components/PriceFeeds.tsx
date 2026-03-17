"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  getBinancePrices,
  getCoinbasePrices,
  getKrakenPrices,
  type ExchangePrice,
} from "@/lib/api";
import { Wifi, WifiOff } from "lucide-react";

const ASSETS = ["BTC", "ETH", "SOL", "XRP"];

interface PriceRow {
  asset: string;
  exchange: string;
  price: number;
  prevPrice?: number;
}

function PriceCell({ price, prevPrice }: { price: number; prevPrice?: number }) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef(prevPrice);

  useEffect(() => {
    if (prevRef.current == null || price === prevRef.current) {
      prevRef.current = price;
      return;
    }
    const direction = price > prevRef.current ? "up" : "down";
    setFlash(direction);
    const t = setTimeout(() => setFlash(null), 400);
    prevRef.current = price;
    return () => clearTimeout(t);
  }, [price]);

  const flashClass =
    flash === "up"
      ? "animate-flash-green"
      : flash === "down"
      ? "animate-flash-red"
      : "";

  const formatted =
    price >= 1000
      ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : price >= 1
      ? `$${price.toFixed(4)}`
      : `$${price.toFixed(6)}`;

  return (
    <span className={`font-mono text-sm text-text ${flashClass}`}>
      {formatted}
    </span>
  );
}

function buildRows(
  binance: ExchangePrice[],
  coinbase: ExchangePrice[],
  kraken: ExchangePrice[]
): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const asset of ASSETS) {
    const b = binance.find((p) => p.symbol === asset);
    const c = coinbase.find((p) => p.symbol === asset);
    const k = kraken.find((p) => p.symbol === asset);
    if (b) rows.push({ asset, exchange: "Binance", price: b.price });
    if (c) rows.push({ asset, exchange: "Coinbase", price: c.price });
    if (k) rows.push({ asset, exchange: "Kraken", price: k.price });
  }
  return rows;
}

function spreadBetween(a: number, b: number): string {
  if (!a || !b) return "—";
  const spread = Math.abs(a - b);
  const pct = (spread / Math.max(a, b)) * 100;
  return `${pct.toFixed(3)}%`;
}

export default function PriceFeeds() {
  const {
    data: binancePrices,
    error: binErr,
  } = useSWR<ExchangePrice[]>("prices-binance", getBinancePrices, {
    refreshInterval: 2000,
    revalidateOnFocus: false,
  });

  const { data: coinbasePrices, error: cbErr } = useSWR<ExchangePrice[]>(
    "prices-coinbase",
    getCoinbasePrices,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const { data: krakenPrices, error: krErr } = useSWR<ExchangePrice[]>(
    "prices-kraken",
    getKrakenPrices,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const isConnected = !binErr;
  const rows = buildRows(
    binancePrices ?? [],
    coinbasePrices ?? [],
    krakenPrices ?? []
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label" style={{ marginBottom: 0 }}>
          Live Crypto Prices
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          {isConnected ? (
            <>
              <Wifi size={12} className="text-profit" />
              <span className="text-profit">Live · 2s</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-loss" />
              <span className="text-loss">Disconnected</span>
            </>
          )}
        </div>
      </div>

      <div className="panel p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                Asset
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                Exchange
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase tracking-wider">
                Spread vs Binance
              </th>
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((asset) => {
              const assetRows = rows.filter((r) => r.asset === asset);
              const binancePrice =
                assetRows.find((r) => r.exchange === "Binance")?.price ?? 0;

              if (assetRows.length === 0) {
                return (
                  <tr key={asset} className="border-b border-border">
                    <td className="px-4 py-2 font-semibold text-text">
                      {asset}
                    </td>
                    <td colSpan={3} className="px-4 py-2 text-muted text-xs">
                      Loading...
                    </td>
                  </tr>
                );
              }

              return assetRows.map((row, idx) => (
                <tr
                  key={`${asset}-${row.exchange}`}
                  className={`border-b border-border hover:bg-white/5 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-white/[0.02]"
                  }`}
                >
                  <td className="px-4 py-2">
                    {idx === 0 ? (
                      <span className="font-semibold text-text">{asset}</span>
                    ) : (
                      <span className="text-muted text-xs">↳</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge ${
                        row.exchange === "Binance"
                          ? "badge-blue"
                          : row.exchange === "Coinbase"
                          ? "badge-green"
                          : "badge-gray"
                      }`}
                    >
                      {row.exchange}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <PriceCell price={row.price} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted">
                    {row.exchange === "Binance"
                      ? "—"
                      : spreadBetween(row.price, binancePrice)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>

        {(binErr || cbErr || krErr) && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted">
            {binErr && <span className="text-loss mr-3">Binance error</span>}
            {cbErr && <span className="text-loss mr-3">Coinbase error</span>}
            {krErr && <span className="text-loss">Kraken error</span>}
          </div>
        )}
      </div>
    </div>
  );
}
