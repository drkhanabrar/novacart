// FILE: src/lib/services/performance-intelligence.ts
//
// Reads ProductDailyMetric and answers the questions the lifecycle and learning
// engines need: how is this product actually performing, is it getting better or
// worse, and is it good or bad *relative to this store* rather than relative to
// an industry benchmark that does not apply to a new catalogue.
//
// Every rate can come back null. That is the point. A product with 12
// impressions has no conversion rate, and saying so is more useful than
// returning 0.083 and letting a downstream engine treat it as fact.

import { prisma } from "@/lib/prisma";
import {
  type EvidenceStrength,
  type FunnelRates,
  evidenceStrength,
  safeRate,
  round,
  daysAgo,
  MIN_IMPRESSIONS_FOR_RATE,
} from "./nova-contracts";

export interface WindowTotals {
  impressions: number;
  views: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  unitsSold: number;
  refunds: number;
  revenueInr: number;
  days: number;
}

export interface ProductPerformance {
  productId: string;
  window: WindowTotals;
  rates: FunnelRates;
  /// Days since the product first accumulated any measurable exposure.
  daysWithData: number;
  hasAnyExposure: boolean;
}

const EMPTY_TOTALS = (days: number): WindowTotals => ({
  impressions: 0,
  views: 0,
  addToCarts: 0,
  checkoutStarts: 0,
  purchases: 0,
  unitsSold: 0,
  refunds: 0,
  revenueInr: 0,
  days,
});

function sumRows(
  rows: Array<{
    impressions: number;
    views: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    unitsSold: number;
    refunds: number;
    revenueInr: unknown;
  }>,
  days: number,
): WindowTotals {
  const totals = EMPTY_TOTALS(days);

  for (const row of rows) {
    totals.impressions += row.impressions;
    totals.views += row.views;
    totals.addToCarts += row.addToCarts;
    totals.checkoutStarts += row.checkoutStarts;
    totals.purchases += row.purchases;
    totals.unitsSold += row.unitsSold;
    totals.refunds += row.refunds;
    totals.revenueInr += Number(row.revenueInr ?? 0);
  }

  return totals;
}

export function computeRates(totals: WindowTotals): FunnelRates {
  const strength: EvidenceStrength = evidenceStrength(totals.impressions);

  return {
    ctr: safeRate(totals.views, totals.impressions),
    addToCartRate: safeRate(totals.addToCarts, totals.views, 15),
    cartConversion: safeRate(totals.purchases, totals.addToCarts, 5),
    conversionRate: safeRate(totals.purchases, totals.views, 15),
    refundRate: safeRate(totals.refunds, totals.purchases, 5),
    strength,
    sampleSize: totals.impressions,
  };
}

export async function getProductPerformance(
  productId: string,
  windowDays = 28,
): Promise<ProductPerformance> {
  const since = daysAgo(windowDays);

  const rows = await prisma.productDailyMetric.findMany({
    where: { productId, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const totals = sumRows(rows, windowDays);

  return {
    productId,
    window: totals,
    rates: computeRates(totals),
    daysWithData: rows.filter(
      (row) => row.impressions > 0 || row.views > 0 || row.purchases > 0,
    ).length,
    hasAnyExposure: totals.impressions > 0 || totals.views > 0,
  };
}

export interface PerformanceTrend {
  productId: string;
  recent: WindowTotals;
  prior: WindowTotals;
  recentRates: FunnelRates;
  priorRates: FunnelRates;
  /// Relative change, e.g. -0.4 means the metric fell 40%. Null when either
  /// window lacked the sample size to produce a rate at all.
  ctrChange: number | null;
  addToCartChange: number | null;
  conversionChange: number | null;
  unitsChange: number | null;
  /// Least-squares slope of daily views across the recent window, in views/day.
  viewSlope: number | null;
  comparable: boolean;
}

function relativeChange(
  recent: number | null,
  prior: number | null,
): number | null {
  if (recent === null || prior === null) return null;
  if (prior <= 0) return null;
  return round((recent - prior) / prior, 4);
}

/// Ordinary least-squares slope over an evenly spaced series.
export function slope(values: number[]): number | null {
  const n = values.length;
  if (n < 4) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = index - meanX;
    numerator += dx * (values[index] - meanY);
    denominator += dx * dx;
  }

  if (denominator === 0) return null;
  return round(numerator / denominator, 4);
}

/*
 * Compares the most recent window against the window immediately before it.
 *
 * This is the core input to decline prediction: NOVA should notice that CTR and
 * add-to-cart rate are sliding while the product is still selling, rather than
 * waiting for sales to stop.
 */
export async function getPerformanceTrend(
  productId: string,
  windowDays = 14,
): Promise<PerformanceTrend> {
  const recentStart = daysAgo(windowDays);
  const priorStart = daysAgo(windowDays * 2);

  const rows = await prisma.productDailyMetric.findMany({
    where: { productId, date: { gte: priorStart } },
    orderBy: { date: "asc" },
  });

  const recentRows = rows.filter((row) => row.date >= recentStart);
  const priorRows = rows.filter((row) => row.date < recentStart);

  const recent = sumRows(recentRows, windowDays);
  const prior = sumRows(priorRows, windowDays);

  const recentRates = computeRates(recent);
  const priorRates = computeRates(prior);

  const comparable =
    recent.impressions >= MIN_IMPRESSIONS_FOR_RATE &&
    prior.impressions >= MIN_IMPRESSIONS_FOR_RATE;

  return {
    productId,
    recent,
    prior,
    recentRates,
    priorRates,
    ctrChange: relativeChange(recentRates.ctr, priorRates.ctr),
    addToCartChange: relativeChange(
      recentRates.addToCartRate,
      priorRates.addToCartRate,
    ),
    conversionChange: relativeChange(
      recentRates.conversionRate,
      priorRates.conversionRate,
    ),
    unitsChange:
      prior.unitsSold > 0
        ? round((recent.unitsSold - prior.unitsSold) / prior.unitsSold, 4)
        : null,
    viewSlope: slope(recentRows.map((row) => row.views)),
    comparable,
  };
}

export interface CatalogBenchmarks {
  medianCtr: number | null;
  medianAddToCartRate: number | null;
  medianConversionRate: number | null;
  productsWithData: number;
  totalImpressions: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/*
 * Store-relative benchmarks.
 *
 * Absolute e-commerce thresholds ("a good conversion rate is 2%") are close to
 * meaningless for a store with no traffic history and no brand recognition.
 * Judging a product against the median of its own catalogue is both fairer and
 * available immediately.
 */
export async function getCatalogBenchmarks(
  windowDays = 28,
): Promise<CatalogBenchmarks> {
  const since = daysAgo(windowDays);

  const grouped = await prisma.productDailyMetric.groupBy({
    by: ["productId"],
    where: { date: { gte: since } },
    _sum: {
      impressions: true,
      views: true,
      addToCarts: true,
      purchases: true,
    },
  });

  const ctrs: number[] = [];
  const atcs: number[] = [];
  const cvrs: number[] = [];
  let totalImpressions = 0;

  for (const row of grouped) {
    const impressions = row._sum.impressions ?? 0;
    const views = row._sum.views ?? 0;
    const addToCarts = row._sum.addToCarts ?? 0;
    const purchases = row._sum.purchases ?? 0;

    totalImpressions += impressions;

    const ctr = safeRate(views, impressions);
    if (ctr !== null) ctrs.push(ctr);

    const atc = safeRate(addToCarts, views, 15);
    if (atc !== null) atcs.push(atc);

    const cvr = safeRate(purchases, views, 15);
    if (cvr !== null) cvrs.push(cvr);
  }

  return {
    medianCtr: median(ctrs),
    medianAddToCartRate: median(atcs),
    medianConversionRate: median(cvrs),
    productsWithData: ctrs.length,
    totalImpressions,
  };
}

/// Ratio of a product's rate to the catalogue median. 1.0 means typical.
export function relativeToBenchmark(
  value: number | null,
  benchmark: number | null,
): number | null {
  if (value === null || benchmark === null || benchmark <= 0) return null;
  return round(value / benchmark, 3);
}
