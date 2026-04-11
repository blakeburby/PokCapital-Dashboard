import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }
  try {
    const searchParams = new URL(req.url).searchParams;
    const limit = Number(searchParams.get("limit") ?? "");
    const window = searchParams.get("window");
    const params = new URLSearchParams();
    if (Number.isFinite(limit) && limit > 0) params.set("limit", String(limit));
    if (window) params.set("window", window);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const res = await fetch(`${RAILWAY}/fills${query}`, { cache: "no-store" });
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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
