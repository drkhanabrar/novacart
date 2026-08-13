import { prisma } from "@/lib/prisma";

export class NovaEngine {
  /**
   * Evaluates a product, generates intelligence data, and stores the AI Score.
   * In a live enterprise environment, this would call external LLMs or ML models.
   * Here we simulate the algorithmic decision-making process.
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

    // 2. Simulate AI Data Gathering (Market Demand, Competition, Margin)
    // Real logic would query the MarketSignal and SupplierScore tables here.
    const mockDemandScore = Math.floor(Math.random() * 40) + 60; // 60-100
    const mockCompetitionPenalty = Math.floor(Math.random() * 30); // 0-30
    const mockMarginBonus = Math.floor(Math.random() * 10); // 0-10

    // 3. Calculate Overall AI Score
    let overallScore = mockDemandScore - mockCompetitionPenalty + mockMarginBonus;
    overallScore = Math.min(Math.max(overallScore, 0), 100); // Clamp between 0-100

    const demandLevel = overallScore > 80 ? "HIGH" : overallScore > 50 ? "MEDIUM" : "LOW";
    
    const signals = {
      marketDemandLevel: demandLevel,
      competitionIndex: mockCompetitionPenalty,
      profitabilityBonus: mockMarginBonus,
      trendVelocity: "RISING"
    };

    const explanation = `NOVA AI Engine scored this product at ${overallScore}/100. Demand is currently ${demandLevel}. The competition penalty is -${mockCompetitionPenalty} points, offset by a margin bonus of +${mockMarginBonus} points.`;

    // 4. Run Database Transaction (All or Nothing)
    // We use Prisma transactions to ensure data consistency across multiple tables.
const transaction = await prisma.$transaction(async (tx) => {
      // Upsert (Update or Insert) the ProductIntelligence record.
      // Note: there is no separate raw-score table in the schema, so the
      // explanation/signals are folded into this single record via `insights`.
      const intelligence = await tx.productIntelligence.upsert({
        where: { productId: productId },
        update: {
          aiScore: overallScore,
          demandLevel: demandLevel,
          profitabilityIndex: (product.basePrice.toNumber() * 0.4), // Mock profit margin
          insights: explanation,
          lastEvaluatedAt: new Date(),
        },
        create: {
          productId: productId,
          aiScore: overallScore,
          demandLevel: demandLevel,
          profitabilityIndex: (product.basePrice.toNumber() * 0.4),
          insights: explanation,
        },
      });

      return { score: overallScore, signals, intelligence };
    });
  }
}
