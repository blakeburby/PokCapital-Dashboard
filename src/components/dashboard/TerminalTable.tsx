"use client";

import type { ReactNode } from "react";

export type TerminalTone = "green" | "amber" | "red" | "blue" | "violet" | "gray";

export function tonePalette(tone: TerminalTone): { color: string; background: string; border: string } {
  if (tone === "green") return { color: "#22C55E", background: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.22)" };
  if (tone === "amber") return { color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.22)" };
  if (tone === "red") return { color: "#EF4444", background: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.22)" };
  if (tone === "blue") return { color: "#38BDF8", background: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.22)" };
  if (tone === "violet") return { color: "#8B5CF6", background: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.22)" };
  return { color: "#94A3B8", background: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.16)" };
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: TerminalTone;
}) {
  const palette = tonePalette(tone);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]"
      style={{
        color: palette.color,
        backgroundColor: palette.background,
        border: `1px solid ${palette.border}`,
      }}
    >
      {label}
    </span>
  );
}

export function TerminalPanel({
  kicker,
  title,
  subtitle,
  actions,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: "rgba(15,17,23,0.78)",
        borderColor: "rgba(51,65,85,0.72)",
      }}
    >
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>{kicker}</p>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function TerminalTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl border"
      style={{
        borderColor: "rgba(51,65,85,0.7)",
        backgroundColor: "rgba(2,6,23,0.34)",
      }}
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr style={{ backgroundColor: "rgba(15,23,42,0.74)" }}>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap border-b px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-muted"
                style={{ borderColor: "rgba(51,65,85,0.5)" }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TerminalRow({
  tone = "gray",
  children,
}: {
  tone?: TerminalTone;
  children: ReactNode;
}) {
  const palette = tonePalette(tone);
  return (
    <tr
      style={{
        boxShadow: `inset 2px 0 0 ${palette.border}`,
      }}
    >
      {children}
    </tr>
  );
}

export function TerminalCell({
  children,
  align = "left",
  strong = false,
  tone,
  mono = false,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  strong?: boolean;
  tone?: TerminalTone;
  mono?: boolean;
}) {
  const palette = tone ? tonePalette(tone) : null;
  return (
    <td
      className={`border-b px-3 py-2 align-top ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${mono ? "font-mono" : ""}`}
      style={{
        borderColor: "rgba(51,65,85,0.3)",
        color: palette?.color ?? (strong ? "#E2E8F0" : "#94A3B8"),
        fontWeight: strong ? 600 : 400,
      }}
    >
      {children}
    </td>
  );
}

