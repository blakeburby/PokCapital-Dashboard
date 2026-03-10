import { NextResponse } from "next/server";

const RAILWAY =
    process.env.NEXT_PUBLIC_API_BASE ||
    "https://pokcapitalweb-production-82ec.up.railway.app";

export async function GET() {
    try {
        const start = Date.now();
        const res = await fetch(`${RAILWAY}/health`, { cache: "no-store" });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
            return NextResponse.json(
                { status: "error", error: `Railway returned ${res.status}`, latencyMs },
                { status: res.status }
            );
        }
        const data = await res.json();
        return NextResponse.json({ ...data, latencyMs });
    } catch {
        return NextResponse.json(
            { status: "unreachable", error: "Failed to reach backend", latencyMs: null },
            { status: 502 }
        );
    }
}
