import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic import — must happen AFTER config() runs. See discover.ts for
  // why: static ES module imports are hoisted and evaluated before other
  // top-level code, which would make prisma.ts read an empty DATABASE_URL.
  const { discoverAndCreateProduct } = await import(
    "../src/lib/services/product-discovery"
  );
  const fs = await import("fs");
  const path = await import("path");

  const keywordsPath = path.join(process.cwd(), "data", "candidate-keywords.json");
  const raw = fs.readFileSync(keywordsPath, "utf-8");
  const { keywords } = JSON.parse(raw) as { keywords: string[] };

  if (!keywords || keywords.length === 0) {
    console.log("No candidate keywords found in data/candidate-keywords.json — nothing to do.");
    return;
  }

  console.log(`\nRunning batch discovery for ${keywords.length} candidate keyword(s)...\n`);

  const results: { keyword: string; created: boolean; reason: string }[] = [];

  for (const keyword of keywords) {
    console.log(`--- "${keyword}" ---`);
    try {
      const result = await discoverAndCreateProduct({
        keyword,
        categorySlug: "audio",
        categoryName: "Audio",
        brandSlug: "novalabs",
        brandName: "NovaLabs",
      });

      if (result.created) {
        console.log(`✅ PUBLISHED: ${result.productTitle}`);
      } else {
        console.log(`⏭️  SKIPPED: ${result.reason}`);
      }

      results.push({ keyword, created: result.created, reason: result.reason });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ ERROR: ${message}`);
      results.push({ keyword, created: false, reason: `Error: ${message}` });
    }

    // Be polite to the free APIs (Trends/YouTube/CJ) — small pause between
    // keywords rather than firing everything at once.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const published = results.filter((r) => r.created);
  console.log(`\n=== Batch complete: ${published.length}/${results.length} published ===`);
}

main().catch((err) => {
  console.error("Batch discovery failed:", err);
  process.exit(1);
});