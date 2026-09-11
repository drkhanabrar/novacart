// FILE: src/app/api/nova/track/route.ts
//
// Ingestion point for storefront behaviour. This is the only unauthenticated
// write endpoint in the application, so it is deliberately narrow:
//
//  - only the event types in PRODUCT_EVENT_TYPES are accepted
//  - PURCHASE and REFUND are rejected outright; a forged purchase would poison
//    every conversion rate and every model version trained on it, so those are
//    written from server actions only
//  - product ids are validated against the catalogue before anything is stored
//  - a per-IP budget caps how much any one client can write
//
// Failures return 204 rather than an error. Telemetry must never produce a
// visible fault on a storefront page.

import { NextResponse } from "next/server";
import { recordEvents, MAX_EVENTS_PER_BATCH } from "@/lib/services/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Server-authoritative event types. Anything here is ignored if a client sends it.
const SERVER_ONLY = new Set(["PURCHASE", "REFUND"]);

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = Number(
  process.env.NOVA_TRACK_RATE_LIMIT || 60,
);

/*
 * In-memory limiter.
 *
 * On serverless this is per-instance and therefore approximate. It is still
 * worth having: it costs nothing, it stops an accidental render loop from
 * writing thousands of rows, and it needs no external store to maintain, which
 * matters while the project is running entirely on free infrastructure.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

function overBudget(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });

    // Opportunistic cleanup so the map cannot grow without bound.
    if (buckets.size > 5000) {
      for (const [id, entry] of buckets) {
        if (entry.resetAt < now) buckets.delete(id);
      }
    }

    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  try {
    if (overBudget(clientKey(request))) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json().catch(() => null)) as {
      events?: unknown;
      anonId?: unknown;
      sessionId?: unknown;
    } | null;

    if (!body || !Array.isArray(body.events)) {
      return new NextResponse(null, { status: 204 });
    }

    const events = body.events
      .slice(0, MAX_EVENTS_PER_BATCH)
      .filter(
        (event): event is { productId: string; type: string } =>
          Boolean(event) &&
          typeof event === "object" &&
          typeof (event as { productId?: unknown }).productId === "string" &&
          typeof (event as { type?: unknown }).type === "string" &&
          !SERVER_ONLY.has((event as { type: string }).type),
      );

    if (events.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    const result = await recordEvents(events, {
      anonId: typeof body.anonId === "string" ? body.anonId : null,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    });

    return NextResponse.json(
      { accepted: result.accepted },
      { status: 202 },
    );
  } catch (error) {
    console.error("[nova/track] Ingestion failed:", error);
    return new NextResponse(null, { status: 204 });
  }
}
