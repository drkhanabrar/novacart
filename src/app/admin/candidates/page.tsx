// FILE: src/app/admin/candidates/page.tsx
//
// The selection screen. NOVA researches and scores; nothing here reaches the
// storefront until you approve it.
//
// Each card shows the sub-scores behind the recommendation rather than only the
// headline number, because the headline is a weighted blend and the weights are
// themselves being learned. A 62 driven by strong repeat-purchase and a 62
// driven by a thin-margin trend spike are not the same product.

import {
  getReviewQueue,
  getBlockedCandidates,
} from "@/lib/services/candidate-approval";
import { prisma } from "@/lib/prisma";
import { DecisionForm } from "@/components/admin/DecisionForm";
import {
  approveCandidateAction,
  rejectCandidateAction,
  retryCandidateAction,
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

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [queue, blocked, published, rejected, lastRun] = await Promise.all([
    getReviewQueue({ limit: 60 }),
    getBlockedCandidates(),
    prisma.marketCandidate.count({ where: { reviewStatus: "PUBLISHED" } }),
    prisma.marketCandidate.count({ where: { reviewStatus: "REJECTED" } }),
    prisma.marketResearchRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, region: true },
    }),
  ]);

  const needle = (q ?? "").trim().toLowerCase();

  const visible = needle
    ? queue.filter(
        (candidate) =>
          candidate.keyword.toLowerCase().includes(needle) ||
          (candidate.category ?? "").toLowerCase().includes(needle) ||
          (candidate.reason ?? "").toLowerCase().includes(needle),
      )
    : queue;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Candidates awaiting your decision
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {queue.length === 0
            ? "Nothing is waiting. New candidates appear here after each weekly research run."
            : `${queue.length} candidate${queue.length === 1 ? "" : "s"} from the latest research run. Approving one generates its listing and publishes it to the store.`}{" "}
          {published} published, {rejected} rejected so far.
          {lastRun &&
            ` Last research run ${lastRun.startedAt.toISOString().slice(0, 10)} (${lastRun.region}, ${lastRun.status.toLowerCase()}).`}
        </p>
      </header>

      {/*
        Filtering happens in memory rather than in the query.
        The pending queue is capped at 60 rows, so a round trip to the database
        for each keystroke would cost more than it saves — and it keeps the
        candidate scoring untouched, which is what matters here.
      */}
      <form className="mt-6" action="/admin/candidates">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search candidates by keyword or category"
          className="w-full max-w-md rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
        />
      </form>

      {visible.length === 0 && queue.length > 0 && (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          No candidates match &ldquo;{q}&rdquo;. {queue.length} are waiting in
          total.
        </p>
      )}

      {/*
        Failures are shown ABOVE the queue, not hidden below it.
        A candidate you approved that did not reach the storefront is more
        urgent than one still waiting for a decision — it represents work you
        believe is done that is not.
      */}
      {blocked.length > 0 && (
        <section className="mt-8 rounded-2xl border border-poppy/30 bg-poppy/5 p-6">
          <h2 className="text-lg font-semibold text-ink">
            Approved but not published
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            These were approved but the publisher refused them. The reason is
            shown for each — nothing was skipped silently.
          </p>

          <ul className="mt-5 grid gap-4">
            {blocked.map((candidate) => (
              <li
                key={candidate.id}
                className="rounded-xl border border-ink/10 bg-card p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{candidate.keyword}</p>
                  <p className="font-tag text-[11px] text-ink-soft">
                    {score(candidate.finalScore)}/100 ·{" "}
                    {candidate.reviewedAt
                      ?.toISOString()
                      .slice(0, 10) ?? "recently"}
                  </p>
                </div>

                <p className="mt-3 rounded-lg border border-poppy/25 bg-poppy/10 px-4 py-3 text-sm leading-relaxed text-ink">
                  {candidate.publishError ??
                    "No reason was recorded for this failure."}
                </p>

                <DecisionForm
                  action={retryCandidateAction}
                  hidden={{ candidateId: candidate.id }}
                  fieldName="confirm"
                  showNote={false}
                  options={[
                    { label: "Try publishing again", value: "yes", tone: "primary" },
                  ]}
                />

                <div className="mt-2">
                  <DecisionForm
                    action={rejectCandidateAction}
                    hidden={{ candidateId: candidate.id }}
                    fieldName="confirm"
                    showNote={false}
                    options={[
                      { label: "Dismiss", value: "yes", tone: "quiet" },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {queue.length === 0 && (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          Run <span className="font-tag text-ink">npm run research:market</span>{" "}
          to gather candidates now, or wait for the weekly job.
        </p>
      )}

      <ul className="mt-8 grid gap-5">
        {visible.map((candidate) => (
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
