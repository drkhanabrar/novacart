// FILE: src/app/api/nova/rollup/route.ts
//
// Aggregates raw events into daily metrics and prunes expired rows.
//
// Separated from the lifecycle pass because it is cheap and should run often,
// whereas a lifecycle pass makes live calls to Trends, Reddit and the supplier
// API and should not.

import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/services/nova-auth";
import { rollupRecent } from "@/lib/services/telemetry";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const days = Number.isFinite(Number(body?.days))
      ? Math.min(14, Math.max(0, Math.floor(Number(body.days))))
      : 2;

    const result = await rollupRecent(days);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("NOVA rollup failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
