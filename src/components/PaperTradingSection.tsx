import React from "react";
import { FlaskConical } from "lucide-react";

interface PaperTradingSectionProps {
  labels: string[];
  children: React.ReactNode;
}

export default function PaperTradingSection({
  labels,
  children,
}: PaperTradingSectionProps) {
  const childArray = React.Children.toArray(children);

  return (
    <div>
      {/* Divider + header */}
      <div className="relative my-4">
        <div
          className="absolute inset-0 flex items-center"
          aria-hidden="true"
        >
          <div
            className="w-full border-t"
            style={{ borderColor: "rgba(245,158,11,0.25)" }}
          />
        </div>
        <div className="relative flex justify-center">
          <span
            className="px-4 text-xs font-mono tracking-widest uppercase"
            style={{ backgroundColor: "#0B0F1A", color: "rgba(245,158,11,0.4)" }}
          >
            section divider
          </span>
        </div>
      </div>

      {/* Section header */}
      <div
        className="rounded-lg px-6 py-5 mb-8 flex items-start justify-between"
        style={{
          backgroundColor: "rgba(245,158,11,0.05)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <FlaskConical size={20} style={{ color: "#F59E0B" }} />
          <div>
            <h2
              className="text-lg font-semibold tracking-wider uppercase"
              style={{ color: "#F59E0B" }}
            >
              Paper Trading
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(245,158,11,0.6)" }}>
              Simulated trades · No real capital at risk
            </p>
          </div>
        </div>
        <span
          className="font-mono text-xs px-2.5 py-1 rounded mt-0.5"
          style={{
            backgroundColor: "rgba(245,158,11,0.15)",
            color: "#F59E0B",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          SIM MODE
        </span>
      </div>

      {/* Labeled children */}
      <div className="space-y-10">
        {childArray.map((child, i) => (
          <div key={i}>
            {labels[i] && (
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "rgba(245,158,11,0.7)" }}
              >
                {labels[i]}
              </p>
            )}
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
