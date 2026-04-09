import OperatorConsoleClient, { type DashboardConsoleBootstrap } from "@/components/dashboard/OperatorConsoleClient";
import type {
  BackendHealth,
  BackendStatus,
  FillAnalytics,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";
function fallbackHealth(error: string, status: BackendHealth["status"] = "unreachable", latencyMs: number | null = null): BackendHealth {
  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: 0,
    uptimeMinutes: 0,
    version: "1.0.0",
    environment: process.env.NODE_ENV ?? "production",
    liveTradingEnabled: false,
    maxTradeCents: 0,
    activeWorkers: [],
    tradeCount: 0,
    pendingTrades: 0,
    settledTrades: 0,
    logCount: 0,
    lastLogTimestamp: null,
    lastHeartbeatTimestamp: null,
    heartbeatIntervalMs: 300_000,
    latencyMs,
    engineConfig: {
      evMinCents: 0,
      evMaxCents: 0,
      minEntryPriceCents: 0,
      stabilityWindow: 0,
      tradingWindowOpenMs: 0,
      tradingWindowCloseMs: 0,
    },
    error,
  };
}

async function fetchRailwayJson<T>(path: string): Promise<T> {
  if (!RAILWAY) {
    throw new Error("NEXT_PUBLIC_API_BASE not set");
  }

  const res = await fetch(`${RAILWAY}${path}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Railway returned ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function fetchHealthBootstrap(): Promise<BackendHealth> {
  if (!RAILWAY) {
    return fallbackHealth("NEXT_PUBLIC_API_BASE not set");
  }

  const start = Date.now();
  try {
    const data = await fetchRailwayJson<BackendHealth>("/health");
    return { ...data, latencyMs: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach backend";
    const latencyMs = Date.now() - start;
    return fallbackHealth(
      message,
      message.includes("returned") ? "error" : "unreachable",
      latencyMs
    );
  }
}

async function fetchStatusBootstrap(): Promise<BackendStatus | null> {
  if (!RAILWAY) return null;

  const start = Date.now();
  try {
    const data = await fetchRailwayJson<BackendStatus>("/status");
    return { ...data, latencyMs: Date.now() - start };
  } catch {
    return null;
  }
}

async function fetchOptional<T>(path: string): Promise<T | undefined> {
  if (!RAILWAY) return undefined;
  try {
    return await fetchRailwayJson<T>(path);
  } catch {
    return undefined;
  }
}

async function loadBootstrap(): Promise<DashboardConsoleBootstrap> {
  const [health, status, analytics] = await Promise.all([
    fetchHealthBootstrap(),
    fetchStatusBootstrap(),
    fetchOptional<FillAnalytics>("/analytics"),
  ]);

  return {
    health,
    status,
    analytics,
  };
}

export default async function Page() {
  const initialData = await loadBootstrap();
  return <OperatorConsoleClient initialData={initialData} />;
}
