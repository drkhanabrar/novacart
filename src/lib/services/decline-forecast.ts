// FILE: src/lib/services/decline-forecast.ts
//
// The original lifecycle rule was reactive: delist after 14 days with zero
// orders, or after two consecutive low research scores. By the time either
// fires, the money is already spent.
//
// This module asks the forward-looking question instead — do the leading
// indicators suggest this product will underperform over the next few weeks —
// and writes the answer down as a falsifiable prediction so the claim can be
// graded later.
//
// It is deliberately transparent: an additive driver list mapped through a
// logistic function, not an opaque model. Every forecast can be read back as a
// sentence explaining which signals moved it.

import { prisma } from "@/lib/prisma";
import {
  getPerformanceTrend,
  getCatalogBenchmarks,
  getProductPerformance,
  relativeToBenchmark,
  type PerformanceTrend,
} from "./performance-intelligence";
import { recordPrediction } from "./nova-decisions";
import { getActiveWeights } from "./nova-weights";
import { round, MIN_IMPRESSIONS_FOR_RATE } from "./nova-contracts";

export const DEFAULT_HORIZON_DAYS = Number(
  process.env.NOVA_DECLINE_HORIZON_DAYS || 28,
);

export interface DeclineDriver {
  signal: string;
  /// Positive contributions push toward decline, negative away from it.
  contribution: number;
  detail: string;
}

export interface DeclineForecast {
  productId: string;
  /// 0..1. Null when there is not enough evidence to make any claim at all.
  probability: number | null;
  confidence: number;
  horizonDays: number;
  drivers: DeclineDriver[];
  /// INTERNAL when first-party behaviour carried the forecast, EXTERNAL when
  /// only market signals were available, MIXED when both contributed.
  basis: "INTERNAL" | "EXTERNAL" | "MIXED" | "INSUFFICIENT";
  summary: string;
  modelVersion: string;
  features: Record<string, unknown>;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

interface ExternalSnapshot {
  marketScore: number | null;
  trendVelocity: number | null;
  competitionScore: number | null;
  marginPercent: number | null;
}

function readExternalSnapshot(
  intelligence: {
    marketScore: unknown;
    competitionScore: unknown;
    marginPercent: unknown;
    evidence: unknown;
  } | null,
): ExternalSnapshot {
  if (!intelligence) {
    return {
      marketScore: null,
      trendVelocity: null,
      competitionScore: null,
      marginPercent: null,
    };
  }

  const evidence = intelligence.evidence as
    | { market?: { trendVelocity?: unknown } }
    | null;

  const velocity = Number(evidence?.market?.trendVelocity);

  return {
    marketScore:
      intelligence.marketScore === null
        ? null
        : Number(intelligence.marketScore),
    trendVelocity: Number.isFinite(velocity) ? velocity : null,
    competitionScore:
      intelligence.competitionScore === null
        ? null
        : Number(intelligence.competitionScore),
    marginPercent:
      intelligence.marginPercent === null
        ? null
        : Number(intelligence.marginPercent),
  };
}

/// Pulls the external snapshot stored on the previous forecast, giving NOVA a
/// before/after comparison without maintaining a separate history table.
async function readPreviousSnapshot(
  productId: string,
): Promise<ExternalSnapshot | null> {
  const previous = await prisma.novaPrediction.findFirst({
    where: { productId, kind: "DEMAND_DECLINE" },
    orderBy: { createdAt: "desc" },
  });

  if (!previous?.features) return null;

  const features = previous.features as Record<string, unknown>;
  const external = features.external as Record<string, unknown> | undefined;
  if (!external) return null;

  const numberOrNull = (value: unknown) =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? null
      : Number(value);

  return {
    marketScore: numberOrNull(external.marketScore),
    trendVelocity: numberOrNull(external.trendVelocity),
    competitionScore: numberOrNull(external.competitionScore),
    marginPercent: numberOrNull(external.marginPercent),
  };
}

function internalDrivers(trend: PerformanceTrend): DeclineDriver[] {
  const drivers: DeclineDriver[] = [];

  if (trend.ctrChange !== null && trend.ctrChange < -0.15) {
    drivers.push({
      signal: "ctr_decline",
      contribution: Math.min(1.2, Math.abs(trend.ctrChange) * 2.2),
      detail: `Click-through fell ${Math.round(Math.abs(trend.ctrChange) * 100)}% against the previous window.`,
    });
  }

  if (trend.addToCartChange !== null && trend.addToCartChange < -0.15) {
    drivers.push({
      signal: "add_to_cart_decline",
      contribution: Math.min(1.4, Math.abs(trend.addToCartChange) * 2.6),
      detail: `Add-to-cart rate fell ${Math.round(Math.abs(trend.addToCartChange) * 100)}%, which usually moves before revenue does.`,
    });
  }

  if (trend.conversionChange !== null && trend.conversionChange < -0.2) {
    drivers.push({
      signal: "conversion_decline",
      contribution: Math.min(1.5, Math.abs(trend.conversionChange) * 2.4),
      detail: `Conversion fell ${Math.round(Math.abs(trend.conversionChange) * 100)}%.`,
    });
  }

  if (trend.viewSlope !== null && trend.viewSlope < 0) {
    const magnitude = Math.min(1.0, Math.abs(trend.viewSlope) / 5);
    if (magnitude > 0.1) {
      drivers.push({
        signal: "traffic_slope",
        contribution: magnitude,
        detail: `Daily product views are trending down by about ${Math.abs(trend.viewSlope).toFixed(1)} per day.`,
      });
    }
  }

  // Improvement should be able to pull the forecast back down, otherwise the
  // model can only ever predict doom.
  if (trend.conversionChange !== null && trend.conversionChange > 0.2) {
    drivers.push({
      signal: "conversion_improving",
      contribution: -Math.min(1.2, trend.conversionChange * 1.8),
      detail: `Conversion improved ${Math.round(trend.conversionChange * 100)}%.`,
    });
  }

  if (trend.ctrChange !== null && trend.ctrChange > 0.2) {
    drivers.push({
      signal: "ctr_improving",
      contribution: -Math.min(0.9, trend.ctrChange * 1.5),
      detail: `Click-through improved ${Math.round(trend.ctrChange * 100)}%.`,
    });
  }

  return drivers;
}

function externalDrivers(
  current: ExternalSnapshot,
  previous: ExternalSnapshot | null,
): DeclineDriver[] {
  const drivers: DeclineDriver[] = [];

  if (current.trendVelocity !== null && current.trendVelocity < -10) {
    drivers.push({
      signal: "search_momentum_falling",
      contribution: Math.min(1.1, Math.abs(current.trendVelocity) / 45),
      detail: `Search momentum is negative at ${current.trendVelocity.toFixed(0)}%.`,
    });
  }

  if (current.trendVelocity !== null && current.trendVelocity > 15) {
    drivers.push({
      signal: "search_momentum_rising",
      contribution: -Math.min(0.8, current.trendVelocity / 60),
      detail: `Search momentum is still positive at ${current.trendVelocity.toFixed(0)}%.`,
    });
  }

  if (previous) {
    if (
      current.marketScore !== null &&
      previous.marketScore !== null &&
      previous.marketScore > 0
    ) {
      const delta =
        (current.marketScore - previous.marketScore) / previous.marketScore;
      if (delta < -0.12) {
        drivers.push({
          signal: "demand_score_eroding",
          contribution: Math.min(1.0, Math.abs(delta) * 2),
          detail: `Measured demand dropped ${Math.round(Math.abs(delta) * 100)}% since the last review.`,
        });
      }
    }

    if (
      current.competitionScore !== null &&
      previous.competitionScore !== null
    ) {
      // competitionScore is normalised so higher is a better opportunity.
      const delta = current.competitionScore - previous.competitionScore;
      if (delta < -8) {
        drivers.push({
          signal: "competition_intensifying",
          contribution: Math.min(0.9, Math.abs(delta) / 25),
          detail: `Competitive pressure increased since the last review (opportunity score ${previous.competitionScore.toFixed(0)} to ${current.competitionScore.toFixed(0)}).`,
        });
      }
    }

    if (current.marginPercent !== null && previous.marginPercent !== null) {
      const delta = current.marginPercent - previous.marginPercent;
      if (delta < -4) {
        drivers.push({
          signal: "margin_compression",
          contribution: Math.min(1.0, Math.abs(delta) / 12),
          detail: `Contribution margin compressed by ${Math.abs(delta).toFixed(1)} points.`,
        });
      }
    }
  }

  return drivers;
}

/*
 * Produces a decline probability for a single product.
 *
 * Returns probability === null rather than a fabricated number when neither
 * first-party behaviour nor external signals carry enough weight to justify a
 * claim. The lifecycle engine treats that as "keep observing", never as a
 * reason to act.
 */
export async function forecastDecline(
  productId: string,
  options: { horizonDays?: number; persist?: boolean } = {},
): Promise<DeclineForecast> {
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const { version: modelVersion } = await getActiveWeights();

  const [trend, performance, intelligence, benchmarks, previous] =
    await Promise.all([
      getPerformanceTrend(productId),
      getProductPerformance(productId, horizonDays),
      prisma.productIntelligence.findUnique({ where: { productId } }),
      getCatalogBenchmarks(),
      readPreviousSnapshot(productId),
    ]);

  const current = readExternalSnapshot(intelligence);

  const internal = trend.comparable ? internalDrivers(trend) : [];
  const external = externalDrivers(current, previous);

  const drivers = [...internal, ...external];

  const hasInternal = internal.length > 0;
  const hasExternal = external.length > 0;

  const features = {
    internal: {
      comparable: trend.comparable,
      impressions: trend.recent.impressions,
      ctrChange: trend.ctrChange,
      addToCartChange: trend.addToCartChange,
      conversionChange: trend.conversionChange,
      viewSlope: trend.viewSlope,
      unitsChange: trend.unitsChange,
      ctrVsCatalog: relativeToBenchmark(
        trend.recentRates.ctr,
        benchmarks.medianCtr,
      ),
      conversionVsCatalog: relativeToBenchmark(
        trend.recentRates.conversionRate,
        benchmarks.medianConversionRate,
      ),
    },
    external: current,
    previousExternal: previous,
    windowUnits: performance.window.unitsSold,
    windowImpressions: performance.window.impressions,
  };

  /*
   * Insufficient evidence.
   *
   * With no comparable behavioural window and no external movement, the honest
   * answer is that NOVA does not know. Guessing here is how a learning system
   * teaches itself nonsense.
   */
  if (drivers.length === 0) {
    return {
      productId,
      probability: null,
      confidence: 0,
      horizonDays,
      drivers: [],
      basis: "INSUFFICIENT",
      summary: trend.comparable
        ? "No deterioration signal in behaviour or market data."
        : `Not enough traffic yet to judge (${trend.recent.impressions} impressions in the last 14 days, ${MIN_IMPRESSIONS_FOR_RATE} needed).`,
      modelVersion,
      features,
    };
  }

  const total = drivers.reduce((sum, driver) => sum + driver.contribution, 0);

  // -1.1 intercept keeps the neutral prior below 25%: a product is presumed
  // healthy until the signals say otherwise.
  const probability = round(logistic(total - 1.1), 4);

  /*
   * Confidence is driven by how much real evidence sits behind the forecast.
   * First-party behaviour is worth more than external proxies, and both are
   * worth more than a single driver firing alone.
   */
  const sampleConfidence = Math.min(
    45,
    Math.round((trend.recent.impressions / MIN_IMPRESSIONS_FOR_RATE) * 15),
  );

  const confidence = Math.min(
    95,
    (hasInternal ? sampleConfidence : 0) +
      (hasExternal ? 20 : 0) +
      (previous ? 10 : 0) +
      Math.min(20, drivers.length * 5),
  );

  const basis: DeclineForecast["basis"] =
    hasInternal && hasExternal
      ? "MIXED"
      : hasInternal
        ? "INTERNAL"
        : "EXTERNAL";

  const leading = [...drivers]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((driver) => driver.detail)
    .join(" ");

  const summary = `${Math.round(probability * 100)}% chance of underperformance over the next ${horizonDays} days (${confidence}% confidence). ${leading}`;

  const forecast: DeclineForecast = {
    productId,
    probability,
    confidence,
    horizonDays,
    drivers,
    basis,
    summary,
    modelVersion,
    features,
  };

  if (options.persist !== false) {
    await recordPrediction({
      productId,
      kind: "DEMAND_DECLINE",
      metric: `p_decline_${horizonDays}d`,
      predictedValue: probability,
      confidence,
      horizonDays,
      modelVersion,
      features,
      rationale: summary,
    });
  }

  return forecast;
}
