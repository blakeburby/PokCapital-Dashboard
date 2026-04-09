import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }
  try {
    const searchParams = new URL(req.url).searchParams;
    const asset = searchParams.get("asset");
    const limit = Number(searchParams.get("limit") ?? "");
    const url = asset
      ? `${RAILWAY}/trades?asset=${encodeURIComponent(asset)}`
      : `${RAILWAY}/trades`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Railway returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    if (!Array.isArray(data) || !Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json(data);
    }
    return NextResponse.json(data.slice(-limit));
  } catch {
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
