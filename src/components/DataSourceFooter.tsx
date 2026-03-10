"use client";

interface DataSourceFooterProps {
    endpoint: string;
    refreshInterval?: string;
    recordCount?: number | null;
    lastUpdate?: string | null;
    source?: string;
}

export default function DataSourceFooter({
    endpoint,
    refreshInterval = "5s",
    recordCount,
    lastUpdate,
    source = "Backend API",
}: DataSourceFooterProps) {
    const freshnessText = lastUpdate
        ? (() => {
            const ms = Date.now() - new Date(lastUpdate).getTime();
            if (ms < 0) return "just now";
            if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
            if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
            return `${Math.floor(ms / 3_600_000)}h ago`;
        })()
        : null;

    return (
        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted opacity-60">
            <span>{source}</span>
            <span>&middot;</span>
            <span>GET {endpoint}</span>
            <span>&middot;</span>
            <span>Refresh: {refreshInterval}</span>
            {recordCount != null && (
                <>
                    <span>&middot;</span>
                    <span>{recordCount} records</span>
                </>
            )}
            {freshnessText && (
                <>
                    <span>&middot;</span>
                    <span>Updated: {freshnessText}</span>
                </>
            )}
        </div>
    );
}
