import { NextRequest, NextResponse } from "next/server";

const RAILWAY = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function GET(req: NextRequest) {
  const empty = { logs: [] as string[], meta: { count: 0, lastTimestamp: null as string | null } };

  if (!RAILWAY) {
    return NextResponse.json({ ...empty, error: "NEXT_PUBLIC_API_BASE not set" }, { status: 500 });
  }

  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "");
    const limitQuery = Number.isFinite(limit) && limit > 0 ? `?limit=${limit}` : "";
    const res = await fetch(`${RAILWAY}/logs${limitQuery}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json(empty);
    const data = await res.json();

    // Standard backend format: { logs: string[], meta: { count, lastTimestamp } }
    if (data?.logs && Array.isArray(data.logs)) {
      const logs = Number.isFinite(limit) && limit > 0 ? (data.logs as string[]).slice(-limit) : (data.logs as string[]);
      return NextResponse.json({
        logs,
        meta: {
          count:         Number(data.meta?.count         ?? logs.length),
          lastTimestamp: (data.meta?.lastTimestamp as string | null) ?? null,
        },
      });
    }

    // Legacy fallback: bare array
    if (Array.isArray(data)) {
      const logs = Number.isFinite(limit) && limit > 0 ? (data as string[]).slice(-limit) : (data as string[]);
      return NextResponse.json({ logs, meta: { count: logs.length, lastTimestamp: null } });
    }

    return NextResponse.json(empty);
  } catch {
    return NextResponse.json(empty);
  }
}
