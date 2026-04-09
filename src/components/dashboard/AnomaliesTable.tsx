"use client";

import { StatusPill, TerminalCell, TerminalPanel, TerminalRow, TerminalTable, type TerminalTone } from "@/components/dashboard/TerminalTable";

interface AnomalyRow {
  alert: string;
  value: number;
  tone: TerminalTone;
  sub: string;
  impact: string;
}

export default function AnomaliesTable({
  rows,
  windowLabel,
}: {
  rows: AnomalyRow[];
  windowLabel: string;
}) {
  return (
    <TerminalPanel
      kicker="Anomalies"
      title="Active operator warnings"
      subtitle={`Compressed warnings for ${windowLabel.toLowerCase()} so the raw tails can stay secondary.`}
    >
      <TerminalTable columns={["Alert", "Count", "Severity", "Impact", "Note"]}>
        {rows.map((row) => (
          <TerminalRow key={row.alert} tone={row.tone}>
            <TerminalCell strong>{row.alert}</TerminalCell>
            <TerminalCell align="right" mono strong tone={row.tone}>{row.value.toLocaleString("en-US")}</TerminalCell>
            <TerminalCell><StatusPill label={row.tone === "green" ? "ok" : row.tone === "amber" ? "warn" : "critical"} tone={row.tone} /></TerminalCell>
            <TerminalCell>{row.impact}</TerminalCell>
            <TerminalCell>{row.sub}</TerminalCell>
          </TerminalRow>
        ))}
      </TerminalTable>
    </TerminalPanel>
  );
}

