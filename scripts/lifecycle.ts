// Runs a full NOVA lifecycle pass locally.
//
// Rolls up telemetry first so every product is judged on current numbers, then
// reviews the live catalogue and prints what moved and why.

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic import must happen after config() — static imports are hoisted and
  // would read env vars before dotenv populates them.
  const { reviewAllActiveProducts } = await import(
    "../src/lib/services/product-lifecycle"
  );
  const { rollupRecent } = await import("../src/lib/services/telemetry");
  const { ensureBaselineVersion } = await import(
    "../src/lib/services/nova-weights"
  );

  await ensureBaselineVersion();

  console.log("\nRolling up storefront telemetry...");
  const rollup = await rollupRecent(2);
  for (const day of rollup.rollups) {
    console.log(
      `   ${day.day}: ${day.eventsProcessed} events across ${day.productsUpdated} product(s)`,
    );
  }
  if (rollup.pruned > 0) {
    console.log(`   pruned ${rollup.pruned} expired raw event(s)`);
  }

  console.log("\nReviewing the live catalogue against current evidence...");
  console.log("(each product re-checks demand, competition and supply — this takes a while)\n");

  const results = await reviewAllActiveProducts();

  if (results.length === 0) {
    console.log("No active products to review.\n");
    return;
  }

  const byAction = new Map<string, typeof results>();
  for (const result of results) {
    byAction.set(result.action, [...(byAction.get(result.action) ?? []), result]);
  }

  console.log(`Reviewed ${results.length} product(s).\n`);

  for (const [action, group] of byAction) {
    console.log(`${action} (${group.length})`);
    for (const item of group) {
      const decline =
        item.declineProbability === null
          ? "decline risk unknown"
          : `${Math.round(item.declineProbability * 100)}% decline risk`;
      console.log(`   ${item.productTitle}`);
      console.log(
        `   ${item.fromState} -> ${item.toState} at ${item.exposure}% exposure, NOVA ${item.novaScore}/100, ${decline}`,
      );
      console.log(`   ${item.reason}\n`);
    }
  }

  const proposals = results.filter(
    (result) => result.action === "RETIREMENT_PROPOSED",
  );

  if (proposals.length > 0) {
    console.log(
      `${proposals.length} retirement(s) are waiting for your approval at /admin/nova.\n`,
    );
  }
}

main().catch((error) => {
  console.error("Lifecycle pass failed:", error);
  process.exit(1);
});
