// FILE: src/app/api/nova/learn/route.ts
//
// Grades every prediction whose horizon has elapsed, then decides whether the
// evidence justifies changing how NOVA scores future products.
//
// Defaults to a dry run. Rewriting the weights that govern every future
// publishing decision is not something a stray request should be able to do.

import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/services/nova-auth";
import { runLearningPass } from "@/lib/services/learning-engine";
import { getAccuracyByKind } from "@/lib/services/nova-decisions";
import { ensureBaselineVersion } from "@/lib/services/nova-weights";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const apply = body?.apply === true;

    await ensureBaselineVersion();

    const result = await runLearningPass({ dryRun: !apply });
    const accuracy = await getAccuracyByKind();

    return NextResponse.json({ success: true, applied: apply, ...result, accuracy });
  } catch (error) {
    console.error("NOVA learning pass failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
