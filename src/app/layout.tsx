import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POK Capital | Trade Dashboard",
  description: "Modified Black-Scholes quant trade log — Kalshi binary contracts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0A0B0D", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
