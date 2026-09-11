// Grades NOVA's past predictions and reports what it learned.
//
// Dry run by default. Pass --apply to allow a weight promotion, which changes
// how every future product is scored.

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const apply = process.argv.includes("--apply");

  const { runLearningPass } = await import(
    "../src/lib/services/learning-engine"
  );
  const { getAccuracyByKind } = await import(
    "../src/lib/services/nova-decisions"
  );
  const { ensureBaselineVersion } = await import(
    "../src/lib/services/nova-weights"
  );

  await ensureBaselineVersion();

  console.log(
    `\nGrading predictions${apply ? " (weight changes ENABLED)" : " (dry run)"}...\n`,
  );

  const { resolution, learning } = await runLearningPass({ dryRun: !apply });

  console.log(
    `Resolved ${resolution.resolved}, abandoned ${resolution.abandoned}, still pending ${resolution.stillPending}.`,
  );

  for (const detail of resolution.details.slice(0, 20)) {
    const verdict =
      detail.correct === null
        ? `error ${detail.error}`
        : detail.correct
          ? "correct"
          : "wrong";
    console.log(
      `   ${detail.kind}: predicted ${detail.predicted}, actual ${detail.actual} (${verdict})`,
    );
  }

  console.log(`\n${learning.reason}\n`);

  if (learning.signalCorrelations) {
    console.log("Signal correlation with realised sales:");
    const ranked = Object.entries(learning.signalCorrelations).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [signal, correlation] of ranked) {
      console.log(`   ${signal.padEnd(18)} ${correlation.toFixed(3)}`);
    }
    console.log("");
  }

  const accuracy = await getAccuracyByKind();
  if (accuracy.length > 0) {
    console.log("Prediction accuracy to date:");
    for (const row of accuracy) {
      const hit =
        row.hitRate === null
          ? "n/a"
          : `${Math.round(row.hitRate * 100)}% correct`;
      const mae =
        row.meanAbsoluteError === null
          ? "n/a"
          : row.meanAbsoluteError.toFixed(3);
      console.log(`   ${row.kind}: ${row.resolved} graded, ${hit}, mean error ${mae}`);
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error("Learning pass failed:", error);
  process.exit(1);
});
