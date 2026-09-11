import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// FILE: scripts/diagnose-nova-evidence.ts

/*
 * NOVA Evidence Diagnostic
 *
 * Purpose:
 *   Diagnose supplier retrieval/matching and competition evidence WITHOUT
 *   changing the production research engine.
 *
 * Run:
 *   npm exec tsx scripts/diagnose-nova-evidence.ts
 */

import {
  searchSupplierProducts,
  pickBestSupplierMatch,
  resolveSupplierVariant,
} from "../src/lib/services/cj-supplier";

import {
  getOpenMarketWebSignal,
} from "../src/lib/services/open-market-sources";

import {
  getCompetitionSignal,
} from "../src/lib/services/competition-signals";

const TEST_KEYWORDS = [
  "washing machine drum cleaning tablets",
  "vacuum seal food storage bags",
  "microfiber glass cleaning cloth",
];

function line() {
  console.log(
    "------------------------------------------------------------",
  );
}

async function testSupplier(keyword: string) {
  console.log("");
  console.log(`CJ SUPPLIER TEST: ${keyword}`);
  line();

  try {
    const products =
      await searchSupplierProducts(
        keyword,
        12,
      );

    console.log(
      `Raw CJ products returned: ${products.length}`,
    );

    if (
      products.length === 0
    ) {
      console.log(
        "RESULT: CJ returned ZERO catalog products.",
      );
      return;
    }

    products.slice(
      0,
      12,
    ).forEach(
      (product, index) => {
        console.log(
          `${index + 1}. confidence=${pickBestSupplierMatch(
            [product],
            keyword,
            0,
          )?.confidence ?? 0} | ${product.productName} | price=${product.sellPrice} | id=${product.productId}`,
        );
      },
    );

    const match =
      pickBestSupplierMatch(
        products,
        keyword,
        58,
      );

    if (!match) {
      console.log("");
      console.log(
        "RESULT: PRODUCTS FOUND, BUT NO MATCH CLEARED THE IDENTITY GATE.",
      );
      console.log(
        "This is a MATCHING problem, not a CJ retrieval problem.",
      );
      return;
    }

    console.log("");
    console.log(
      `MATCH: ${match.product.productName}`,
    );
    console.log(
      `MATCH CONFIDENCE: ${match.confidence}`,
    );
    console.log(
      `MATCHED TOKENS: ${match.matchedTokens.join(", ") || "none"}`,
    );
    console.log(
      `MISSING TOKENS: ${match.missingTokens.join(", ") || "none"}`,
    );
    console.log(
      `CONFLICTS: ${match.conflictingTokens.join(", ") || "none"}`,
    );
    console.log(
      `UNIT COMPATIBLE: ${match.unitCompatible}`,
    );
    console.log(
      `PACK COMPATIBLE: ${match.packCompatible}`,
    );

    try {
      const resolved =
        await resolveSupplierVariant(
          match,
          process.env.NOVA_MARKET_REGION ||
            "IN",
          keyword,
        );

      if (!resolved) {
        console.log(
          "VARIANT: no compatible priced variant resolved.",
        );
        return;
      }

      console.log(
        `VARIANT: ${resolved.product.variantName || "unnamed"}`,
      );
      console.log(
        `VARIANT ID: ${resolved.product.variantId || "unknown"}`,
      );
      console.log(
        `VARIANT SKU: ${resolved.product.variantSku || "unknown"}`,
      );
      console.log(
        `VARIANT PRICE USD: ${resolved.product.sellPrice}`,
      );
      console.log(
        `PRICE SOURCE: ${resolved.product.priceSource || "unknown"}`,
      );
      console.log(
        `INDIA INVENTORY VERIFIED: ${resolved.product.inventoryCountryVerified ?? false}`,
      );
    } catch (error) {
      console.log(
        `VARIANT ERROR: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  } catch (error) {
    console.log(
      `CJ ERROR: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

async function testCompetition(keyword: string) {
  console.log("");
  console.log(
    `COMPETITION TEST: ${keyword}`,
  );
  line();

  try {
    const web =
      await getOpenMarketWebSignal(
        keyword,
      );

    console.log(
      `Web results: ${web.webResultCount}`,
    );
    console.log(
      `Retail domains: ${web.retailDomainCount}`,
    );
    console.log(
      `Amazon results: ${web.amazonResultCount}`,
    );
    console.log(
      `Amazon high-review results: ${web.amazonHighReviewCount}`,
    );
    console.log(
      `Amazon median price INR: ${web.amazonMedianPriceInr ?? "null"}`,
    );
    console.log(
      `Tavily results: ${web.tavilyResultCount}`,
    );
    console.log(
      `Tavily retail domains: ${web.tavilyRetailDomainCount}`,
    );
    console.log(
      `Sources: ${web.sources.join(" | ") || "none"}`,
    );

    if (
      web.warnings.length
    ) {
      console.log(
        "WARNINGS:",
      );

      web.warnings
        .slice(
          0,
          12,
        )
        .forEach(
          (warning) =>
            console.log(
              `- ${warning}`,
            ),
        );
    }

    const competition =
      await getCompetitionSignal(
        keyword,
        web,
      );

    console.log("");
    console.log(
      `Competition provider: ${competition.provider}`,
    );
    console.log(
      `Competition known: ${competition.known}`,
    );
    console.log(
      `Competition score: ${competition.competitionScore ?? "UNKNOWN"}`,
    );
    console.log(
      `Competition level: ${competition.competitionLevel}`,
    );
    console.log(
      `Competition confidence: ${competition.evidenceConfidence}`,
    );

    if (
      competition.notes.length
    ) {
      console.log(
        "NOTES:",
      );

      competition.notes
        .slice(
          0,
          12,
        )
        .forEach(
          (note) =>
            console.log(
              `- ${note}`,
            ),
        );
    }
  } catch (error) {
    console.log(
      `COMPETITION ERROR: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

async function main() {
  console.log(
    "NOVA EVIDENCE DIAGNOSTIC",
  );
  console.log(
    `Region: ${
      process.env.NOVA_MARKET_REGION ||
      "IN"
    }`,
  );
  console.log(
    `CJ key configured: ${Boolean(
      process.env.CJ_API_KEY,
    )}`,
  );
  console.log(
    `SerpApi key configured: ${Boolean(
      process.env.SERPAPI_API_KEY,
    )}`,
  );
  console.log(
    `Tavily key configured: ${Boolean(
      process.env.TAVILY_API_KEY,
    )}`,
  );

  for (
    const keyword of
      TEST_KEYWORDS
  ) {
    await testSupplier(
      keyword,
    );
    await testCompetition(
      keyword,
    );
  }

  console.log("");
  line();
  console.log(
    "DIAGNOSTIC COMPLETE",
  );
}

main().catch(
  (error) => {
    console.error(
      "DIAGNOSTIC FATAL:",
      error,
    );
    process.exitCode = 1;
  },
);
