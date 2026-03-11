import { NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET() {
  if (!RAILWAY) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_BASE not set", latencyMs: null },
      { status: 500 }
    );
  }
  try {
    const start = Date.now();
    const res = await fetch(`${RAILWAY}/status`, { cache: "no-store" });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, latencyMs },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({ ...data, latencyMs });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach backend", latencyMs: null },
      { status: 502 }
    );
  }
}
