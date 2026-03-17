"use client";

import useSWR from "swr";
import { getHealth, getStatus, getEndpointLatency, type BackendHealth, type BackendStatus } from "@/lib/api";
import {
    Activity,
    Wifi,
    WifiOff,
    Clock,
    Zap,
    Server,
    Hash,
    Shield,
    Settings,
    AlertTriangle,
} from "lucide-react";

function relativeTime(isoOrNull: string | null): string {
    if (!isoOrNull) return "never";
    const ms = Date.now() - new Date(isoOrNull).getTime();
    if (ms < 0) return "just now";
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    return `${Math.floor(ms / 3_600_000)}h ago`;
}

function formatUptime(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface MiniCardProps {
    label: string;
    value: string;
    icon?: React.ReactNode;
    color?: string;
    sub?: string;
}

function MiniCard({ label, value, icon, color = "#3B82F6", sub }: MiniCardProps) {
    return (
        <div
            className="rounded-lg px-3 py-2 flex flex-col gap-0.5 min-w-0"
            style={{ backgroundColor: "rgba(30,41,59,0.5)", border: "1px solid #1F2937" }}
        >
            <div className="flex items-center gap-1.5">
                {icon && <span style={{ color }} className="opacity-70">{icon}</span>}
                <span className="text-[10px] uppercase tracking-wider text-muted font-medium truncate">
                    {label}
                </span>
            </div>
            <span className="text-sm font-mono font-semibold truncate" style={{ color }}>
                {value}
            </span>
            {sub && <span className="text-[10px] text-muted truncate">{sub}</span>}
        </div>
    );
}

export default function BackendStatusPanel() {
    const { data: health, error, isLoading } = useSWR<BackendHealth>(
        "backend-health",
        getHealth,
        { refreshInterval: 10_000, revalidateOnFocus: false }
    );

    const { data: status } = useSWR<BackendStatus | null>(
        "backend-status",
        getStatus,
        { refreshInterval: 10_000, revalidateOnFocus: false }
    );

    const connected = !!health && health.status === "ok" && !error;
    const statusColor = connected ? "#22C55E" : "#EF4444";
    const statusText = isLoading
        ? "Connecting..."
        : connected
            ? "Connected"
            : "Disconnected";

    // Stale detection
    const heartbeatStale =
        health?.lastHeartbeatTimestamp &&
        Date.now() - new Date(health.lastHeartbeatTimestamp).getTime() > 10 * 60_000;
    const logStale =
        health?.lastLogTimestamp &&
        Date.now() - new Date(health.lastLogTimestamp).getTime() > 2 * 60_000;

    const backendUrl =
        process.env.NEXT_PUBLIC_API_BASE?.replace("https://", "") ??
        "(not configured)";

    return (
        <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${connected ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                    backgroundColor: connected
                        ? "rgba(34,197,94,0.05)"
                        : "rgba(239,68,68,0.05)",
                }}
            >
                <div className="flex items-center gap-2.5">
                    {connected ? (
                        <Wifi size={14} style={{ color: statusColor }} />
                    ) : (
                        <WifiOff size={14} style={{ color: statusColor }} />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: statusColor }}>
                        Backend Status
                    </span>
                    <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: statusColor }}
                    />
                    <span className="text-xs font-mono" style={{ color: statusColor }}>
                        {statusText}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="font-mono">{backendUrl}</span>
                    <span>Poll: 10s</span>
                    {health?.latencyMs != null && (
                        <span className="font-mono">
                            Latency: {health.latencyMs}ms
                        </span>
                    )}
                </div>
            </div>

            {/* Warnings */}
            {(heartbeatStale || logStale || (!connected && !isLoading)) && (
                <div
                    className="flex items-center gap-4 px-4 py-1.5 text-xs"
                    style={{ backgroundColor: "rgba(245,158,11,0.05)", borderTop: "1px solid rgba(245,158,11,0.15)" }}
                >
                    <AlertTriangle size={12} style={{ color: "#F59E0B" }} />
                    {heartbeatStale && (
                        <span style={{ color: "#F59E0B" }}>
                            Heartbeat stale ({relativeTime(health?.lastHeartbeatTimestamp ?? null)})
                        </span>
                    )}
                    {logStale && (
                        <span style={{ color: "#F59E0B" }}>
                            Logs stale ({relativeTime(health?.lastLogTimestamp ?? null)})
                        </span>
                    )}
                    {!connected && !isLoading && (
                        <span style={{ color: "#EF4444" }}>
                            Backend unreachable -- check Railway deployment
                        </span>
                    )}
                </div>
            )}

            {/* Metric cards */}
            {connected && health && (
                <div
                    className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 px-4 py-3"
                    style={{ backgroundColor: "rgba(15,23,42,0.3)" }}
                >
                    <MiniCard
                        label="Uptime"
                        value={formatUptime(health.uptimeMinutes)}
                        icon={<Clock size={10} />}
                        color="#3B82F6"
                        sub={`v${health.version}`}
                    />
                    <MiniCard
                        label="Mode"
                        value={health.liveTradingEnabled ? "LIVE" : "PAPER"}
                        icon={<Zap size={10} />}
                        color={health.liveTradingEnabled ? "#22C55E" : "#F59E0B"}
                        sub={health.environment}
                    />
                    <MiniCard
                        label="Workers"
                        value={health.activeWorkers.join(", ")}
                        icon={<Server size={10} />}
                        color="#8B5CF6"
                        sub={`${health.activeWorkers.length} active`}
                    />
                    <MiniCard
                        label="Trades"
                        value={String(health.tradeCount)}
                        icon={<Hash size={10} />}
                        color="#3B82F6"
                        sub={`${health.pendingTrades} pending`}
                    />
                    <MiniCard
                        label="Max Trade"
                        value={`$${(health.maxTradeCents / 100).toFixed(0)}`}
                        icon={<Shield size={10} />}
                        color="#6366F1"
                        sub={`${health.maxTradeCents}c`}
                    />
                    <MiniCard
                        label="Heartbeat"
                        value={relativeTime(health.lastHeartbeatTimestamp)}
                        icon={<Activity size={10} />}
                        color={heartbeatStale ? "#EF4444" : "#22C55E"}
                        sub="5m interval"
                    />
                    <MiniCard
                        label="Logs"
                        value={String(health.logCount)}
                        icon={<Hash size={10} />}
                        color="#6366F1"
                        sub={relativeTime(health.lastLogTimestamp)}
                    />
                    <MiniCard
                        label="Engine"
                        value={`${health.engineConfig.evMinCents}-${health.engineConfig.evMaxCents}c EV`}
                        icon={<Settings size={10} />}
                        color="#8B5CF6"
                        sub={`min entry ${health.engineConfig.minEntryPriceCents}c`}
                    />
                    <MiniCard
                        label="Positions"
                        value={status?.positionTracker.active != null ? String(status.positionTracker.active) : "—"}
                        icon={<Zap size={10} />}
                        color="#06B6D4"
                        sub={`of ${status?.positionTracker.max ?? 2} max`}
                    />
                    <MiniCard
                        label="Trades API"
                        value={getEndpointLatency("/api/trades") != null ? `${getEndpointLatency("/api/trades")}ms` : "—"}
                        icon={<Activity size={10} />}
                        color="#3B82F6"
                        sub="/api/trades latency"
                    />
                </div>
            )}

            {/* Per-worker state */}
            {connected && status?.workers && status.workers.length > 0 && (
                <div
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pb-3"
                    style={{ backgroundColor: "rgba(15,23,42,0.2)" }}
                >
                    {status.workers.map((w) => (
                        <div
                            key={w.assetKey}
                            className="rounded-lg px-3 py-2 flex flex-col gap-0.5"
                            style={{ backgroundColor: "rgba(30,41,59,0.5)", border: "1px solid #1F2937" }}
                        >
                            <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
                                {w.assetKey.toUpperCase()} Worker
                            </span>
                            <span className="text-xs font-mono font-semibold text-text truncate">
                                {w.currentPrice != null ? `$${w.currentPrice.toLocaleString()}` : "—"}
                            </span>
                            <span className="text-[10px] text-muted truncate">
                                {w.marketTicker ?? "no market"}
                            </span>
                            <span className="text-[10px] font-mono truncate" style={{ color: "#06B6D4" }}>
                                {w.enginePhase ?? "idle"}
                            </span>
                            {w.orderbookSpread > 0 && (
                                <span className="text-[10px] text-muted">
                                    spread: {w.orderbookSpread.toFixed(1)}¢
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Recent engine events */}
            {connected && status?.recentEvents && status.recentEvents.length > 0 && (
                <div
                    className="px-4 pb-3"
                    style={{ backgroundColor: "rgba(15,23,42,0.2)" }}
                >
                    <p className="text-[10px] uppercase tracking-wider text-muted mb-1 pt-2">
                        Recent Engine Events
                    </p>
                    <div className="space-y-0.5">
                        {status.recentEvents.slice(-5).map((evt, i) => (
                            <p key={i} className="text-[10px] font-mono text-muted truncate">
                                {evt}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "rgba(30,41,59,0.5)" }} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
