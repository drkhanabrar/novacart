import { prisma } from "@/lib/prisma";
import { getMarketSignals, calculateDemandScore } from "./market-signals";
import { searchSupplierProducts, pickBestSupplierMatch } from "./cj-supplier";

// Approximate, hardcoded USD -> INR rate. Good enough for a rough profit
// estimate for now. A future stage should replace this with a live FX rate.
export const APPROX_USD_TO_INR = 83;

export class NovaEngine {
  /**
   * Evaluates a product using REAL market signals (Google Trends + YouTube)
   * for demand, and a REAL CJ Dropshipping catalog match for supplier cost
   * and profit margin. Stores the resulting AI Score.
   */
  static async evaluateProduct(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, brand: true },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    const signal = await getMarketSignals(product.title);
    const { overallScore, demandLevel } = calculateDemandScore(signal);

    // Find a real supplier match and compute a real profit estimate.
    // If no confident match is found, we leave these fields empty rather
    // than guessing — a wrong cost is worse than no cost.
    let profitabilityIndex: number | null = null;
    let supplierName: string | null = null;
    let supplierProductId: string | null = null;
    let supplierUrl: string | null = null;
    let supplierCostUsd: number | null = null;
    let matchConfidence: number | null = null;
    let supplierNote: string;

    try {
      const supplierResults = await searchSupplierProducts(product.title, 10);
      const match = pickBestSupplierMatch(supplierResults, product.title);

      if (match) {
        const costUsd = parseFloat(match.product.sellPrice);
        const costInr = costUsd * APPROX_USD_TO_INR;
        profitabilityIndex = product.basePrice.toNumber() - costInr;

        supplierName = "CJ Dropshipping";
        supplierProductId = match.product.productId;
        supplierUrl = match.product.productUrl;
        supplierCostUsd = costUsd;
        matchConfidence = match.confidence;

        supplierNote =
          `Matched supplier: "${match.product.productName}" at $${costUsd} ` +
          `(~₹${costInr.toFixed(0)}), ${match.confidence}% name match. ` +
          `Estimated profit per unit: ₹${profitabilityIndex.toFixed(0)} ` +
          `(using an approximate $1 = ₹${APPROX_USD_TO_INR} rate).`;
      } else {
        supplierNote =
          "No confidently-matching supplier found on CJ Dropshipping — " +
          "profit margin not calculated. Needs manual sourcing review.";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      supplierNote = `Supplier lookup failed (${message}) — profit margin not calculated.`;
    }

    const explanation =
      `NOVA AI Engine scored "${product.title}" at ${overallScore}/100 using real market data. ` +
      `Google Trends interest: ${signal.trendScore}/100, trend is ${signal.trendDirection}. ` +
      `YouTube: ${signal.youtubeVideoCount} recent videos found, averaging ${signal.youtubeAvgViews.toLocaleString()} views each. ` +
      supplierNote;

    const intelligence = await prisma.productIntelligence.upsert({
      where: { productId: productId },
      update: {
        aiScore: overallScore,
        demandLevel: demandLevel,
        insights: explanation,
        lastEvaluatedAt: new Date(),
        profitabilityIndex: profitabilityIndex,
        supplierName: supplierName,
        supplierProductId: supplierProductId,
        supplierUrl: supplierUrl,
        supplierCostUsd: supplierCostUsd,
        matchConfidence: matchConfidence,
      },
      create: {
        productId: productId,
        aiScore: overallScore,
        demandLevel: demandLevel,
        insights: explanation,
        profitabilityIndex: profitabilityIndex,
        supplierName: supplierName,
        supplierProductId: supplierProductId,
        supplierUrl: supplierUrl,
        supplierCostUsd: supplierCostUsd,
        matchConfidence: matchConfidence,
      },
    });

    return { score: overallScore, signal, intelligence };
  }
}