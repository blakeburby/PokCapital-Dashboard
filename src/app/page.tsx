import OperatorConsoleClient, { type DashboardConsoleBootstrap } from "@/components/dashboard/OperatorConsoleClient";
import type {
  AccountBalance,
  BackendHealth,
  BackendStatus,
  FillAnalytics,
  KalshiFill,
  LogsResponse,
  PaperBalance,
  Stats,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";
const EMPTY_LOGS: LogsResponse = {
  logs: [],
  meta: { count: 0, lastTimestamp: null },
};

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

async function fetchLogsBootstrap(): Promise<LogsResponse> {
  if (!RAILWAY) return EMPTY_LOGS;

  try {
    const data = await fetchRailwayJson<LogsResponse | string[]>("/logs");
    if (Array.isArray(data)) {
      return { logs: data, meta: { count: data.length, lastTimestamp: null } };
    }
    if (data?.logs && Array.isArray(data.logs)) {
      return {
        logs: data.logs,
        meta: {
          count: Number(data.meta?.count ?? data.logs.length),
          lastTimestamp: data.meta?.lastTimestamp ?? null,
        },
      };
    }
    return EMPTY_LOGS;
  } catch {
    return EMPTY_LOGS;
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
  const [health, status, analytics, liveBalance, paperBalance, paperStats, fills, logs] = await Promise.all([
    fetchHealthBootstrap(),
    fetchStatusBootstrap(),
    fetchOptional<FillAnalytics>("/analytics"),
    fetchOptional<AccountBalance>("/balance"),
    fetchOptional<PaperBalance>("/paper-balance"),
    fetchOptional<Stats>("/paper-stats"),
    fetchOptional<KalshiFill[]>("/fills"),
    fetchLogsBootstrap(),
  ]);

  return {
    health,
    status,
    analytics,
    liveBalance,
    paperBalance,
    paperStats,
    fills,
    logs,
  };
}

export default async function Page() {
  const initialData = await loadBootstrap();
  return <OperatorConsoleClient initialData={initialData} />;
}
