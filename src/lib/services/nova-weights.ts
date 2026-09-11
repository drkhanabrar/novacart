// FILE: src/lib/services/nova-weights.ts
//
// Before this file existed, NOVA's scoring weights were literal numbers spread
// across nova-core.ts and nova-market-engine.ts — two copies that had already
// drifted apart from each other. A system that is supposed to learn which
// signals predict success cannot have its beliefs hardcoded in two places.
//
// The weights now live in one versioned record. The learning engine proposes
// new versions; only a version whose measured error beats the incumbent is
// promoted to ACTIVE.

import { prisma } from "@/lib/prisma";
import { round } from "./nova-contracts";

export interface NovaWeights {
  demand: number;
  trendVelocity: number;
  shoppingIntent: number;
  contentInterest: number;
  newsInterest: number;
  socialInterest: number;
  competition: number;
  margin: number;
  repeatPurchase: number;
  returnRisk: number;
  serviceRisk: number;
  operationalEase: number;
}

export const WEIGHT_KEYS = [
  "demand",
  "trendVelocity",
  "shoppingIntent",
  "contentInterest",
  "newsInterest",
  "socialInterest",
  "competition",
  "margin",
  "repeatPurchase",
  "returnRisk",
  "serviceRisk",
  "operationalEase",
] as const;

/*
 * Baseline priors.
 *
 * These reproduce the weights the market engine already used, so switching to
 * the registry does not silently change NOVA's existing behaviour on day one.
 * They are a starting point, not a belief — every one of them is meant to be
 * corrected by observed outcomes.
 */
export const DEFAULT_WEIGHTS: NovaWeights = {
  demand: 0.22,
  trendVelocity: 0.08,
  shoppingIntent: 0.08,
  contentInterest: 0.05,
  newsInterest: 0.05,
  socialInterest: 0.04,
  competition: 0.16,
  margin: 0.15,
  repeatPurchase: 0.08,
  returnRisk: 0.05,
  serviceRisk: 0.05,
  operationalEase: 0.04,
};

export const BASELINE_VERSION = "v1-baseline";

/*
 * Learning guardrails.
 *
 * A single bad quarter should not be able to convince NOVA that margin does not
 * matter. No weight may move more than MAX_STEP per learning pass, and none may
 * leave [MIN_WEIGHT, MAX_WEIGHT].
 */
export const MAX_STEP = 0.02;
export const MIN_WEIGHT = 0.01;
export const MAX_WEIGHT = 0.35;

let cache: { weights: NovaWeights; version: string; expiresAt: number } | null =
  null;

const CACHE_MS = 5 * 60 * 1000;

function coerce(raw: unknown): NovaWeights {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_WEIGHTS };

  for (const key of WEIGHT_KEYS) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }

  return normalize(out);
}

/// Weights are relative importances, so they are always renormalised to sum to
/// 1. This keeps a NOVA score comparable across model versions.
export function normalize(weights: NovaWeights): NovaWeights {
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + (weights[key] || 0), 0);

  if (!Number.isFinite(total) || total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  const out = {} as NovaWeights;
  for (const key of WEIGHT_KEYS) {
    out[key] = round(weights[key] / total, 4);
  }
  return out;
}

export function clampWeights(
  proposed: NovaWeights,
  current: NovaWeights,
): NovaWeights {
  const out = {} as NovaWeights;

  for (const key of WEIGHT_KEYS) {
    const delta = Math.max(
      -MAX_STEP,
      Math.min(MAX_STEP, proposed[key] - current[key]),
    );
    out[key] = Math.max(
      MIN_WEIGHT,
      Math.min(MAX_WEIGHT, current[key] + delta),
    );
  }

  return normalize(out);
}

/// Returns the active weight set. Falls back to the baseline whenever the
/// database is unavailable, so research runs never fail because of the registry.
export async function getActiveWeights(): Promise<{
  weights: NovaWeights;
  version: string;
}> {
  if (cache && cache.expiresAt > Date.now()) {
    return { weights: cache.weights, version: cache.version };
  }

  try {
    const active = await prisma.novaModelVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { activatedAt: "desc" },
    });

    if (active) {
      const weights = coerce(active.weights);
      cache = {
        weights,
        version: active.version,
        expiresAt: Date.now() + CACHE_MS,
      };
      return { weights, version: active.version };
    }
  } catch (error) {
    console.warn(
      "[nova-weights] Falling back to baseline weights:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return { weights: { ...DEFAULT_WEIGHTS }, version: BASELINE_VERSION };
}

export function invalidateWeightCache(): void {
  cache = null;
}

/// Creates the baseline row if the registry is empty. Safe to call repeatedly.
export async function ensureBaselineVersion(): Promise<string> {
  const existing = await prisma.novaModelVersion.findUnique({
    where: { version: BASELINE_VERSION },
  });

  if (existing) {
    if (existing.status !== "ACTIVE") {
      const anyActive = await prisma.novaModelVersion.findFirst({
        where: { status: "ACTIVE" },
      });
      if (!anyActive) {
        await prisma.novaModelVersion.update({
          where: { version: BASELINE_VERSION },
          data: { status: "ACTIVE", activatedAt: new Date() },
        });
        invalidateWeightCache();
      }
    }
    return BASELINE_VERSION;
  }

  await prisma.novaModelVersion.create({
    data: {
      version: BASELINE_VERSION,
      weights: { ...DEFAULT_WEIGHTS },
      status: "ACTIVE",
      activatedAt: new Date(),
      changeSummary:
        "Baseline priors carried over from the original hardcoded market-engine weights.",
    },
  });

  invalidateWeightCache();
  return BASELINE_VERSION;
}

export interface ScoreInputs {
  demand: number;
  trendVelocity: number;
  shoppingIntent: number;
  contentInterest: number;
  newsInterest: number;
  socialInterest: number;
  /// Already normalised so that higher means a better opportunity.
  competition: number | null;
  marginPercent: number | null;
  repeatPurchase: number;
  returnRisk: number;
  serviceRisk: number;
  operationalEase: number;
}

/*
 * Converts raw signals into the 0-100 NOVA score using the supplied weights.
 *
 * Risk signals are inverted here rather than at each call site, which is where
 * the two previous copies of this arithmetic had started to disagree.
 */
export function computeNovaScore(
  inputs: ScoreInputs,
  weights: NovaWeights,
): number {
  /*
   * `?? 0` is not sufficient here.
   *
   * Nullish coalescing does not catch NaN, so a NaN margin — which is exactly
   * what an unparsed supplier price range used to produce — passed straight
   * through and turned the whole composite score into NaN. That NaN then
   * reached a Prisma Decimal column and failed the write.
   *
   * Every input is therefore coerced through a finite check. A signal that is
   * genuinely unknown contributes nothing rather than poisoning the total.
   */
  const num = (
    value: number | null | undefined,
    fallback = 0,
  ): number =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;

  const marginContribution = Math.max(
    0,
    Math.min(100, num(inputs.marginPercent) * 3),
  );

  const total =
    num(inputs.demand) * weights.demand +
    num(inputs.trendVelocity) * weights.trendVelocity +
    num(inputs.shoppingIntent) * weights.shoppingIntent +
    num(inputs.contentInterest) * weights.contentInterest +
    num(inputs.newsInterest) * weights.newsInterest +
    num(inputs.socialInterest) * weights.socialInterest +
    num(inputs.competition) * weights.competition +
    marginContribution * weights.margin +
    num(inputs.repeatPurchase) * weights.repeatPurchase +
    (100 - num(inputs.returnRisk)) * weights.returnRisk +
    (100 - num(inputs.serviceRisk)) * weights.serviceRisk +
    num(inputs.operationalEase) * weights.operationalEase;

  // Final guard: a score must always be a usable number.
  if (!Number.isFinite(total)) return 0;

  return Math.round(Math.max(0, Math.min(100, total)));
}
