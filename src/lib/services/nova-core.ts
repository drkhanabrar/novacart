import { prisma } from "@/lib/prisma";
import { getMarketSignals } from "./market-signals";

export class NovaEngine {
  /**
   * Evaluates a product using REAL market signals (Google Trends + YouTube)
   * and stores the resulting AI Score.
   *
   * NOTE: This score currently reflects DEMAND only. Competition and real
   * profit margin require supplier cost data, which is added in Stage 3.
   */
  static async evaluateProduct(productId: string) {
    // 1. Fetch the product to ensure it exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, brand: true },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // 2. Pull real market signals using the product title as the search keyword
    const signal = await getMarketSignals(product.title);

    // 3. Convert YouTube average views into a 0-100 score.
    // Log-scaled so a single viral video (millions of views) doesn't
    // completely dominate a product that has steady, modest interest.
    const engagementScore = Math.min(
      100,
      Math.round(
        (Math.log10(signal.youtubeAvgViews + 1) / Math.log10(1_000_000)) * 100
      )
    );

    // 4. Combine into a demand score: 60% Google Trends, 40% YouTube engagement
    let overallScore = Math.round(
      signal.trendScore * 0.6 + engagementScore * 0.4
    );

    // 5. Adjust for direction: is interest growing or dying right now?
    if (signal.trendDirection === "RISING") overallScore += 10;
    if (signal.trendDirection === "FALLING") overallScore -= 10;

    overallScore = Math.min(Math.max(overallScore, 0), 100); // Clamp 0-100

    const demandLevel =
      overallScore > 80 ? "HIGH" : overallScore > 50 ? "MEDIUM" : "LOW";

    const explanation =
      `NOVA AI Engine scored "${product.title}" at ${overallScore}/100 using real market data. ` +
      `Google Trends interest: ${signal.trendScore}/100, trend is ${signal.trendDirection}. ` +
      `YouTube: ${signal.youtubeVideoCount} recent videos found, averaging ${signal.youtubeAvgViews.toLocaleString()} views each. ` +
      `This score reflects demand only — competition and real profit margin will be factored in once supplier data is connected (Stage 3).`;

    // 6. Save the result
    const intelligence = await prisma.productIntelligence.upsert({
      where: { productId: productId },
      update: {
        aiScore: overallScore,
        demandLevel: demandLevel,
        insights: explanation,
        lastEvaluatedAt: new Date(),
      },
      create: {
        productId: productId,
        aiScore: overallScore,
        demandLevel: demandLevel,
        insights: explanation,
      },
    });

    return { score: overallScore, signal, intelligence };
  }
}