import { NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET() {
  const empty = { logs: [] as string[], meta: { count: 0, lastTimestamp: null as string | null } };

  if (!RAILWAY) {
    return NextResponse.json({ ...empty, error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }

  try {
    const res = await fetch(`${RAILWAY}/logs`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json(empty);
    const data = await res.json();

    // Standard backend format: { logs: string[], meta: { count, lastTimestamp } }
    if (data?.logs && Array.isArray(data.logs)) {
      return NextResponse.json({
        logs: data.logs as string[],
        meta: {
          count:         Number(data.meta?.count         ?? data.logs.length),
          lastTimestamp: (data.meta?.lastTimestamp as string | null) ?? null,
        },
      });
    }

    // Legacy fallback: bare array
    if (Array.isArray(data)) {
      return NextResponse.json({ logs: data as string[], meta: { count: data.length, lastTimestamp: null } });
    }

    return NextResponse.json(empty);
  } catch {
    return NextResponse.json(empty);
  }
}
