// FILE: src/lib/services/nova-contracts.ts
//
// Single source of truth for the string values stored in the NOVA tables.
// The Prisma schema deliberately stores these as String (see the comment in
// schema.prisma); these unions are what make them safe to use in code.

export const PRODUCT_EVENT_TYPES = [
  "IMPRESSION",
  "VIEW",
  "ADD_TO_CART",
  "REMOVE_FROM_CART",
  "CHECKOUT_START",
  "PURCHASE",
  "REFUND",
] as const;

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number];

export const LIFECYCLE_STATES = [
  "CANDIDATE",
  "TEST",
  "LISTED",
  "LEARNING",
  "SCALING",
  "MATURE",
  "DECLINING",
  "RETIRED",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export type DecisionKind =
  | "PUBLISH"
  | "EXPOSURE"
  | "PRICE"
  | "LIFECYCLE"
  | "DELIST"
  | "RETIRE"
  | "WEIGHT_UPDATE";

export type DecisionStatus =
  | "PROPOSED"
  | "AUTO_APPLIED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export type PredictionKind =
  | "PRODUCT_SUCCESS"
  | "DEMAND_DECLINE"
  | "UNITS"
  | "CONVERSION"
  | "MARGIN";

/*
 * Evidence quality.
 *
 * The existing market engine is careful to distinguish "we measured this" from
 * "we guessed this". The performance layer keeps the same discipline: a funnel
 * rate computed from 9 impressions is not a fact, and NOVA must never treat it
 * as one.
 */
export type EvidenceStrength = "NONE" | "WEAK" | "MODERATE" | "STRONG";

export function evidenceStrength(sampleSize: number): EvidenceStrength {
  if (sampleSize <= 0) return "NONE";
  if (sampleSize < MIN_SAMPLE_FOR_WEAK) return "NONE";
  if (sampleSize < MIN_SAMPLE_FOR_MODERATE) return "WEAK";
  if (sampleSize < MIN_SAMPLE_FOR_STRONG) return "MODERATE";
  return "STRONG";
}

/*
 * Sample-size floors.
 *
 * These are deliberately conservative. A new store generates very little
 * traffic, and the fastest way to destroy a learning system is to let it draw
 * confident conclusions from a handful of sessions.
 */
export const MIN_SAMPLE_FOR_WEAK = 30;
export const MIN_SAMPLE_FOR_MODERATE = 150;
export const MIN_SAMPLE_FOR_STRONG = 600;

/// Below this many impressions, internal funnel rates are reported as null
/// rather than as a number, so downstream code cannot silently use noise.
export const MIN_IMPRESSIONS_FOR_RATE = MIN_SAMPLE_FOR_WEAK;

/// Below this many resolved predictions, the learning engine will not move a
/// single weight. It reports what it would have done instead.
export const MIN_RESOLVED_FOR_LEARNING = 40;

export interface FunnelRates {
  /// views / impressions
  ctr: number | null;
  /// addToCarts / views
  addToCartRate: number | null;
  /// purchases / addToCarts
  cartConversion: number | null;
  /// purchases / views
  conversionRate: number | null;
  /// refunds / purchases
  refundRate: number | null;
  strength: EvidenceStrength;
  sampleSize: number;
}

export function safeRate(
  numerator: number,
  denominator: number,
  minDenominator = MIN_IMPRESSIONS_FOR_RATE,
): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator < minDenominator || denominator <= 0) return null;
  return numerator / denominator;
}

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/// UTC midnight, which is the bucket boundary used by ProductDailyMetric.
export function utcDay(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const day = utcDay(from);
  day.setUTCDate(day.getUTCDate() - days);
  return day;
}
