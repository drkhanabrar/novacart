// Aggregates raw storefront events into daily metrics and prunes expired rows.

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { rollupRecent } = await import("../src/lib/services/telemetry");

  const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 2;

  const result = await rollupRecent(Number.isFinite(days) ? days : 2);

  for (const day of result.rollups) {
    console.log(
      `${day.day}: ${day.eventsProcessed} events rolled up across ${day.productsUpdated} product(s)`,
    );
  }

  console.log(`Pruned ${result.pruned} expired raw event(s).`);
}

main().catch((error) => {
  console.error("Rollup failed:", error);
  process.exit(1);
});
