// FILE: src/app/admin/nova/page.tsx
//
// The answer to "why did NOVA do that?".
//
// Access is enforced by src/app/admin/layout.tsx, which requires an ADMIN role.
//
// Every claim on this page is read from the decision, prediction and lifecycle
// tables rather than recomputed, so what you see here is exactly what the system
// acted on — including the times it was wrong. A dashboard that quietly hides
// bad predictions would defeat the point of recording them.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccuracyByKind } from "@/lib/services/nova-decisions";
import { getCatalogBenchmarks } from "@/lib/services/performance-intelligence";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<string, string> = {
  SCALING: "text-sage",
  MATURE: "text-sage",
  LISTED: "text-ink",
  LEARNING: "text-ink-soft",
  TEST: "text-ink-soft",
  DECLINING: "text-poppy",
  RETIRED: "text-poppy",
};

function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export default async function NovaIntelligencePage() {
  const [
    lifecycles,
    pending,
    decisions,
    predictions,
    accuracy,
    benchmarks,
    activeModel,
  ] = await Promise.all([
    prisma.productLifecycle.findMany({
      include: { product: { select: { title: true, slug: true } } },
      orderBy: [{ exposure: "desc" }, { updatedAt: "desc" }],
      take: 60,
    }),
    prisma.productLifecycle.findMany({
      where: { pendingAction: { not: null } },
      include: { product: { select: { title: true, slug: true } } },
      orderBy: { pendingRaisedAt: "asc" },
    }),
    prisma.novaDecision.findMany({
      orderBy: { decidedAt: "desc" },
      take: 25,
      include: { product: { select: { title: true } } },
    }),
    prisma.novaPrediction.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        outcome: true,
        product: { select: { title: true } },
      },
    }),
    getAccuracyByKind(),
    getCatalogBenchmarks(),
    prisma.novaModelVersion.findFirst({ where: { status: "ACTIVE" } }),
  ]);

  const byState = lifecycles.reduce<Record<string, number>>((acc, row) => {
    acc[row.state] = (acc[row.state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-ink/10 pb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
          What NOVA is doing
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every decision below was recorded with the evidence that produced it.
          Scoring currently runs on weight version{" "}
          <span className="font-tag font-bold text-ink">
            {activeModel?.version ?? "v1-baseline"}
          </span>
          {activeModel?.resolvedSamples
            ? `, promoted after grading ${activeModel.resolvedSamples} real outcomes.`
            : ", the starting priors — no outcome has graded them yet."}
        </p>
      </header>

      {pending.length > 0 && (
        <section className="mt-10 rounded-2xl border border-poppy/30 bg-poppy/5 p-6">
          <h2 className="text-lg font-semibold text-ink">
            Waiting for your decision
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            NOVA has proposed retiring these products. Nothing happens until you
            approve.
          </p>
          <ul className="mt-5 grid gap-4">
            {pending.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-ink/10 bg-card p-4"
              >
                <p className="font-semibold text-ink">{row.product.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {row.pendingReason}
                </p>
                <p className="mt-2 font-tag text-[11px] text-ink-soft">
                  Raised{" "}
                  {row.pendingRaisedAt?.toISOString().slice(0, 10) ?? "recently"}{" "}
                  · currently {row.exposure}% exposure
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-ink">Catalogue baseline</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Products are judged against these medians rather than against generic
          industry benchmarks, which say little about a store this young.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Median click-through", percent(benchmarks.medianCtr)],
            ["Median add-to-cart", percent(benchmarks.medianAddToCartRate)],
            ["Median conversion", percent(benchmarks.medianConversionRate, 2)],
            ["Products with data", String(benchmarks.productsWithData)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-ink/10 bg-card p-4"
            >
              <dt className="font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                {label}
              </dt>
              <dd className="mt-2 text-xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {benchmarks.totalImpressions === 0 && (
          <p className="mt-4 rounded-xl border border-ink/10 bg-cream-soft p-4 text-sm text-ink-soft">
            No storefront traffic has been recorded yet. Until it is, NOVA holds
            every product in TEST and relies on external market signals alone —
            it will not retire anything on the basis of silence.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-ink">Lifecycle</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {Object.entries(byState)
            .map(([state, count]) => `${count} ${state.toLowerCase()}`)
            .join(" · ") || "No products are being tracked yet."}
        </p>

        {lifecycles.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Exposure</th>
                  <th className="px-4 py-3 font-medium">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {lifecycles.map((row) => (
                  <tr key={row.id} className="border-b border-ink/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${row.product.slug}`}
                        className="text-ink hover:text-poppy"
                      >
                        {row.product.title}
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-3 font-tag text-xs font-bold ${
                        STATE_TONE[row.state] ?? "text-ink"
                      }`}
                    >
                      {row.state}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{row.exposure}%</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {row.lastReviewedAt?.toISOString().slice(0, 10) ?? "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-ink">
          How good its predictions have been
        </h2>
        {accuracy.length === 0 ? (
          <p className="mt-3 rounded-xl border border-ink/10 bg-cream-soft p-4 text-sm text-ink-soft">
            Nothing has been graded yet. Predictions are made at publication and
            resolved once their horizon elapses, so the first scores appear about
            four weeks after the first product goes live.
          </p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {accuracy.map((row) => (
              <li
                key={row.kind}
                className="rounded-xl border border-ink/10 bg-card p-4"
              >
                <p className="font-tag text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                  {row.kind}
                </p>
                <p className="mt-2 text-ink">
                  {row.resolved} graded
                  {row.hitRate !== null &&
                    ` · ${Math.round(row.hitRate * 100)}% called correctly`}
                </p>
                {row.meanAbsoluteError !== null && (
                  <p className="mt-1 text-sm text-ink-soft">
                    Mean error {row.meanAbsoluteError.toFixed(3)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-ink">Open predictions</h2>
        <ul className="mt-5 grid gap-3">
          {predictions.length === 0 && (
            <li className="rounded-xl border border-ink/10 bg-cream-soft p-4 text-sm text-ink-soft">
              No predictions recorded yet.
            </li>
          )}
          {predictions.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-ink/10 bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">
                  {row.product?.title ?? "Portfolio"}
                </p>
                <p className="font-tag text-[11px] text-ink-soft">
                  {row.metric} · {row.status.toLowerCase()}
                </p>
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                Predicted {Number(row.predictedValue)} at {row.confidence}%
                confidence
                {row.outcome &&
                  ` · actual ${Number(row.outcome.actualValue)}${
                    row.outcome.correct === null
                      ? ""
                      : row.outcome.correct
                        ? " (correct)"
                        : " (wrong)"
                  }`}
              </p>
              {row.rationale && (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {row.rationale}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 pb-16">
        <h2 className="text-lg font-semibold text-ink">Recent decisions</h2>
        <ul className="mt-5 grid gap-3">
          {decisions.length === 0 && (
            <li className="rounded-xl border border-ink/10 bg-cream-soft p-4 text-sm text-ink-soft">
              No decisions recorded yet.
            </li>
          )}
          {decisions.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-ink/10 bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{row.summary}</p>
                <p className="font-tag text-[11px] text-ink-soft">
                  {row.kind} · {row.decidedAt.toISOString().slice(0, 10)}
                </p>
              </div>
              {row.rationale && (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {row.rationale}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
