// POK Capital — localStorage persistence

import type { Trade } from "./types";
import { getSampleTrades } from "./sampleData";

const STORAGE_KEY = "pok_trades_v1";

export function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // First load: seed with sample data
      const samples = getSampleTrades();
      saveTrades(samples);
      return samples;
    }
    return JSON.parse(raw) as Trade[];
  } catch {
    return [];
  }
}

export function saveTrades(trades: Trade[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {
    console.warn("localStorage unavailable");
  }
}

export function clearTrades(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
