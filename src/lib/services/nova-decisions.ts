// FILE: src/lib/services/nova-decisions.ts
//
// "NOVA can make decisions without becoming a black box" only holds if every
// decision is written down with the inputs that produced it. This module is the
// single write path for that ledger.
//
// A decision that is not recorded here cannot be explained later, cannot be
// audited, and cannot be used to judge whether NOVA is actually helping.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  DecisionKind,
  DecisionStatus,
  PredictionKind,
} from "./nova-contracts";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export interface RecordDecisionInput {
  kind: DecisionKind;
  subjectType: "PRODUCT" | "CANDIDATE" | "PORTFOLIO" | "MODEL";
  subjectId: string;
  productId?: string | null;
  status?: DecisionStatus;
  actor?: "NOVA" | "HUMAN" | "SYSTEM";
  summary: string;
  rationale?: string | null;
  inputs?: unknown;
  modelVersion?: string | null;
  confidence?: number | null;
}

export async function recordDecision(input: RecordDecisionInput) {
  return prisma.novaDecision.create({
    data: {
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      productId: input.productId ?? null,
      status: input.status ?? "PROPOSED",
      actor: input.actor ?? "NOVA",
      summary: input.summary.slice(0, 500),
      rationale: input.rationale ?? null,
      inputs: input.inputs === undefined ? undefined : asJson(input.inputs),
      modelVersion: input.modelVersion ?? null,
      confidence:
        input.confidence === null || input.confidence === undefined
          ? null
          : Math.round(Math.max(0, Math.min(100, input.confidence))),
    },
  });
}

export interface RecordPredictionInput {
  productId?: string | null;
  kind: PredictionKind;
  /// Machine-readable name of the quantity, e.g. "p_decline_28d".
  metric: string;
  predictedValue: number;
  confidence: number;
  horizonDays: number;
  modelVersion: string;
  features?: unknown;
  rationale?: string | null;
}

/*
 * Writes a falsifiable claim with a resolution date.
 *
 * The learning engine later joins these against ProductDailyMetric to produce an
 * error term. Without a stored feature vector a future model could not be
 * re-scored against past situations, so `features` is worth the storage.
 */
export async function recordPrediction(input: RecordPredictionInput) {
  const resolvesAt = new Date();
  resolvesAt.setUTCDate(resolvesAt.getUTCDate() + input.horizonDays);

  return prisma.novaPrediction.create({
    data: {
      productId: input.productId ?? null,
      kind: input.kind,
      metric: input.metric,
      predictedValue: input.predictedValue,
      confidence: Math.round(Math.max(0, Math.min(100, input.confidence))),
      horizonDays: input.horizonDays,
      resolvesAt,
      modelVersion: input.modelVersion,
      features:
        input.features === undefined ? undefined : asJson(input.features),
      rationale: input.rationale ?? null,
      status: "PENDING",
    },
  });
}

export async function resolvePrediction(
  predictionId: string,
  outcome: {
    actualValue: number;
    error: number;
    correct?: boolean | null;
    sampleSize?: number;
    notes?: string | null;
  },
) {
  return prisma.$transaction([
    prisma.novaOutcome.create({
      data: {
        predictionId,
        actualValue: outcome.actualValue,
        error: outcome.error,
        correct: outcome.correct ?? null,
        sampleSize: outcome.sampleSize ?? 0,
        notes: outcome.notes ?? null,
      },
    }),
    prisma.novaPrediction.update({
      where: { id: predictionId },
      data: { status: "RESOLVED" },
    }),
  ]);
}

/// Predictions that can never be resolved (product deleted, no data ever
/// arrived) are abandoned rather than left pending forever, which would
/// otherwise quietly inflate the "we don't know yet" bucket.
export async function abandonPrediction(predictionId: string, reason: string) {
  return prisma.novaPrediction.update({
    where: { id: predictionId },
    data: { status: "ABANDONED", rationale: reason },
  });
}

export interface AccuracyReport {
  kind: string;
  resolved: number;
  meanAbsoluteError: number | null;
  /// Share of hit/miss predictions that were right. Null for continuous targets.
  hitRate: number | null;
}

/// Answers "how accurate were its previous predictions?" for the admin view.
export async function getAccuracyByKind(): Promise<AccuracyReport[]> {
  const resolved = await prisma.novaPrediction.findMany({
    where: { status: "RESOLVED" },
    include: { outcome: true },
  });

  const byKind = new Map<
    string,
    { errors: number[]; correct: number; scored: number }
  >();

  for (const prediction of resolved) {
    if (!prediction.outcome) continue;

    const bucket =
      byKind.get(prediction.kind) ?? { errors: [], correct: 0, scored: 0 };

    bucket.errors.push(Math.abs(Number(prediction.outcome.error)));

    if (prediction.outcome.correct !== null) {
      bucket.scored += 1;
      if (prediction.outcome.correct) bucket.correct += 1;
    }

    byKind.set(prediction.kind, bucket);
  }

  return Array.from(byKind.entries()).map(([kind, bucket]) => ({
    kind,
    resolved: bucket.errors.length,
    meanAbsoluteError:
      bucket.errors.length > 0
        ? bucket.errors.reduce((sum, value) => sum + value, 0) /
          bucket.errors.length
        : null,
    hitRate: bucket.scored > 0 ? bucket.correct / bucket.scored : null,
  }));
}
