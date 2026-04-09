import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET() {
  if (!RAILWAY) {
    return NextResponse.json({ items: [], error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }

  try {
    const res = await fetch(`${RAILWAY}/alert-preferences`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ items: [], error: `Backend returned ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ items: Array.isArray(data?.items) ? data.items : [] });
  } catch {
    return NextResponse.json({ items: [], error: "Failed to reach backend" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ item: null, error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${RAILWAY}/alert-preferences`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ item: null }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ item: null, error: "Failed to update alert preferences" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!RAILWAY) {
    return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }

  try {
    const key = new URL(req.url).searchParams.get("key");
    const query = key ? `?key=${encodeURIComponent(key)}` : "";
    const res = await fetch(`${RAILWAY}/alert-preferences${query}`, {
      method: "DELETE",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to clear alert preferences" }, { status: 502 });
  }
}
