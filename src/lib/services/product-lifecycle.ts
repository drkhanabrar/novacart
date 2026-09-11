// FILE: src/lib/services/product-lifecycle.ts
//
// Replaces the previous two-outcome rule (KEPT or DELISTED) with the lifecycle
// the NOVA architecture actually calls for:
//
//   CANDIDATE -> TEST -> LISTED -> LEARNING -> SCALING -> MATURE -> DECLINING -> RETIRED
//
// Two things changed in substance, not just in naming:
//
// 1. Exposure is now a lever. A struggling product has its merchandising weight
//    reduced first and is only retired if deterioration continues. The old code
//    went straight from "fine" to isActive: false on two noisy readings, which
//    threw the product away and left NOVA nothing to learn from.
//
// 2. Retirement is a recommendation by default. Autonomy is opt-in through
//    NOVA_AUTONOMOUS_RETIRE, and either way the decision is written to the
//    ledger with the evidence that produced it.
//
// The exported names reviewProduct / reviewAllActiveProducts are preserved so
// scripts/review-products.ts and the nova-review workflow keep working.

import { prisma } from "@/lib/prisma";
import { NovaEngine } from "./nova-core";
import { forecastDecline, type DeclineForecast } from "./decline-forecast";
import {
  getProductPerformance,
  getCatalogBenchmarks,
  relativeToBenchmark,
  type ProductPerformance,
  type CatalogBenchmarks,
} from "./performance-intelligence";
import { recordDecision } from "./nova-decisions";
import { getActiveWeights } from "./nova-weights";
import {
  type LifecycleState,
  MIN_IMPRESSIONS_FOR_RATE,
  utcDay,
} from "./nova-contracts";

/// Days a new product is protected from negative action while it gathers data.
const GRACE_DAYS = Number(process.env.NOVA_GRACE_DAYS || 14);

/// Composite NOVA score below which a product is considered commercially weak.
const LOW_SCORE = Number(process.env.NOVA_DELIST_SCORE || 42);

/// Consecutive deteriorating reviews before retirement is proposed.
const DECLINE_READINGS_NEEDED = Number(process.env.NOVA_DECLINE_READINGS || 3);

/// Decline probability above which a product is moved to DECLINING.
const DECLINE_PROBABILITY = Number(process.env.NOVA_DECLINE_THRESHOLD || 0.6);

/// When false (the default), NOVA proposes retirement and waits for a human.
const AUTONOMOUS_RETIRE = process.env.NOVA_AUTONOMOUS_RETIRE === "true";

const EXPOSURE_BY_STATE: Record<LifecycleState, number> = {
  CANDIDATE: 0,
  TEST: 45,
  LISTED: 60,
  LEARNING: 60,
  SCALING: 95,
  MATURE: 75,
  DECLINING: 25,
  RETIRED: 0,
};

export interface LifecycleReview {
  productId: string;
  productTitle: string;
  fromState: LifecycleState | null;
  toState: LifecycleState;
  exposure: number;
  action: "HELD" | "PROMOTED" | "DEMOTED" | "RETIRED" | "RETIREMENT_PROPOSED";
  reason: string;
  novaScore: number;
  declineProbability: number | null;
  /// Retained so the existing review script output keeps working.
  freshScore: number;
}

async function ensureLifecycle(productId: string) {
  const existing = await prisma.productLifecycle.findUnique({
    where: { productId },
  });

  if (existing) return existing;

  return prisma.productLifecycle.create({
    data: { productId, state: "TEST", exposure: EXPOSURE_BY_STATE.TEST },
  });
}

async function transition(
  productId: string,
  fromState: string | null,
  toState: LifecycleState,
  reason: string,
  evidence: unknown,
  exposure: number,
  pending: { action: string; reason: string } | null,
  declineReadings: number,
) {
  const now = new Date();

  await prisma.productLifecycle.update({
    where: { productId },
    data: {
      state: toState,
      previousState: fromState,
      enteredStateAt: fromState === toState ? undefined : now,
      exposure,
      lastReviewedAt: now,
      declineReadings,
      pendingAction: pending?.action ?? null,
      pendingReason: pending?.reason ?? null,
      pendingRaisedAt: pending ? now : null,
    },
  });

  if (fromState !== toState) {
    await prisma.lifecycleTransition.create({
      data: {
        productId,
        fromState,
        toState,
        actor: "NOVA",
        reason: reason.slice(0, 1000),
        evidence: JSON.parse(JSON.stringify(evidence ?? {})),
      },
    });
  }
}

/*
 * Decides the next state.
 *
 * Ordering matters. The sample-size floor and the grace period are checked
 * before any negative judgement, so a product is never punished for the store
 * not having sent it traffic yet.
 */
function decideState(input: {
  current: LifecycleState;
  ageDays: number;
  performance: ProductPerformance;
  benchmarks: CatalogBenchmarks;
  forecast: DeclineForecast;
  novaScore: number;
}): { state: LifecycleState; reason: string; deteriorating: boolean } {
  const { current, ageDays, performance, benchmarks, forecast, novaScore } =
    input;

  const units = performance.window.unitsSold;
  const impressions = performance.window.impressions;

  const conversionVsCatalog = relativeToBenchmark(
    performance.rates.conversionRate,
    benchmarks.medianConversionRate,
  );

  if (current === "RETIRED") {
    return {
      state: "RETIRED",
      reason: "Already retired.",
      deteriorating: false,
    };
  }

  // Nothing measurable yet — keep testing rather than judging.
  if (impressions < MIN_IMPRESSIONS_FOR_RATE) {
    if (ageDays >= GRACE_DAYS * 2 && impressions === 0) {
      return {
        state: "DECLINING",
        reason: `Live for ${Math.floor(ageDays)} days without a single impression. That is a merchandising problem rather than a demand problem: the product is not being shown anywhere.`,
        deteriorating: true,
      };
    }

    return {
      state: "TEST",
      reason: `Still gathering evidence — ${impressions} impressions so far, ${MIN_IMPRESSIONS_FOR_RATE} needed before performance can be judged.`,
      deteriorating: false,
    };
  }

  // Forecast deterioration, once the product has had a fair run.
  if (
    forecast.probability !== null &&
    forecast.probability >= DECLINE_PROBABILITY &&
    ageDays >= GRACE_DAYS
  ) {
    return {
      state: "DECLINING",
      reason: forecast.summary,
      deteriorating: true,
    };
  }

  // Commercially weak on the research signals despite having had exposure.
  if (novaScore < LOW_SCORE && ageDays >= GRACE_DAYS) {
    return {
      state: "DECLINING",
      reason: `Composite NOVA score of ${novaScore}/100 is below the ${LOW_SCORE} floor after ${Math.floor(ageDays)} days of exposure.`,
      deteriorating: true,
    };
  }

  // Clearly working: sells, and converts better than the rest of the catalogue.
  if (
    units >= 3 &&
    (conversionVsCatalog === null || conversionVsCatalog >= 1.1)
  ) {
    return {
      state: "SCALING",
      reason: `${units} units in the last ${performance.window.days} days${
        conversionVsCatalog === null
          ? ""
          : ` at ${conversionVsCatalog.toFixed(2)}x the catalogue median conversion`
      }. Increasing exposure.`,
      deteriorating: false,
    };
  }

  // Established and steady.
  if (units >= 1 && ageDays >= 60) {
    return {
      state: "MATURE",
      reason: `Steady performer — ${units} units over the last ${performance.window.days} days with no deterioration signal.`,
      deteriorating: false,
    };
  }

  // Has traffic, no verdict yet.
  if (units === 0) {
    return {
      state: "LEARNING",
      reason: `${impressions} impressions and ${performance.window.views} views but no sales yet. Holding exposure while funnel data accumulates.`,
      deteriorating: false,
    };
  }

  return {
    state: "LISTED",
    reason: `Performing within normal range — ${units} units, NOVA score ${novaScore}/100.`,
    deteriorating: false,
  };
}

/*
 * Reviews a single product end to end: re-evaluates market signals, reads
 * first-party performance, forecasts decline, moves the lifecycle state and
 * records the decision with its evidence.
 */
export async function reviewProduct(
  productId: string,
): Promise<LifecycleReview> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { intelligence: true },
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found.`);
  }

  const lifecycle = await ensureLifecycle(productId);
  const { version: modelVersion } = await getActiveWeights();

  const evaluation = await NovaEngine.evaluateProduct(productId);

  const [performance, benchmarks, forecast] = await Promise.all([
    getProductPerformance(productId, 28),
    getCatalogBenchmarks(),
    forecastDecline(productId),
  ]);

  const ageDays =
    (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  const currentState = lifecycle.state as LifecycleState;

  const decision = decideState({
    current: currentState,
    ageDays,
    performance,
    benchmarks,
    forecast,
    novaScore: evaluation.score,
  });

  const declineReadings = decision.deteriorating
    ? lifecycle.declineReadings + 1
    : 0;

  const confirmedDecline =
    decision.deteriorating && declineReadings >= DECLINE_READINGS_NEEDED;

  let nextState: LifecycleState = decision.state;
  let action: LifecycleReview["action"] = "HELD";
  let reason = decision.reason;
  let pending: { action: string; reason: string } | null = null;

  if (confirmedDecline) {
    reason = `${decision.reason} This is deterioration reading ${declineReadings} of ${DECLINE_READINGS_NEEDED}.`;

    if (AUTONOMOUS_RETIRE) {
      nextState = "RETIRED";
      action = "RETIRED";
    } else {
      nextState = "DECLINING";
      action = "RETIREMENT_PROPOSED";
      pending = { action: "RETIRE", reason };
    }
  } else if (decision.deteriorating) {
    action = "DEMOTED";
    reason = `${decision.reason} Reducing exposure — deterioration reading ${declineReadings} of ${DECLINE_READINGS_NEEDED} before retirement is proposed.`;
  } else if (nextState === "SCALING" && currentState !== "SCALING") {
    action = "PROMOTED";
  }

  const exposure = EXPOSURE_BY_STATE[nextState];

  const evidence = {
    novaScore: evaluation.score,
    evaluationConfidence: evaluation.confidence,
    marginPercent: evaluation.marginPercent,
    performance: performance.window,
    rates: performance.rates,
    benchmarks,
    forecast: {
      probability: forecast.probability,
      confidence: forecast.confidence,
      basis: forecast.basis,
      drivers: forecast.drivers,
    },
    ageDays: Math.floor(ageDays),
  };

  await transition(
    productId,
    currentState,
    nextState,
    reason,
    evidence,
    exposure,
    pending,
    declineReadings,
  );

  /*
   * isActive is now derived from the lifecycle rather than set directly, and
   * only RETIRED removes a product from the storefront. DECLINING products stay
   * visible at reduced exposure, which keeps the signal flowing that tells NOVA
   * whether its own forecast was right.
   */
  const shouldBeActive = nextState !== "RETIRED";

  if (product.isActive !== shouldBeActive) {
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: shouldBeActive },
    });
  }

  await prisma.productIntelligence.update({
    where: { productId },
    data: {
      consecutiveLowReadings: declineReadings,
      insights:
        `[${nextState}] ${reason} ${evaluation.intelligence.insights ?? ""}`.slice(
          0,
          4000,
        ),
    },
  });

  await recordDecision({
    kind:
      action === "RETIRED" || action === "RETIREMENT_PROPOSED"
        ? "RETIRE"
        : "LIFECYCLE",
    subjectType: "PRODUCT",
    subjectId: productId,
    productId,
    status:
      action === "RETIREMENT_PROPOSED" ? "AWAITING_APPROVAL" : "AUTO_APPLIED",
    summary: `${currentState} to ${nextState} at ${exposure}% exposure`,
    rationale: reason,
    inputs: evidence,
    modelVersion,
    confidence: evaluation.confidence,
  });

  return {
    productId,
    productTitle: product.title,
    fromState: currentState,
    toState: nextState,
    exposure,
    action,
    reason,
    novaScore: evaluation.score,
    declineProbability: forecast.probability,
    freshScore: evaluation.score,
  };
}

/*
 * Reviews the whole live catalogue.
 *
 * The pacing delay is kept deliberately: each review makes live calls to Google
 * Trends, Reddit and the supplier API, and hammering those is the quickest way
 * to be rate-limited into useless data.
 */
export async function reviewAllActiveProducts(): Promise<LifecycleReview[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results: LifecycleReview[] = [];

  for (const product of products) {
    try {
      results.push(await reviewProduct(product.id));
    } catch (error) {
      console.error("Review failed for", product.id, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return results;
}

/// Applies a human answer to a retirement NOVA proposed.
export async function resolvePendingAction(
  productId: string,
  approved: boolean,
  resolvedBy = "HUMAN",
): Promise<{ applied: boolean; state: LifecycleState }> {
  const lifecycle = await prisma.productLifecycle.findUnique({
    where: { productId },
  });

  if (!lifecycle?.pendingAction) {
    return {
      applied: false,
      state: (lifecycle?.state as LifecycleState) ?? "TEST",
    };
  }

  const nextState: LifecycleState = approved
    ? "RETIRED"
    : ((lifecycle.previousState as LifecycleState) ?? "LISTED");

  await prisma.productLifecycle.update({
    where: { productId },
    data: {
      state: nextState,
      previousState: lifecycle.state,
      enteredStateAt: new Date(),
      exposure: EXPOSURE_BY_STATE[nextState] ?? 60,
      pendingAction: null,
      pendingReason: null,
      pendingRaisedAt: null,
      declineReadings: approved ? lifecycle.declineReadings : 0,
    },
  });

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: nextState !== "RETIRED" },
  });

  await prisma.lifecycleTransition.create({
    data: {
      productId,
      fromState: lifecycle.state,
      toState: nextState,
      actor: "HUMAN",
      reason: approved
        ? `Retirement approved: ${lifecycle.pendingReason ?? ""}`.slice(0, 1000)
        : `Retirement declined; product returned to ${nextState}.`,
    },
  });

  await prisma.novaDecision.updateMany({
    where: { productId, kind: "RETIRE", status: "AWAITING_APPROVAL" },
    data: {
      status: approved ? "APPROVED" : "REJECTED",
      resolvedAt: new Date(),
      resolvedBy,
    },
  });

  return { applied: true, state: nextState };
}

/// Exposure weight per product, used by the storefront to rank what it shows.
export async function getExposureMap(): Promise<Map<string, number>> {
  const rows = await prisma.productLifecycle.findMany({
    select: { productId: true, exposure: true },
  });

  return new Map(rows.map((row) => [row.productId, row.exposure]));
}

/// Registers a freshly published product at the start of the lifecycle.
export async function startLifecycle(
  productId: string,
  reason: string,
): Promise<void> {
  const existing = await prisma.productLifecycle.findUnique({
    where: { productId },
  });

  if (existing) return;

  await prisma.productLifecycle.create({
    data: {
      productId,
      state: "TEST",
      previousState: "CANDIDATE",
      exposure: EXPOSURE_BY_STATE.TEST,
      enteredStateAt: utcDay(),
      notes: reason.slice(0, 1000),
    },
  });

  await prisma.lifecycleTransition.create({
    data: {
      productId,
      fromState: "CANDIDATE",
      toState: "TEST",
      actor: "NOVA",
      reason: reason.slice(0, 1000),
    },
  });
}
