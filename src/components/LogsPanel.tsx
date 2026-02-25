"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { getLogs } from "@/lib/api";
import { Terminal, RefreshCw } from "lucide-react";

export default function LogsPanel() {
  const [manualRefresh, setManualRefresh] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: logs, error, isLoading, mutate } = useSWR<string[]>(
    ["logs", manualRefresh],
    () => getLogs(),
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRefresh = () => {
    setManualRefresh((n) => n + 1);
    mutate();
  };

  const noLogs = !logs || logs.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
          <Terminal size={11} />
          Deployment Logs
        </p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-panel border border-border text-muted hover:text-text transition-colors"
        >
          <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div
        className="panel"
        style={{
          backgroundColor: "#0A0E1A",
          borderColor: "#1A2030",
          padding: 0,
          overflow: "hidden",
        }}
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
            railway · {process.env.NEXT_PUBLIC_API_BASE}/logs
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {!error && !noLogs && (
              <span className="flex items-center gap-1 text-xs text-profit font-mono">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-profit animate-pulse"
                />
                live
              </span>
            )}
          </div>
        </div>

        {/* Log output */}
        <div
          className="overflow-y-auto p-4 font-mono text-xs leading-relaxed"
          style={{
            height: 280,
            color: "#22C55E",
            backgroundColor: "#050810",
          }}
        >
          {isLoading && noLogs && (
            <p className="text-muted animate-pulse">Connecting to logs endpoint...</p>
          )}

          {error && (
            <div>
              <p style={{ color: "#EF4444" }}>
                ✗ Could not connect to logs endpoint
              </p>
              <p className="text-muted mt-2">
                The backend does not expose a /logs route yet.
              </p>
              <p className="text-muted mt-1">
                To enable logs, add this endpoint to{" "}
                <span style={{ color: "#3B82F6" }}>server.js</span>:
              </p>
              <pre
                className="mt-3 text-xs leading-relaxed"
                style={{ color: "#6B7280" }}
              >{`fastify.get('/logs', async (req, reply) => {
  return { logs: recentLogs }
})`}</pre>
            </div>
          )}

          {!error && noLogs && !isLoading && (
            <p className="text-muted">No log entries returned from /logs.</p>
          )}

          {!error && !noLogs &&
            logs!.map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-muted select-none w-7 text-right shrink-0">
                  {i + 1}
                </span>
                <span
                  style={{
                    color: line.toLowerCase().includes("error")
                      ? "#EF4444"
                      : line.toLowerCase().includes("warn")
                      ? "#F59E0B"
                      : line.toLowerCase().includes("trade")
                      ? "#3B82F6"
                      : "#22C55E",
                  }}
                >
                  {line}
                </span>
              </div>
            ))}

          <div ref={bottomRef} />
        </div>

        {/* Footer bar */}
        <div
          className="px-4 py-1.5 border-t flex items-center justify-between"
          style={{ borderColor: "#1A2030" }}
        >
          <span className="text-xs font-mono" style={{ color: "#374151" }}>
            Auto-refresh · 5s
          </span>
          {!noLogs && (
            <span className="text-xs font-mono" style={{ color: "#374151" }}>
              {logs!.length} lines
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
