"use client";

import { StatusPill, TerminalCell, TerminalPanel, TerminalRow, TerminalTable, type TerminalTone } from "@/components/dashboard/TerminalTable";

interface ExecutionStateRow {
  stage: string;
  value: number;
  tone: TerminalTone;
  sub: string;
}

export default function ExecutionStateTable({
  rows,
  windowLabel,
}: {
  rows: ExecutionStateRow[];
  windowLabel: string;
}) {
  return (
    <TerminalPanel
      kicker="Execution State"
      title="Where opportunity is being lost"
      subtitle={`Terminal view of the execution path for ${windowLabel.toLowerCase()}, from orderable workers through settled trades.`}
    >
      <TerminalTable columns={["Stage", "Current", "Signal", "Operator Note"]}>
        {rows.map((row) => (
          <TerminalRow key={row.stage} tone={row.tone}>
            <TerminalCell strong>{row.stage}</TerminalCell>
            <TerminalCell align="right" mono strong tone={row.tone}>{row.value.toLocaleString("en-US")}</TerminalCell>
            <TerminalCell><StatusPill label={row.tone === "green" ? "healthy" : row.tone === "amber" ? "watch" : row.tone === "red" ? "blocked" : "info"} tone={row.tone} /></TerminalCell>
            <TerminalCell>{row.sub}</TerminalCell>
          </TerminalRow>
        ))}
      </TerminalTable>
    </TerminalPanel>
  );
}

