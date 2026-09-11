import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  searchSupplierProducts,
  pickBestSupplierMatch,
  resolveSupplierVariant,
} from "../src/lib/services/cj-supplier";

const keyword = "toilet bowl cleaning tablets";

async function main() {
  console.log("NOVA CJ SINGLE-PRODUCT DIAGNOSTIC");
  console.log(`Keyword: ${keyword}`);
  console.log(`Region: ${process.env.NOVA_MARKET_REGION || "IN"}`);
  console.log(`CJ key configured: ${Boolean(process.env.CJ_API_KEY)}`);

  const products = await searchSupplierProducts(keyword, 12);

  console.log(`Raw CJ products returned: ${products.length}`);

  products.forEach((p, i) => {
    const score = pickBestSupplierMatch([p], keyword, 0);
    console.log(
      `${i + 1}. score=${score?.confidence ?? 0} | ${p.productName} | price=${p.sellPrice} | id=${p.productId}`,
    );
  });

  const match = pickBestSupplierMatch(products, keyword, 58);

  if (!match) {
    console.log("RESULT: NO MATCH CLEARED IDENTITY GATE");
    console.log("This means retrieval succeeded but matching rejected all results.");
    return;
  }

  console.log(`MATCH: ${match.product.productName}`);
  console.log(`MATCH CONFIDENCE: ${match.confidence}`);
  console.log(`MATCHED: ${match.matchedTokens.join(", ") || "none"}`);
  console.log(`MISSING: ${match.missingTokens.join(", ") || "none"}`);
  console.log(`CONFLICTS: ${match.conflictingTokens.join(", ") || "none"}`);

  const resolved = await resolveSupplierVariant(
    match,
    process.env.NOVA_MARKET_REGION || "IN",
    keyword,
  );

  if (!resolved) {
    console.log("VARIANT: unresolved");
    console.log("PRODUCT PRICE: " + match.product.sellPrice);
    console.log("PRICE SOURCE: " + (match.product.priceSource || "unknown"));
    return;
  }

  console.log(`VARIANT: ${resolved.product.variantName || "unnamed"}`);
  console.log(`VARIANT ID: ${resolved.product.variantId || "unknown"}`);
  console.log(`VARIANT SKU: ${resolved.product.variantSku || "unknown"}`);
  console.log(`PRICE: ${resolved.product.sellPrice}`);
  console.log(`PRICE SOURCE: ${resolved.product.priceSource || "unknown"}`);
  console.log(`VARIANT RESOLVED: ${resolved.product.variantResolved ?? false}`);
}

main().catch((error) => {
  console.error(
    "DIAGNOSTIC ERROR:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
