"use client";

import { StatusPill, TerminalPanel, tonePalette, type TerminalTone } from "@/components/dashboard/TerminalTable";

interface StatusBarItem {
  label: string;
  value: string;
  tone: TerminalTone;
}

interface StatusBarGroup {
  title: string;
  items: StatusBarItem[];
}

export default function GlobalStatusBar({
  groups,
  flags,
}: {
  groups: StatusBarGroup[];
  flags?: Array<{ label: string; tone: TerminalTone }>;
}) {
  return (
    <TerminalPanel
      kicker="Global Status"
      title="Operator trust rail"
      subtitle="Trust, market-data quality, execution readiness, and session state in one compact terminal bar."
    >
      <div className="grid gap-3 lg:grid-cols-4">
        {groups.map((group) => (
          <div
            key={group.title}
            className="rounded-xl border px-3 py-3"
            style={{
              backgroundColor: "rgba(15,23,42,0.46)",
              borderColor: "rgba(51,65,85,0.7)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{group.title}</span>
              <span className="h-px flex-1 bg-slate-800/70" />
            </div>
            <div className="grid gap-2">
              {group.items.map((item) => {
                const palette = tonePalette(item.tone);
                return (
                  <div key={`${group.title}-${item.label}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{item.label}</span>
                    <span className="truncate text-right font-mono text-sm font-semibold" style={{ color: palette.color }}>
                      {item.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {flags && flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {flags.map((flag) => (
            <StatusPill key={flag.label} label={flag.label} tone={flag.tone} />
          ))}
        </div>
      ) : null}
    </TerminalPanel>
  );
}

