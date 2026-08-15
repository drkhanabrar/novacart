import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // IMPORTANT: this import must stay dynamic (await import(...)), not a
  // static `import ... from`. Static ES module imports are hoisted and
  // evaluated BEFORE the config() call above, regardless of where they're
  // written in the file — which would make prisma.ts read an empty
  // DATABASE_URL and silently fall back to localhost, causing a confusing
  // ECONNREFUSED error even though the real DATABASE_URL is correct.
  const { discoverAndCreateProduct } = await import(
    "../src/lib/services/product-discovery"
  );

  const keyword = process.argv.slice(2).join(" ");

  if (!keyword) {
    console.log('\nUsage: npm run discover -- "product keyword"');
    console.log('Example: npm run discover -- "wireless earbuds"\n');
    process.exit(1);
  }

  console.log(`\nRunning full discovery pipeline for: "${keyword}" ...`);
  console.log("(This checks real demand, finds a real supplier, and only");
  console.log("publishes if both look genuinely good — this can take 10-20s)\n");

  try {
    const result = await discoverAndCreateProduct({
      keyword,
      categorySlug: "audio",
      categoryName: "Audio",
      brandSlug: "novalabs",
      brandName: "NovaLabs",
    });

    if (result.created) {
      console.log("✅ PUBLISHED");
      console.log(`   Product: ${result.productTitle}`);
      console.log(`   Product ID: ${result.productId}`);
      console.log(`   ${result.reason}\n`);
      console.log("   Check your storefront at http://localhost:3000/products\n");
    } else {
      console.log("⏭️  SKIPPED (nothing published)");
      console.log(`   Reason: ${result.reason}\n`);
    }
  } catch (err) {
    const fs = await import("fs");
    const details: Record<string, unknown> = { toStringOutput: String(err) };

    if (err && typeof err === "object") {
      for (const key of Object.getOwnPropertyNames(err)) {
        try {
          details[key] = (err as Record<string, unknown>)[key];
        } catch {
          // some properties can throw on access; skip those
        }
      }
    }

    fs.writeFileSync("discover-error.json", JSON.stringify(details, null, 2));
    console.error("Something went wrong. Full details written to discover-error.json");
    console.error("Raw error:", String(err));
    process.exit(1);
  }
}

main();