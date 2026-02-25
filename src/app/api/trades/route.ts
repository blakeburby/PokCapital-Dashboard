import { NextResponse } from "next/server";

const RAILWAY =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://pokcapitalweb-production-82ec.up.railway.app";

export async function GET() {
  try {
    const res = await fetch(`${RAILWAY}/trades`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Railway returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach backend" },
      { status: 502 }
    );
  }
}
