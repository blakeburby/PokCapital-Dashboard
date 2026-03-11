import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }
  try {
    const asset = new URL(req.url).searchParams.get("asset");
    const url = asset
      ? `${RAILWAY}/stats?asset=${encodeURIComponent(asset)}`
      : `${RAILWAY}/stats`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Railway returned ${res.status}` },
        { status: res.status }
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
