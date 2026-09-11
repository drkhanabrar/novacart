// FILE: src/app/api/nova/lifecycle/route.ts
//
// Runs the lifecycle pass over the live catalogue, and applies human answers to
// retirements NOVA has proposed.
//
// The pass is intentionally reachable on demand as well as on a schedule: after
// a bad week you want to be able to ask NOVA to reassess now rather than wait
// for the cron window.

import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/services/nova-auth";
import {
  reviewAllActiveProducts,
  reviewProduct,
  resolvePendingAction,
} from "@/lib/services/product-lifecycle";
import { rollupRecent } from "@/lib/services/telemetry";
import { ensureBaselineVersion } from "@/lib/services/nova-weights";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Human approval or rejection of a proposed retirement.
    if (body?.approve && typeof body.productId === "string") {
      const result = await resolvePendingAction(
        body.productId,
        body.approve === "RETIRE",
        "ADMIN",
      );

      return NextResponse.json({ success: true, ...result });
    }

    await ensureBaselineVersion();

    /*
     * Roll up telemetry before reviewing.
     *
     * Reviewing first would judge every product against yesterday's numbers,
     * which is exactly the lag this layer exists to remove.
     */
    const rollup = await rollupRecent(2);

    if (typeof body?.productId === "string") {
      const review = await reviewProduct(body.productId);
      return NextResponse.json({ success: true, rollup, reviews: [review] });
    }

    const reviews = await reviewAllActiveProducts();

    return NextResponse.json({
      success: true,
      rollup,
      reviewed: reviews.length,
      proposals: reviews.filter(
        (review) => review.action === "RETIREMENT_PROPOSED",
      ),
      reviews,
    });
  } catch (error) {
    console.error("NOVA lifecycle pass failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
