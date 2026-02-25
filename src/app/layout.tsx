import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokCapital | Algorithm Monitor",
  description: "Live dashboard for the Unified Monte Carlo Trading Algorithm",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0B0F1A", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
