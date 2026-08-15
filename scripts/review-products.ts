import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic import — must happen AFTER config() runs (see discover.ts for
  // why: static imports are hoisted and would read env vars too early).
  const { reviewAllActiveProducts } = await import(
    "../src/lib/services/product-lifecycle"
  );

  console.log("\nReviewing all active products against real, current data...");
  console.log("(re-checking demand for each — this can take a while for a large catalog)\n");

  try {
    const results = await reviewAllActiveProducts();

    if (results.length === 0) {
      console.log("No active products to review.\n");
      return;
    }

    const kept = results.filter((r) => r.action === "KEPT");
    const delisted = results.filter((r) => r.action === "DELISTED");

    console.log(`Reviewed ${results.length} product(s): ${kept.length} kept, ${delisted.length} delisted.\n`);

    if (delisted.length > 0) {
      console.log("❌ DELISTED");
      for (const r of delisted) {
        console.log(`   ${r.productTitle}`);
        console.log(`   ${r.reason}\n`);
      }
    }

    if (kept.length > 0) {
      console.log("✅ KEPT");
      for (const r of kept) {
        console.log(`   ${r.productTitle} — ${r.reason}`);
      }
      console.log("");
    }
  } catch (err) {
    const fs = await import("fs");
    const details: Record<string, unknown> = { toStringOutput: String(err) };
    if (err && typeof err === "object") {
      for (const key of Object.getOwnPropertyNames(err)) {
        try {
          details[key] = (err as Record<string, unknown>)[key];
        } catch {
          // skip properties that throw on access
        }
      }
    }
    fs.writeFileSync("review-error.json", JSON.stringify(details, null, 2));
    console.error("Something went wrong. Full details written to review-error.json");
    console.error("Raw error:", String(err));
    process.exit(1);
  }
}

main();