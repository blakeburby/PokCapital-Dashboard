"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import useSWR from "swr";
import { getLogs, type LogsResponse } from "@/lib/api";
import {
  Terminal,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Activity,
} from "lucide-react";

// ─── Log event classification ─────────────────────────────────────────────────

type LogEventType =
  | "INFO"
  | "WARN"
  | "ERROR"
  | "TRADE_PLACED"
  | "TRADE_BLOCKED"
  | "TRADE_SKIPPED"
  | "FILL_CONFIRMED"
  | "SETTLEMENT"
  | "HEARTBEAT"
  | "MARKET_ROLL"
  | "PHASE"
  | "STARTUP";

interface ParsedLog {
  raw: string;
  timestamp: string | null;
  tag: string | null;
  eventType: LogEventType;
  message: string;
  asset: string | null;
}

const ASSET_TAGS = ["BTC", "ETH", "SOL", "XRP"];

function classifyLog(line: string): LogEventType {
  const upper = line.toUpperCase();
  if (upper.includes("PLACING TRADE") || upper.includes("TRADE PLACED")) return "TRADE_PLACED";
  if (upper.includes("TRADE BLOCKED")) return "TRADE_BLOCKED";
  if (upper.includes("TRADE SKIPPED")) return "TRADE_SKIPPED";
  if (upper.includes("FILL CONFIRMED") || upper.includes("FILL PRICE CHECK")) return "FILL_CONFIRMED";
  if (upper.includes("SETTLED") || upper.includes("RECONCIL")) return "SETTLEMENT";
  if (upper.includes("HEARTBEAT")) return "HEARTBEAT";
  if (upper.includes("MARKET ROLLED") || upper.includes("MARKET ROLL")) return "MARKET_ROLL";
  if (upper.includes("PHASE:")) return "PHASE";
  if (upper.includes("STARTING") || upper.includes("STARTED") || upper.includes("STARTUP")) return "STARTUP";
  if (upper.includes("ERROR") || upper.includes("FATAL")) return "ERROR";
  if (upper.includes("WARN")) return "WARN";
  return "INFO";
}

function extractAsset(line: string): string | null {
  const upper = line.toUpperCase();
  for (const a of ASSET_TAGS) {
    // Match [BTC], [ETH] etc. as tags
    if (upper.includes(`[${a}]`)) return a;
  }
  // Try to match asset mentions in text
  for (const a of ASSET_TAGS) {
    if (upper.includes(` ${a} `) || upper.includes(`| ${a} |`)) return a;
  }
  return null;
}

function parseLine(raw: string): ParsedLog {
  // Format: [ISO_TIMESTAMP] [TAG] message
  const tsMatch = raw.match(/^\[([^\]]+)\]\s*/);
  const timestamp = tsMatch?.[1] ?? null;
  const rest = tsMatch ? raw.slice(tsMatch[0].length) : raw;
  const tagMatch = rest.match(/^\[([^\]]+)\]\s*/);
  const tag = tagMatch?.[1] ?? null;
  const message = tagMatch ? rest.slice(tagMatch[0].length) : rest;
  const eventType = classifyLog(raw);
  const asset = extractAsset(raw);

  return { raw, timestamp, tag, eventType, message, asset };
}

// ─── Event type styling ───────────────────────────────────────────────────────

const EVENT_COLORS: Record<LogEventType, string> = {
  INFO: "#22C55E",
  WARN: "#F59E0B",
  ERROR: "#EF4444",
  TRADE_PLACED: "#3B82F6",
  TRADE_BLOCKED: "#EF4444",
  TRADE_SKIPPED: "#F59E0B",
  FILL_CONFIRMED: "#8B5CF6",
  SETTLEMENT: "#6366F1",
  HEARTBEAT: "#6B7280",
  MARKET_ROLL: "#14B8A6",
  PHASE: "#06B6D4",
  STARTUP: "#8B5CF6",
};

const EVENT_LABELS: Record<LogEventType, string> = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERR",
  TRADE_PLACED: "TRADE",
  TRADE_BLOCKED: "BLOCK",
  TRADE_SKIPPED: "SKIP",
  FILL_CONFIRMED: "FILL",
  SETTLEMENT: "SETTLE",
  HEARTBEAT: "PULSE",
  MARKET_ROLL: "ROLL",
  PHASE: "PHASE",
  STARTUP: "START",
};

const ALL_EVENT_TYPES: LogEventType[] = [
  "INFO", "WARN", "ERROR", "TRADE_PLACED", "TRADE_BLOCKED", "TRADE_SKIPPED",
  "FILL_CONFIRMED", "SETTLEMENT", "HEARTBEAT", "MARKET_ROLL", "PHASE", "STARTUP",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LogsPanel() {
  const [manualRefresh, setManualRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState<string>("ALL");
  const [enabledTypes, setEnabledTypes] = useState<Set<LogEventType>>(new Set(ALL_EVENT_TYPES));
  const [showFilters, setShowFilters] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: logsData, error, isLoading, mutate } = useSWR<LogsResponse>(
    ["logs", manualRefresh],
    () => getLogs(),
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  const logs = useMemo(() => logsData?.logs ?? [], [logsData]);
  const logsMeta = logsData?.meta ?? { count: 0, lastTimestamp: null as string | null };

  // Parse all logs
  const parsedLogs = useMemo(
    () => logs.map(parseLine),
    [logs]
  );

  // Apply filters
  const filteredLogs = useMemo(() => {
    return parsedLogs.filter((log) => {
      if (!enabledTypes.has(log.eventType)) return false;
      if (assetFilter !== "ALL" && log.asset !== assetFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!log.raw.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [parsedLogs, enabledTypes, assetFilter, searchQuery]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filteredLogs]);

  const handleRefresh = () => {
    setManualRefresh((n) => n + 1);
    mutate();
  };

  const toggleEventType = (type: LogEventType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const noLogs = logs.length === 0;

  // Status bar data
  const lastLog = parsedLogs.length > 0 ? parsedLogs[parsedLogs.length - 1] : null;
  const lastError = [...parsedLogs].reverse().find((l) => l.eventType === "ERROR");
  const lastHeartbeat = [...parsedLogs].reverse().find((l) => l.eventType === "HEARTBEAT");
  const recentBlocks = parsedLogs.filter((l) =>
    l.eventType === "TRADE_BLOCKED" || l.eventType === "TRADE_SKIPPED"
  ).length;

  // Freshness — prefer meta.lastTimestamp from backend, fall back to parsed log timestamp
  const lastTimestamp = logsMeta.lastTimestamp ?? lastLog?.timestamp ?? null;
  const freshnessText = lastTimestamp
    ? (() => {
      const ms = Date.now() - new Date(lastTimestamp).getTime();
      if (ms < 0) return "just now";
      if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      return `${Math.floor(ms / 3_600_000)}h ago`;
    })()
    : null;

  // Risk indicators
  const heartbeatAge = lastHeartbeat?.timestamp
    ? Date.now() - new Date(lastHeartbeat.timestamp).getTime()
    : Infinity;
  const logsAge = lastTimestamp
    ? Date.now() - new Date(lastTimestamp).getTime()
    : Infinity;
  const risks: string[] = [];
  if (heartbeatAge > 10 * 60_000) risks.push("No heartbeat > 10m");
  if (logsAge > 60_000 && logsAge < Infinity) risks.push("Logs stale > 60s");
  if (recentBlocks >= 3) risks.push(`${recentBlocks} blocked/skipped trades`);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
          <Terminal size={11} />
          Deployment Logs
        </p>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-6 pr-3 py-1 text-xs rounded bg-panel border border-border text-text placeholder-muted focus:outline-none focus:border-accent w-40"
            />
          </div>
          {/* Asset filter */}
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded bg-panel border border-border text-text focus:outline-none focus:border-accent"
          >
            <option value="ALL">All Assets</option>
            {ASSET_TAGS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${showFilters ? "border-accent text-accent" : "border-border text-muted hover:text-text"
              }`}
          >
            <Filter size={11} />
            Types
          </button>
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-panel border border-border text-muted hover:text-text transition-colors"
          >
            <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Event type filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ALL_EVENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleEventType(type)}
              className="px-2 py-0.5 text-[10px] rounded font-mono transition-all"
              style={{
                backgroundColor: enabledTypes.has(type) ? EVENT_COLORS[type] + "20" : "transparent",
                color: enabledTypes.has(type) ? EVENT_COLORS[type] : "#4B5563",
                border: `1px solid ${enabledTypes.has(type) ? EVENT_COLORS[type] + "40" : "#1F2937"}`,
              }}
            >
              {EVENT_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      <div
        className="panel"
        style={{ backgroundColor: "#0A0E1A", borderColor: "#1A2030", padding: 0, overflow: "hidden" }}
      >
        {/* Terminal header bar */}
        <div
          className="flex items-center gap-1.5 px-4 py-2 border-b"
          style={{ borderColor: "#1A2030" }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-loss opacity-70" />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#F59E0B", opacity: 0.7 }} />
          <div className="w-2.5 h-2.5 rounded-full bg-profit opacity-70" />
          <span className="ml-2 text-xs text-muted font-mono">
            railway &middot; /logs
          </span>
          <div className="ml-auto flex items-center gap-3">
            {freshnessText && (
              <span className="text-[10px] text-muted font-mono">
                updated {freshnessText}
              </span>
            )}
            {!error && !noLogs && (
              <span className="flex items-center gap-1 text-xs text-profit font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
                live
              </span>
            )}
          </div>
        </div>

        {/* Pinned status bar */}
        {!noLogs && !error && (
          <div
            className="flex items-center gap-4 px-4 py-1.5 text-[10px] font-mono border-b"
            style={{ borderColor: "#1A2030", backgroundColor: "rgba(15,23,42,0.5)" }}
          >
            {lastHeartbeat && (
              <span className="text-muted">
                <Activity size={9} className="inline mr-1" style={{ color: heartbeatAge > 10 * 60_000 ? "#EF4444" : "#22C55E" }} />
                HB: {lastHeartbeat.timestamp ? (() => {
                  const ms = Date.now() - new Date(lastHeartbeat.timestamp!).getTime();
                  return ms < 60_000 ? `${Math.floor(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m`;
                })() : "?"} ago
              </span>
            )}
            {lastError && (
              <span style={{ color: "#EF4444" }}>
                Last error: {lastError.message.slice(0, 60)}{lastError.message.length > 60 ? "..." : ""}
              </span>
            )}
            {risks.length > 0 && (
              <span className="flex items-center gap-1" style={{ color: "#F59E0B" }}>
                <AlertTriangle size={9} />
                {risks.join(" | ")}
              </span>
            )}
          </div>
        )}

        {/* Log output */}
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto p-4 font-mono text-xs leading-relaxed"
          style={{ height: 320, color: "#22C55E", backgroundColor: "#050810" }}
        >
          {isLoading && noLogs && (
            <p className="text-muted animate-pulse">Connecting to logs endpoint...</p>
          )}

          {error && (
            <div>
              <p style={{ color: "#EF4444" }}>
                &#10007; Could not connect to logs endpoint
              </p>
              <p className="text-muted mt-2">
                The backend may be starting up or unreachable.
              </p>
            </div>
          )}

          {!error && noLogs && !isLoading && (
            <p className="text-muted">No log entries returned from /logs.</p>
          )}

          {!error && filteredLogs.length === 0 && !noLogs && !isLoading && (
            <p className="text-muted">No logs match current filters.</p>
          )}

          {!error &&
            filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-2 hover:bg-white/[0.02] px-1 -mx-1 rounded">
                <span className="text-muted select-none w-7 text-right shrink-0">
                  {i + 1}
                </span>
                <span
                  className="shrink-0 w-12 text-center text-[10px] font-bold rounded px-1 py-px"
                  style={{
                    color: EVENT_COLORS[log.eventType],
                    backgroundColor: EVENT_COLORS[log.eventType] + "15",
                  }}
                >
                  {EVENT_LABELS[log.eventType]}
                </span>
                {log.asset && (
                  <span className="shrink-0 text-[10px] font-bold text-muted">
                    [{log.asset}]
                  </span>
                )}
                <span style={{ color: EVENT_COLORS[log.eventType] }}>
                  {log.timestamp && (
                    <span className="text-muted mr-2">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                  {log.message}
                </span>
              </div>
            ))}
        </div>

        {/* Footer bar */}
        <div
          className="px-4 py-1.5 border-t flex items-center justify-between"
          style={{ borderColor: "#1A2030" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono" style={{ color: "#374151" }}>
              Auto-refresh &middot; 5s
            </span>
            <span className="text-xs font-mono" style={{ color: "#374151" }}>
              Source: GET /logs
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!noLogs && (
              <span className="text-xs font-mono" style={{ color: "#374151" }}>
                {filteredLogs.length}/{logs.length} lines
                {logsMeta.count > logs.length && (
                  <span className="opacity-50 ml-1">({logsMeta.count} total on backend)</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
