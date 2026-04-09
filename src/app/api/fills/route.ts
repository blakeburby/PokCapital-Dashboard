import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "");
    const limitQuery = Number.isFinite(limit) && limit > 0 ? `?limit=${limit}` : "";
    const res = await fetch(`${RAILWAY}/fills${limitQuery}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Railway returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return NextResponse.json(data);
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json(data);
    }
    return NextResponse.json(data.slice(-limit));
  } catch {
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
