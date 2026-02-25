import { NextResponse } from "next/server";

const RAILWAY =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://pokcapitalweb-production.up.railway.app";

export async function GET() {
  try {
    const res = await fetch(`${RAILWAY}/logs`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    if (Array.isArray(data)) return NextResponse.json(data);
    if (data?.logs && Array.isArray(data.logs)) return NextResponse.json(data.logs);
    return NextResponse.json([]);
  } catch {
    return NextResponse.json([]);
  }
}
