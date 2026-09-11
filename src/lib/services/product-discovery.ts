// FILE: src/lib/services/product-discovery.ts

import {
  runMarketResearch,
  publishQualifiedCandidate,
} from "./nova-market-engine";

export interface DiscoveryResult {
  created: boolean;
  reason: string;
  productId?: string;
  productTitle?: string;
}

/**
 * Compatibility wrapper for the legacy discovery flow.
 *
 * All discovery now goes through the unified NOVA market engine,
 * so manual discovery cannot bypass the same demand, competition,
 * margin, return-risk, service-risk and supplier gates.
 */
export async function discoverAndCreateProduct(
  params: {
    keyword: string;
    categorySlug: string;
    categoryName: string;
    brandSlug: string;
    brandName: string;
  },
): Promise<DiscoveryResult> {
  void params.categorySlug;
  void params.categoryName;
  void params.brandSlug;
  void params.brandName;

  const result =
    await runMarketResearch({
      seeds: [params.keyword],
      limit: 1,
    });

  const candidate =
    result.candidates[0];

  if (!candidate) {
    return {
      created: false,
      reason: `No research candidate was produced for "${params.keyword}".`,
    };
  }

  if (
    candidate.decision !==
    "PUBLISH"
  ) {
    return {
      created: false,
      reason: candidate.reason,
    };
  }

  const outcome =
    await publishQualifiedCandidate(
      candidate,
    );

  if (outcome.created) {
    return {
      created: true,
      reason: `Published through the unified NOVA market engine: ${candidate.reason}`,
      productId:
        outcome.productId,
      productTitle:
        outcome.productTitle,
    };
  }

  return {
    created: false,
    reason:
      outcome.reason ??
      "NOVA could not publish the qualified candidate.",
  };
}