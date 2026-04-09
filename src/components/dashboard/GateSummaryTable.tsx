"use client";

import { StatusPill, TerminalCell, TerminalPanel, TerminalRow, TerminalTable, type TerminalTone } from "@/components/dashboard/TerminalTable";

interface GateRow {
  gate: string;
  count: number;
  impact: string;
  tone: TerminalTone;
}

export default function GateSummaryTable({
  rows,
  windowLabel,
}: {
  rows: GateRow[];
  windowLabel: string;
}) {
  return (
    <TerminalPanel
      kicker="Live Engine"
      title="Blockers table"
      subtitle={`Explicit blocker counts for ${windowLabel.toLowerCase()}, with each gate surfaced as a row instead of a summary card.`}
    >
      <TerminalTable columns={["Gate", "Count", "Signal", "Impact"]}>
        {rows.map((row) => (
          <TerminalRow key={row.gate} tone={row.tone}>
            <TerminalCell strong>{row.gate}</TerminalCell>
            <TerminalCell align="right" mono strong tone={row.tone}>{row.count.toLocaleString("en-US")}</TerminalCell>
            <TerminalCell><StatusPill label={row.tone === "green" ? "clear" : row.tone === "red" ? "no-go" : "watch"} tone={row.tone} /></TerminalCell>
            <TerminalCell>{row.impact}</TerminalCell>
          </TerminalRow>
        ))}
      </TerminalTable>
    </TerminalPanel>
  );
}

