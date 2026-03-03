import { NextRequest, NextResponse } from "next/server";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export async function GET(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${KALSHI}/markets/${encodeURIComponent(ticker)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Kalshi returned ${res.status}` },
        { status: res.status }
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
}
