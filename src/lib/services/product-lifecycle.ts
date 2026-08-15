import { prisma } from "@/lib/prisma";
import { getMarketSignals, calculateDemandScore } from "./market-signals";

const MIN_ACCEPTABLE_DEMAND_SCORE = 25; // demand has genuinely dried up
const MIN_DAYS_BEFORE_SALES_JUDGED = 14; // grace period before "no sales" counts against it
const LOW_READINGS_NEEDED_TO_DELIST = 2; // require 2 in a row — Trends data is noisy between calls

export interface ReviewResult {
  productId: string;
  productTitle: string;
  action: "KEPT" | "DELISTED";
  reason: string;
  freshScore: number;
}

/**
 * Re-checks ONE product against real, current data and decides whether it
 * should stay live or be delisted (hidden, never hard-deleted).
 *
 * Two independent real signals can cause delisting:
 * 1. Demand has genuinely dropped — but only after 2 CONSECUTIVE low
 *    readings, since the free Google Trends source is noisy between calls
 *    and a single bad reading isn't reliable enough to act on alone.
 * 2. The product has had a fair chance (14+ days) and had zero real
 *    orders — this signal is stable (not noisy), so it acts immediately.
 *
 * A product with strong demand and no orders yet, before the grace period
 * ends, is NOT delisted — it just hasn't had a chance yet.
 */
export async function reviewProduct(productId: string): Promise<ReviewResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { orderItems: true, intelligence: true },
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found.`);
  }

  // 1. Real, fresh demand check (not the score from when it was published —
  // demand can genuinely change week to week)
  const signal = await getMarketSignals(product.title);
  const { overallScore, demandLevel } = calculateDemandScore(signal);

  // 2. Real sales performance
  const daysSincePublish =
    (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const totalOrders = product.orderItems.length;
  const pastGracePeriod = daysSincePublish >= MIN_DAYS_BEFORE_SALES_JUDGED;

  const demandFailedThisReading = overallScore < MIN_ACCEPTABLE_DEMAND_SCORE;
  const previousLowReadings = product.intelligence?.consecutiveLowReadings ?? 0;
  const newLowReadings = demandFailedThisReading ? previousLowReadings + 1 : 0;
  const demandConfirmedLow = newLowReadings >= LOW_READINGS_NEEDED_TO_DELIST;

  const salesFailed = pastGracePeriod && totalOrders === 0;

  let action: ReviewResult["action"] = "KEPT";
  let reason: string;

  if (demandConfirmedLow) {
    action = "DELISTED";
    reason = `Real demand confirmed low across ${newLowReadings} consecutive reviews (currently ${overallScore}/100, ${signal.trendDirection} trend) — below the ${MIN_ACCEPTABLE_DEMAND_SCORE} threshold.`;
  } else if (salesFailed) {
    action = "DELISTED";
    reason = `Live for ${Math.floor(daysSincePublish)} days with zero real orders (grace period was ${MIN_DAYS_BEFORE_SALES_JUDGED} days) — demand score is still ${overallScore}/100, but nobody is actually buying it.`;
  } else if (demandFailedThisReading) {
    reason = `Demand dropped to ${overallScore}/100 this review (reading ${newLowReadings} of ${LOW_READINGS_NEEDED_TO_DELIST} needed to confirm) — kept for now in case this is noisy data. Will delist if still low next review.`;
  } else if (!pastGracePeriod && totalOrders === 0) {
    reason = `Still within its ${MIN_DAYS_BEFORE_SALES_JUDGED}-day grace period (${Math.floor(daysSincePublish)} days live, 0 orders so far) — not judged on sales yet. Current demand: ${overallScore}/100.`;
  } else {
    reason = `Demand score ${overallScore}/100 and ${totalOrders} real order(s) — performing acceptably.`;
  }

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: action === "KEPT" },
  });

  await prisma.productIntelligence.updateMany({
    where: { productId },
    data: {
      aiScore: overallScore,
      demandLevel,
      lastEvaluatedAt: new Date(),
      insights: `[Lifecycle review] ${reason}`,
      consecutiveLowReadings: newLowReadings,
    },
  });

  return {
    productId: product.id,
    productTitle: product.title,
    action,
    reason,
    freshScore: overallScore,
  };
}

/**
 * Reviews every currently-active product. Meant to be run on a schedule
 * (e.g. weekly) once deployed — for now, run manually via `npm run review`.
 */
export async function reviewAllActiveProducts(): Promise<ReviewResult[]> {
  const activeProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results: ReviewResult[] = [];

  // Sequential on purpose — avoids hammering Trends/YouTube/rate limits
  // with a burst of parallel requests.
  for (const p of activeProducts) {
    const result = await reviewProduct(p.id);
    results.push(result);
  }

  return results;
}