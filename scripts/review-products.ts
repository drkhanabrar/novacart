// Legacy entry point, kept so the existing nova-review workflow keeps working.
//
// The underlying review is now a full lifecycle pass rather than a keep/delist
// decision, so the output reports state movement and exposure. For the richer
// report including telemetry rollup, use `npm run lifecycle`.

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

    const retired = results.filter((r) => r.action === "RETIRED");
    const proposed = results.filter(
      (r) => r.action === "RETIREMENT_PROPOSED",
    );
    const demoted = results.filter((r) => r.action === "DEMOTED");
    const promoted = results.filter((r) => r.action === "PROMOTED");
    const held = results.filter((r) => r.action === "HELD");

    console.log(
      `Reviewed ${results.length} product(s): ${promoted.length} promoted, ${held.length} held, ${demoted.length} demoted, ${proposed.length} proposed for retirement, ${retired.length} retired.\n`,
    );

    if (proposed.length > 0) {
      console.log("⏸  RETIREMENT PROPOSED — waiting for your approval");
      for (const r of proposed) {
        console.log(`   ${r.productTitle}`);
        console.log(`   ${r.reason}\n`);
      }
    }

    if (retired.length > 0) {
      console.log("❌ RETIRED");
      for (const r of retired) {
        console.log(`   ${r.productTitle}`);
        console.log(`   ${r.reason}\n`);
      }
    }

    if (demoted.length > 0) {
      console.log("🔻 EXPOSURE REDUCED");
      for (const r of demoted) {
        console.log(`   ${r.productTitle} — now ${r.exposure}% exposure`);
        console.log(`   ${r.reason}\n`);
      }
    }

    if (promoted.length > 0) {
      console.log("🔼 EXPOSURE INCREASED");
      for (const r of promoted) {
        console.log(`   ${r.productTitle} — now ${r.exposure}% exposure`);
        console.log(`   ${r.reason}\n`);
      }
    }

    if (held.length > 0) {
      console.log("✅ HELD");
      for (const r of held) {
        console.log(`   ${r.productTitle} [${r.toState}] — ${r.reason}`);
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
