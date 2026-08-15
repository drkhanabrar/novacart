import { prisma } from "@/lib/prisma";
import { getMarketSignals, calculateDemandScore } from "./market-signals";
import { searchSupplierProducts, pickBestSupplierMatch } from "./cj-supplier";
import { generateListing } from "./listing-generator";
import { NovaEngine, APPROX_USD_TO_INR } from "./nova-core";

// Minimum bar to auto-publish a product without a human looking at it.
// Both must be true — strong demand alone isn't enough if we can't
// confidently price it, and a cheap supplier match alone isn't enough
// if nobody is actually searching for the product.
const MIN_DEMAND_SCORE = 40;
const MIN_MATCH_CONFIDENCE = 50;

// Simple markup heuristic: sell at 2.5x landed cost. This is a starting
// point, not a pricing strategy — a future stage should make this
// data-driven based on category and competition.
const MARKUP_MULTIPLIER = 2.5;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface DiscoveryResult {
  created: boolean;
  reason: string;
  productId?: string;
  productTitle?: string;
}

/**
 * The full "discover and publish" pipeline:
 * 1. Check real demand (Google Trends + YouTube)
 * 2. Find a real, confidently-matched supplier (CJ Dropshipping)
 * 3. If both clear the bar, write an AI listing and publish the product
 * 4. Run the full NOVA evaluation to save score + profit data
 *
 * If either demand or supplier-match fails to clear the bar, nothing is
 * created — the function returns a clear reason instead of guessing.
 */
export async function discoverAndCreateProduct(params: {
  keyword: string;
  categorySlug: string;
  categoryName: string;
  brandSlug: string;
  brandName: string;
}): Promise<DiscoveryResult> {
  const { keyword, categorySlug, categoryName, brandSlug, brandName } = params;

  // 1. Real demand check
  const signal = await getMarketSignals(keyword);
  const { overallScore, demandLevel } = calculateDemandScore(signal);

  if (overallScore < MIN_DEMAND_SCORE) {
    return {
      created: false,
      reason: `Demand score too low (${overallScore}/100, needs ${MIN_DEMAND_SCORE}+). Trend is ${signal.trendDirection}.`,
    };
  }

  // 2. Real, confidently-matched supplier
  const supplierResults = await searchSupplierProducts(keyword, 10);
  const match = pickBestSupplierMatch(supplierResults, keyword, MIN_MATCH_CONFIDENCE);

  if (!match) {
    return {
      created: false,
      reason: `No confidently-matching supplier found on CJ Dropshipping for "${keyword}".`,
    };
  }

  // 3. Real pricing from real cost
  const costUsd = parseFloat(match.product.sellPrice);
  const costInr = costUsd * APPROX_USD_TO_INR;
  const sellPriceInr = Math.round(costInr * MARKUP_MULTIPLIER);

  // 4. AI-written bilingual listing, grounded in the real supplier name
  const listing = await generateListing({
    productWorkingTitle: keyword,
    supplierProductName: match.product.productName,
    category: categoryName,
    trendDirection: signal.trendDirection,
  });

  // 5. Ensure category and brand exist
  const category = await prisma.category.upsert({
    where: { slug: categorySlug },
    update: {},
    create: { name: categoryName, slug: categorySlug },
  });

  const brand = await prisma.brand.upsert({
    where: { slug: brandSlug },
    update: {},
    create: { name: brandName, slug: brandSlug },
  });

  // 6. Create the product + variant using REAL supplier data
  const slug = slugify(listing.titleEn);

  const product = await prisma.product.upsert({
    where: { slug },
    update: {},
    create: {
      title: listing.titleEn,
      slug,
      description: listing.descriptionEn,
      basePrice: sellPriceInr,
      categoryId: category.id,
      brandId: brand.id,
    },
  });

  await prisma.productVariant.upsert({
    where: { sku: `CJ-${match.product.productId}` },
    update: {},
    create: {
      productId: product.id,
      sku: `CJ-${match.product.productId}`,
      price: sellPriceInr,
      name: "Standard",
      imageUrl: match.product.productImage || null, // real supplier image, no scraping; null if CJ didn't provide one
      attributes: {
        hindiTitle: listing.titleHi,
        hindiDescription: listing.descriptionHi,
      },
    },
  });

  // 7. Run the full evaluation so ProductIntelligence gets saved consistently
  await NovaEngine.evaluateProduct(product.id);

  return {
    created: true,
    reason: `Published with demand score ${overallScore}/100 (${demandLevel}) and ${match.confidence}% supplier match.`,
    productId: product.id,
    productTitle: product.title,
  };
}