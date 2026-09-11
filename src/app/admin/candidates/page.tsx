// FILE: src/app/admin/candidates/page.tsx
//
// The selection screen. NOVA researches and scores; nothing here reaches the
// storefront until you approve it.
//
// Each card shows the sub-scores behind the recommendation rather than only the
// headline number, because the headline is a weighted blend and the weights are
// themselves being learned. A 62 driven by strong repeat-purchase and a 62
// driven by a thin-margin trend spike are not the same product.

import { getReviewQueue } from "@/lib/services/candidate-approval";
import { prisma } from "@/lib/prisma";
import { DecisionForm } from "@/components/admin/DecisionForm";
import {
  approveCandidateAction,
  rejectCandidateAction,
} from "@/actions/admin";

export const dynamic = "force-dynamic";

function score(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : "—";
}

function percent(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "unknown";
}

export default async function CandidatesPage() {
  const [queue, published, rejected, lastRun] = await Promise.all([
    getReviewQueue({ limit: 40 }),
    prisma.marketCandidate.count({ where: { reviewStatus: "PUBLISHED" } }),
    prisma.marketCandidate.count({ where: { reviewStatus: "REJECTED" } }),
    prisma.marketResearchRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, region: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Candidates awaiting your decision
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {queue.length === 0
            ? "Nothing is waiting. New candidates appear here after each weekly research run."
            : `${queue.length} candidate${queue.length === 1 ? "" : "s"} researched and scored. Approving one generates its listing and publishes it to the store.`}{" "}
          {published} published, {rejected} rejected so far.
          {lastRun &&
            ` Last research run ${lastRun.startedAt.toISOString().slice(0, 10)} (${lastRun.region}, ${lastRun.status.toLowerCase()}).`}
        </p>
      </header>

      {queue.length === 0 && (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          Run <span className="font-tag text-ink">npm run research:market</span>{" "}
          to gather candidates now, or wait for the weekly job.
        </p>
      )}

      <ul className="mt-8 grid gap-5">
        {queue.map((candidate) => (
          <li
            key={candidate.id}
            className="rounded-2xl border border-ink/10 bg-card p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">
                {candidate.keyword}
              </h2>
              <p className="font-tag text-sm font-bold text-poppy">
                {score(candidate.finalScore)}/100
                <span className="ml-2 font-normal text-ink-soft">
                  {candidate.confidence}% confidence
                </span>
              </p>
            </div>

            <p className="mt-1 font-tag text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              {candidate.category ?? "uncategorised"} · NOVA says{" "}
              {candidate.decision.toLowerCase()}
            </p>

            {candidate.reason && (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {candidate.reason}
              </p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ["Demand", score(candidate.demandScore)],
                ["Competition opportunity", score(candidate.competitionScore)],
                ["Expected margin", percent(candidate.expectedMarginPercent)],
                ["Repeat purchase", score(candidate.repeatPurchaseScore)],
                ["Return risk", score(candidate.returnRiskScore)],
                ["Supplier match", score(candidate.supplierScore)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className="font-tag font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[11px] text-ink-soft">
              Higher competition opportunity means less observed saturation.
              Lower return risk is better.
            </p>

            <DecisionForm
              action={approveCandidateAction}
              hidden={{ candidateId: candidate.id }}
              fieldName="confirm"
              options={[
                {
                  label: "Approve and publish",
                  value: "yes",
                  tone: "primary",
                  confirm: true,
                },
              ]}
            />

            <div className="mt-2">
              <DecisionForm
                action={rejectCandidateAction}
                hidden={{ candidateId: candidate.id }}
                fieldName="confirm"
                showNote={false}
                options={[
                  { label: "Reject", value: "yes", tone: "quiet" },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
