// FILE: src/lib/services/learning-engine.ts
//
// This is the part that was missing entirely. NOVA scored products, published
// them, and then never found out whether it had been right — so the weights it
// scored with could never improve.
//
// The loop implemented here:
//
//   prediction -> decision -> reality -> error -> weight proposal -> promotion
//
// Two properties matter more than sophistication:
//
// 1. It refuses to learn from too little. Below MIN_RESOLVED_FOR_LEARNING the
//    engine reports what it *would* have changed and changes nothing. Fitting a
//    twelve-weight model to nine sales is not learning, it is superstition.
//
// 2. A new weight set is never trusted on theory. It is scored against the same
//    historical sample as the incumbent and only promoted if it ranks real
//    outcomes better.

import { prisma } from "@/lib/prisma";
import {
  getActiveWeights,
  clampWeights,
  normalize,
  invalidateWeightCache,
  computeNovaScore,
  WEIGHT_KEYS,
  type NovaWeights,
  type ScoreInputs,
} from "./nova-weights";
import { recordDecision, resolvePrediction, abandonPrediction } from "./nova-decisions";
import { getProductPerformance } from "./performance-intelligence";
import { MIN_RESOLVED_FOR_LEARNING, round } from "./nova-contracts";

export interface ResolutionSummary {
  resolved: number;
  abandoned: number;
  stillPending: number;
  details: Array<{
    predictionId: string;
    kind: string;
    predicted: number;
    actual: number;
    error: number;
    correct: boolean | null;
  }>;
}

/*
 * Grades every prediction whose horizon has elapsed.
 *
 * DEMAND_DECLINE is a probability, so it is graded with a Brier component
 * (squared error against the 0/1 truth) and a hit/miss verdict at the 0.5 mark.
 * PRODUCT_SUCCESS is a unit count, graded by absolute error.
 */
export async function resolveDuePredictions(): Promise<ResolutionSummary> {
  const due = await prisma.novaPrediction.findMany({
    where: { status: "PENDING", resolvesAt: { lte: new Date() } },
    include: { product: { select: { id: true, isActive: true } } },
    take: 500,
  });

  const details: ResolutionSummary["details"] = [];
  let abandoned = 0;

  for (const prediction of due) {
    if (!prediction.productId || !prediction.product) {
      await abandonPrediction(
        prediction.id,
        "Product no longer exists, so this prediction can never be graded.",
      );
      abandoned += 1;
      continue;
    }

    const performance = await getProductPerformance(
      prediction.productId,
      prediction.horizonDays,
    );

    const predicted = Number(prediction.predictedValue);

    if (prediction.kind === "DEMAND_DECLINE") {
      /*
       * Ground truth for "did it decline": no units and materially less
       * engagement than the impressions it received, or the product having been
       * retired during the horizon.
       */
      const retired = !prediction.product.isActive;
      const noSales = performance.window.unitsSold === 0;
      const starved = performance.window.views === 0;

      if (performance.window.impressions === 0 && !retired) {
        await abandonPrediction(
          prediction.id,
          "No exposure during the horizon, so the forecast cannot be fairly graded.",
        );
        abandoned += 1;
        continue;
      }

      const declined = retired || (noSales && starved) ? 1 : noSales ? 0.5 : 0;
      const error = round((predicted - declined) ** 2, 4);
      const correct = Math.abs(predicted - declined) < 0.5;

      await resolvePrediction(prediction.id, {
        actualValue: declined,
        error,
        correct,
        sampleSize: performance.window.impressions,
        notes: `${performance.window.unitsSold} units, ${performance.window.views} views, ${performance.window.impressions} impressions over ${prediction.horizonDays} days.`,
      });

      details.push({
        predictionId: prediction.id,
        kind: prediction.kind,
        predicted,
        actual: declined,
        error,
        correct,
      });
      continue;
    }

    // PRODUCT_SUCCESS and other count-valued predictions.
    const actual = performance.window.unitsSold;
    const error = round(actual - predicted, 4);

    await resolvePrediction(prediction.id, {
      actualValue: actual,
      error,
      correct: null,
      sampleSize: performance.window.impressions,
      notes: `${actual} units against a predicted ${predicted}.`,
    });

    details.push({
      predictionId: prediction.id,
      kind: prediction.kind,
      predicted,
      actual,
      error,
      correct: null,
    });
  }

  const stillPending = await prisma.novaPrediction.count({
    where: { status: "PENDING" },
  });

  return {
    resolved: details.length,
    abandoned,
    stillPending,
    details,
  };
}

/// Maps a stored feature vector back onto the named weight signals.
function featuresToScoreInputs(
  features: Record<string, unknown>,
): ScoreInputs | null {
  const signals = features.signals as Record<string, unknown> | undefined;
  if (!signals) return null;

  const num = (key: string): number => {
    const value = Number(signals[key]);
    return Number.isFinite(value) ? value : 0;
  };

  const numOrNull = (key: string): number | null => {
    const value = Number(signals[key]);
    return Number.isFinite(value) ? value : null;
  };

  return {
    demand: num("demand"),
    trendVelocity: num("trendVelocity"),
    shoppingIntent: num("shoppingIntent"),
    contentInterest: num("contentInterest"),
    newsInterest: num("newsInterest"),
    socialInterest: num("socialInterest"),
    competition: numOrNull("competition"),
    marginPercent: numOrNull("marginPercent"),
    repeatPurchase: num("repeatPurchase"),
    returnRisk: num("returnRisk"),
    serviceRisk: num("serviceRisk"),
    operationalEase: num("operationalEase"),
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let varX = 0;
  let varY = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return numerator / Math.sqrt(varX * varY);
}

/// Rank correlation between predicted scores and realised outcomes. Higher is
/// better; this is the metric a candidate weight set has to beat.
function rankQuality(scores: number[], outcomes: number[]): number {
  return pearson(scores, outcomes);
}

export interface LearningReport {
  evaluated: number;
  applied: boolean;
  reason: string;
  activeVersion: string;
  proposedVersion?: string;
  incumbentQuality?: number;
  proposedQuality?: number;
  signalCorrelations?: Record<string, number>;
  proposedWeights?: NovaWeights;
}

/*
 * Learns from resolved PRODUCT_SUCCESS predictions.
 *
 * The method is intentionally simple and explainable: for each signal, measure
 * how strongly its value at publish time correlated with units actually sold,
 * then move that signal's weight toward its correlation. The step size is
 * capped in nova-weights so no single pass can rewrite NOVA's priors.
 */
export async function evaluateAndLearn(
  options: { dryRun?: boolean } = {},
): Promise<LearningReport> {
  const { weights: activeWeights, version: activeVersion } =
    await getActiveWeights();

  const resolved = await prisma.novaPrediction.findMany({
    where: { kind: "PRODUCT_SUCCESS", status: "RESOLVED" },
    include: { outcome: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const samples: Array<{ inputs: ScoreInputs; outcome: number }> = [];

  for (const prediction of resolved) {
    if (!prediction.outcome || !prediction.features) continue;

    const inputs = featuresToScoreInputs(
      prediction.features as Record<string, unknown>,
    );

    if (!inputs) continue;

    samples.push({
      inputs,
      outcome: Number(prediction.outcome.actualValue),
    });
  }

  if (samples.length < MIN_RESOLVED_FOR_LEARNING) {
    return {
      evaluated: samples.length,
      applied: false,
      activeVersion,
      reason: `Holding the current weights. ${samples.length} graded outcomes are available and ${MIN_RESOLVED_FOR_LEARNING} are required — fitting twelve weights to fewer than that would fit noise, not demand.`,
    };
  }

  const outcomes = samples.map((sample) => sample.outcome);

  const correlations = {} as Record<string, number>;
  const proposed = { ...activeWeights } as NovaWeights;

  for (const key of WEIGHT_KEYS) {
    const series = samples.map((sample) => {
      switch (key) {
        case "competition":
          return sample.inputs.competition ?? 0;
        case "margin":
          return sample.inputs.marginPercent ?? 0;
        case "returnRisk":
          return 100 - sample.inputs.returnRisk;
        case "serviceRisk":
          return 100 - sample.inputs.serviceRisk;
        case "demand":
          return sample.inputs.demand;
        case "trendVelocity":
          return sample.inputs.trendVelocity;
        case "shoppingIntent":
          return sample.inputs.shoppingIntent;
        case "contentInterest":
          return sample.inputs.contentInterest;
        case "newsInterest":
          return sample.inputs.newsInterest;
        case "socialInterest":
          return sample.inputs.socialInterest;
        case "repeatPurchase":
          return sample.inputs.repeatPurchase;
        case "operationalEase":
          return sample.inputs.operationalEase;
        default:
          return 0;
      }
    });

    const correlation = round(pearson(series, outcomes), 4);
    correlations[key] = correlation;

    /*
     * Target importance is the positive part of the correlation. A signal that
     * anti-correlates with success is pushed toward the floor rather than given
     * a negative weight, which would make the composite score unreadable.
     */
    proposed[key] = Math.max(0.001, correlation > 0 ? correlation : 0.001);
  }

  const candidate = clampWeights(normalize(proposed), activeWeights);

  const incumbentScores = samples.map((sample) =>
    computeNovaScore(sample.inputs, activeWeights),
  );

  const candidateScores = samples.map((sample) =>
    computeNovaScore(sample.inputs, candidate),
  );

  const incumbentQuality = round(rankQuality(incumbentScores, outcomes), 4);
  const proposedQuality = round(rankQuality(candidateScores, outcomes), 4);

  const improvement = proposedQuality - incumbentQuality;

  // A margin is required so noise alone cannot trigger a promotion.
  const meaningfullyBetter = improvement > 0.02;

  const version = `v${Date.now().toString(36)}`;

  const changeSummary = WEIGHT_KEYS.filter(
    (key) => Math.abs(candidate[key] - activeWeights[key]) >= 0.005,
  )
    .map(
      (key) =>
        `${key} ${activeWeights[key].toFixed(3)} to ${candidate[key].toFixed(3)}`,
    )
    .join("; ");

  if (options.dryRun || !meaningfullyBetter) {
    if (!options.dryRun) {
      await prisma.novaModelVersion.create({
        data: {
          version,
          weights: candidate as unknown as object,
          status: "SHADOW",
          parentVersion: activeVersion,
          evaluationError: proposedQuality,
          resolvedSamples: samples.length,
          changeSummary:
            changeSummary || "No weight moved by more than the noise floor.",
        },
      });
    }

    return {
      evaluated: samples.length,
      applied: false,
      activeVersion,
      proposedVersion: options.dryRun ? undefined : version,
      incumbentQuality,
      proposedQuality,
      signalCorrelations: correlations,
      proposedWeights: candidate,
      reason: options.dryRun
        ? "Dry run — nothing was written."
        : `Kept ${activeVersion}. The proposed weights ranked past outcomes at ${proposedQuality} against the incumbent's ${incumbentQuality}, which is not a large enough improvement to justify changing how every future product is scored.`,
    };
  }

  await prisma.$transaction([
    prisma.novaModelVersion.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "RETIRED" },
    }),
    prisma.novaModelVersion.create({
      data: {
        version,
        weights: candidate as unknown as object,
        status: "ACTIVE",
        parentVersion: activeVersion,
        evaluationError: proposedQuality,
        resolvedSamples: samples.length,
        activatedAt: new Date(),
        changeSummary,
      },
    }),
  ]);

  invalidateWeightCache();

  await recordDecision({
    kind: "WEIGHT_UPDATE",
    subjectType: "MODEL",
    subjectId: version,
    status: "AUTO_APPLIED",
    summary: `Promoted weight version ${version} over ${activeVersion}`,
    rationale: `Ranked ${samples.length} graded outcomes at ${proposedQuality} against the incumbent's ${incumbentQuality}. ${changeSummary}`,
    inputs: { correlations, weights: candidate, samples: samples.length },
    modelVersion: version,
    confidence: Math.min(90, Math.round(samples.length / 5)),
  });

  return {
    evaluated: samples.length,
    applied: true,
    activeVersion: version,
    proposedVersion: version,
    incumbentQuality,
    proposedQuality,
    signalCorrelations: correlations,
    proposedWeights: candidate,
    reason: `Promoted ${version}. ${changeSummary}`,
  };
}

/// Convenience wrapper for the scheduled job: grade, then learn.
export async function runLearningPass(options: { dryRun?: boolean } = {}) {
  const resolution = await resolveDuePredictions();
  const learning = await evaluateAndLearn(options);
  return { resolution, learning };
}
