// FILE: src/lib/services/nova-core.ts

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMarketSignals,
  calculateDemandScore,
} from "./market-signals";
import {
  getCompetitionSignal,
} from "./competition-signals";
import {
  searchSupplierProducts,
  pickBestSupplierMatch,
} from "./cj-supplier";
import {
  assessCandidate,
} from "./market-analyst";
import { getUsdToInrRate } from "./fx-rate";
import {
  getActiveWeights,
  computeNovaScore,
} from "./nova-weights";

export const APPROX_USD_TO_INR = 90;

const REGION =
  process.env.NOVA_MARKET_REGION || "IN";

const SHIPPING = Number(
  process.env.NOVA_SHIPPING_BUFFER_INR || 120,
);

const FEE = Number(
  process.env.NOVA_PAYMENT_FEE_PERCENT || 2,
);

/*
 * Prisma JSON fields require Prisma.InputJsonValue,
 * not arbitrary TypeScript interfaces such as MarketSignal.
 *
 * Serialising and parsing here converts the strongly typed
 * runtime objects into JSON-safe Prisma values while preserving
 * the actual evidence.
 */
function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

/*
 * Supplier unit cost.
 *
 * CJ returns sellPrice as a STRING that is frequently a range, e.g.
 * "5.24 -- 8.87" or "27.41 -- 470.83". The previous code did
 * Number(match.product.sellPrice), which yields NaN for every one of those.
 *
 * NaN then propagated silently: cost -> profit -> margin -> aiScore, and the
 * evaluation was written to the database with aiScore: NaN. Prisma rejects a
 * NaN Decimal, and because the rejection breaks its input-type matching it
 * surfaced as the confusing "Argument `product` is missing" error rather than
 * as a number problem.
 *
 * A range is deliberately NOT collapsed into a single figure. If the real cost
 * could be 5.24 or 8.87, NOVA does not know the margin, and inventing one would
 * be worse than admitting it. Returning null makes margin null, which the rest
 * of this file and the whole intelligence layer already handle as "unknown".
 */
function parseSupplierUnitCostUsd(
  value: unknown,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) &&
      value > 0
      ? value
      : null;
  }

  const text =
    String(value ?? "").trim();

  if (!text) return null;

  // Matches "5.24 - 8.87", "5.24 -- 8.87", "5.24 – 8.87" and similar.
  if (
    /\d(?:\.\d+)?\s*[-–—]{1,3}\s*\d/.test(
      text,
    )
  ) {
    return null;
  }

  const numeric = Number(
    text.replace(/[^0-9.]/g, ""),
  );

  return Number.isFinite(numeric) &&
    numeric > 0
    ? numeric
    : null;
}

/// Converts any non-finite value to null before it can reach a Decimal column.
function finiteOrNull(
  value: number | null,
): number | null {
  return value !== null &&
    Number.isFinite(value)
    ? value
    : null;
}

export class NovaEngine {
  static async evaluateProduct(
    productId: string,
  ) {
    const product =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
        include: {
          category: true,
          brand: true,
          orderItems: {
            include: {
              order: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

    if (!product) {
      throw new Error(
        `Product with ID ${productId} not found.`,
      );
    }

    const [
      market,
      competition,
      suppliers,
      fx,
    ] = await Promise.all([
      getMarketSignals(
        product.title,
        {
          geo: REGION,
          useShoppingSignal: true,
        },
      ),

      getCompetitionSignal(
        product.title,
      ),

      searchSupplierProducts(
        product.title,
        10,
      ).catch(() => []),

      getUsdToInrRate(),
    ]);

    const demand =
      calculateDemandScore(market);

    const match =
      pickBestSupplierMatch(
        suppliers,
        product.title,
        55,
      );

    const analyst =
      await assessCandidate({
        keyword: product.title,
        marketEvidence: market,
        competitionEvidence:
          competition,
        supplierEvidence:
          match || {
            known: false,
          },
      });

    const supplierUnitCostUsd =
      match
        ? parseSupplierUnitCostUsd(
            match.product.sellPrice,
          )
        : null;

    const cost =
      supplierUnitCostUsd === null
        ? null
        : supplierUnitCostUsd * fx;

    const fee =
      Number(product.basePrice) *
      (FEE / 100);

    const profit =
      cost === null
        ? null
        : Number(product.basePrice) -
          cost -
          SHIPPING -
          fee;

    const margin = finiteOrNull(
      profit === null ||
        Number(product.basePrice) <= 0
        ? null
        : (profit /
            Number(product.basePrice)) *
            100,
    );

    const units =
      product.orderItems.reduce(
        (total, item) =>
          total + item.quantity,
        0,
      );

    const refunded =
      product.orderItems
        .filter(
          (item) =>
            item.order.status ===
            "REFUNDED",
        )
        .reduce(
          (total, item) =>
            total + item.quantity,
          0,
        );

    const returnRate =
      units > 0
        ? refunded / units
        : null;

    /*
     * Once NovaCart has enough real order history,
     * observed refund behaviour becomes more valuable
     * than the generic market/category proxy.
     *
     * Until then, keep the analyst's market-risk score.
     */
    const returnRisk =
      returnRate === null
        ? analyst.returnRiskScore
        : Math.max(
            0,
            Math.min(
              100,
              returnRate * 200,
            ),
          );

    /*
     * This block previously carried its own copy of the scoring weights, which
     * had already drifted from the copy in nova-market-engine.ts — the same
     * product could be scored differently depending on which entry point
     * evaluated it. Both now read the active version from the registry.
     */
    const { weights: activeWeights } =
      await getActiveWeights();

    const score = computeNovaScore(
      {
        demand:
          demand.overallScore,

        trendVelocity:
          market.trendVelocity,

        shoppingIntent:
          market.shoppingScore,

        contentInterest:
          market.youtubeScore,

        newsInterest:
          market.newsScore,

        socialInterest:
          market.redditScore,

        competition:
          competition.competitionScore,

        marginPercent: margin,

        repeatPurchase:
          analyst.repeatPurchaseScore,

        /*
         * Observed refund behaviour takes over from the category proxy once
         * NovaCart has real orders — see the returnRisk derivation above.
         */
        returnRisk,

        serviceRisk:
          analyst.serviceRiskScore,

        operationalEase:
          analyst.operationalEaseScore,
      },
      activeWeights,
    );

    const confidence = Math.round(
      Math.min(
        100,
        analyst.confidence *
          0.4 +
          (competition.known
            ? 20
            : 0) +
          (match ? 20 : 0) +
          (margin !== null
            ? 10
            : 0) +
          Math.min(
            10,
            market.sourceCount * 2,
          ),
      ),
    );

    const insights =
      `NOVA ${score}/100 (${confidence}% confidence). ` +
      `Demand ${demand.overallScore}/100; ` +
      `trend ${market.trendDirection} ${market.trendVelocity}%; ` +
      `Shopping ${market.shoppingScore}/100; ` +
      `competition ${
        competition.competitionScore ??
        "unknown"
      }; ` +
      `supplier ${
        match?.confidence ??
        "unknown"
      }%; ` +
      `margin ${
        margin === null
          ? "unknown"
          : `${margin.toFixed(1)}%`
      }; ` +
      `repeat ${analyst.repeatPurchaseScore}; ` +
      `return risk ${analyst.returnRiskScore}; ` +
      `service risk ${analyst.serviceRiskScore}; ` +
      `operational ease ${analyst.operationalEaseScore}. ` +
      `${
        returnRate === null
          ? "No observed return sample yet."
          : `Observed refund proxy ${(
              returnRate * 100
            ).toFixed(
              2,
            )}% across ${units} units.`
      } ` +
      analyst.rationale;

    /*
     * IMPORTANT:
     * Do not assign typed objects such as MarketSignal,
     * CompetitionSignal, SupplierMatch or AnalystAssessment
     * directly to a Prisma JSON field.
     *
     * Convert the complete evidence tree first.
     */
    const evidence =
      toPrismaJson({
        region: REGION,
        market,
        competition,
        supplier: match,
        analyst,
        economics: {
          usdInr: fx,
          shippingBufferInr:
            SHIPPING,
          paymentFeePercent:
            FEE,
          cost,
          profit,
          margin,
        },
      });

    const data = {
      aiScore: score,

      demandLevel:
        demand.demandLevel,

      insights,

      lastEvaluatedAt:
        new Date(),

      profitabilityIndex:
        finiteOrNull(profit),

      supplierName:
        match
          ? "CJ Dropshipping"
          : null,

      supplierProductId:
        match?.product.productId ??
        null,

      supplierUrl:
        match?.product.productUrl ??
        null,

      supplierCostUsd:
        supplierUnitCostUsd,

      matchConfidence:
        match?.confidence ?? null,

      marketScore:
        demand.overallScore,

      competitionScore:
        competition.competitionScore,

      repeatPurchaseScore:
        analyst.repeatPurchaseScore,

      returnRiskScore:
        analyst.returnRiskScore,

      serviceRiskScore:
        analyst.serviceRiskScore,

      operationalEaseScore:
        analyst.operationalEaseScore,

      marginPercent:
        margin,

      observedReturnRate:
        returnRate,

      evaluationConfidence:
        confidence,

      evidence,
    };

    const intelligence =
      await prisma.productIntelligence.upsert(
        {
          where: {
            productId,
          },

          update: data,

          create: {
            productId,
            ...data,
          },
        },
      );

    return {
      score,
      demandScore:
        demand.overallScore,
      confidence,
      signal: market,
      competition,
      marginPercent:
        margin,
      observedReturnRate:
        returnRate,
      intelligence,
    };
  }
}