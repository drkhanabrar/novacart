// FILE: src/lib/services/candidate-approval.ts
//
// The human gate between research and the storefront.
//
// NOVA scores candidates and parks them. Nothing reaches the store until an
// admin approves it here, at which point the exact candidate that was reviewed
// is replayed into the publisher — listing generation, supplier linkage,
// lifecycle registration and the success prediction all follow from that.
//
// Approving publishes the snapshot rather than re-running research on purpose.
// Re-scoring at approval time would mean the admin approves one product and a
// different one appears, because Trends, Reddit and CJ all move between the
// review and the click.

import { prisma } from "@/lib/prisma";
import {
  publishQualifiedCandidate,
  type ResearchCandidate,
} from "./nova-market-engine";
import { recordDecision } from "./nova-decisions";

export interface ApprovalResult {
  ok: boolean;
  productId?: string;
  productTitle?: string;
  message: string;
}

/*
 * A snapshot is written by the research run, but rows created before this
 * feature existed will not have one. Those cannot be published safely, and
 * saying so is better than reconstructing a half-candidate from the columns and
 * publishing something the admin never actually reviewed.
 */
function readSnapshot(value: unknown): ResearchCandidate | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ResearchCandidate>;

  if (
    typeof candidate.keyword !== "string" ||
    typeof candidate.finalScore !== "number"
  ) {
    return null;
  }

  return candidate as ResearchCandidate;
}

export async function approveCandidate(
  candidateId: string,
  adminId: string,
  note?: string,
): Promise<ApprovalResult> {
  const row = await prisma.marketCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!row) {
    return { ok: false, message: "That candidate no longer exists." };
  }

  if (row.reviewStatus === "PUBLISHED") {
    return {
      ok: false,
      message: `"${row.keyword}" has already been published.`,
    };
  }

  const snapshot = readSnapshot(row.candidateSnapshot);

  if (!snapshot) {
    await prisma.marketCandidate.update({
      where: { id: candidateId },
      data: {
        reviewStatus: "FAILED",
        publishError:
          "No candidate snapshot was stored, so this cannot be published without re-running research.",
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });

    return {
      ok: false,
      message:
        "This candidate predates the approval workflow and has no stored snapshot. Run a fresh research pass and approve the new entry instead.",
    };
  }

  // Mark the intent before attempting the publish, so a crash mid-publish
  // leaves an auditable record rather than a silently pending row.
  await prisma.marketCandidate.update({
    where: { id: candidateId },
    data: {
      reviewStatus: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: adminId,
      reviewNote: note?.slice(0, 1000) ?? null,
      publishError: null,
    },
  });

  try {
    const result = await publishQualifiedCandidate(snapshot, {
      approvedByHuman: true,
    });

    if (!result.created) {
      await prisma.marketCandidate.update({
        where: { id: candidateId },
        data: {
          reviewStatus: "FAILED",
          publishError: result.reason?.slice(0, 1000) ?? "Unknown reason.",
        },
      });

      return {
        ok: false,
        message: result.reason ?? "The publisher declined this candidate.",
      };
    }

    await prisma.marketCandidate.update({
      where: { id: candidateId },
      data: {
        reviewStatus: "PUBLISHED",
        publishedProductId: result.productId ?? null,
      },
    });

    await recordDecision({
      kind: "PUBLISH",
      subjectType: "CANDIDATE",
      subjectId: candidateId,
      productId: result.productId ?? null,
      status: "APPROVED",
      actor: "HUMAN",
      summary: `Admin approved "${row.keyword}" for publishing`,
      rationale:
        note ||
        `Approved from the admin console at NOVA score ${Number(row.finalScore)}/100.`,
      inputs: {
        finalScore: Number(row.finalScore),
        confidence: row.confidence,
        novaDecision: row.decision,
        novaReason: row.reason,
      },
      confidence: row.confidence,
    });

    return {
      ok: true,
      productId: result.productId,
      productTitle: result.productTitle,
      message: `Published "${result.productTitle}".`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await prisma.marketCandidate.update({
      where: { id: candidateId },
      data: { reviewStatus: "FAILED", publishError: message.slice(0, 1000) },
    });

    return {
      ok: false,
      message: `Publishing failed: ${message}`,
    };
  }
}

export async function rejectCandidate(
  candidateId: string,
  adminId: string,
  note?: string,
): Promise<ApprovalResult> {
  const row = await prisma.marketCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!row) {
    return { ok: false, message: "That candidate no longer exists." };
  }

  if (row.reviewStatus === "PUBLISHED") {
    return {
      ok: false,
      message:
        "That candidate is already live. Retire the product from the Products tab instead.",
    };
  }

  await prisma.marketCandidate.update({
    where: { id: candidateId },
    data: {
      reviewStatus: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: adminId,
      reviewNote: note?.slice(0, 1000) ?? null,
    },
  });

  /*
   * A rejection is recorded as deliberately as an approval.
   *
   * These are the most valuable rows in the ledger for judging NOVA: they are
   * the cases where a human disagreed with its recommendation, and the pattern
   * across them says more about the scoring than any single publish does.
   */
  await recordDecision({
    kind: "PUBLISH",
    subjectType: "CANDIDATE",
    subjectId: candidateId,
    status: "REJECTED",
    actor: "HUMAN",
    summary: `Admin rejected "${row.keyword}"`,
    rationale:
      note ||
      `Rejected from the admin console despite a NOVA score of ${Number(row.finalScore)}/100.`,
    inputs: {
      finalScore: Number(row.finalScore),
      confidence: row.confidence,
      novaDecision: row.decision,
      novaReason: row.reason,
    },
    confidence: row.confidence,
  });

  return { ok: true, message: `Rejected "${row.keyword}".` };
}

export interface QueueFilters {
  /// Minimum NOVA score. Defaults to showing everything NOVA did not reject.
  minScore?: number;
  limit?: number;
}

/*
 * Candidates awaiting a decision, from the MOST RECENT run only.
 *
 * This previously returned every PENDING candidate ever scored, so the queue
 * accumulated across runs and mixed weeks-old entries with today's. That is
 * actively misleading: a candidate is a snapshot of demand, competition and
 * supplier price at one moment. Approving a three-week-old one publishes a
 * product on the strength of evidence that has since moved, and the trend that
 * justified it may have collapsed.
 *
 * Superseded candidates are not deleted — they are marked EXPIRED so the
 * decision history stays intact and NOVA's past reasoning remains auditable.
 */
export async function getReviewQueue(filters: QueueFilters = {}) {
  const latestRun = await prisma.marketResearchRun.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  if (!latestRun) return [];

  return prisma.marketCandidate.findMany({
    where: {
      reviewStatus: "PENDING",
      runId: latestRun.id,
      ...(filters.minScore !== undefined
        ? { finalScore: { gte: filters.minScore } }
        : {}),
    },
    orderBy: [{ finalScore: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 50,
    include: { run: { select: { startedAt: true, region: true } } },
  });
}

/*
 * Retires candidates left pending from earlier runs.
 *
 * Called after a research run completes. Anything still awaiting a decision
 * from a previous run is superseded by definition: if the keyword still
 * represents an opportunity, the new run will have scored it again with current
 * evidence, and that fresher row is the one worth acting on.
 */
export async function expireSupersededCandidates(
  currentRunId: string,
): Promise<number> {
  const result = await prisma.marketCandidate.updateMany({
    where: {
      reviewStatus: "PENDING",
      runId: { not: currentRunId },
    },
    data: {
      reviewStatus: "EXPIRED",
      reviewNote:
        "Superseded by a newer research run. Its market evidence is no longer current.",
    },
  });

  return result.count;
}

/*
 * Candidates that were approved but could not be published.
 *
 * approveCandidate marks a candidate APPROVED before it attempts the publish,
 * then FAILED if the publisher refuses. The review queue only fetches PENDING
 * rows, so a refused candidate silently disappeared from the admin panel
 * carrying its error message with it — the operator saw a product they had
 * approved simply never arrive, with no way to find out why.
 *
 * These need to be surfaced at least as prominently as the queue itself. A
 * refusal is information; losing it is worse than the refusal.
 */
export async function getBlockedCandidates(limit = 25) {
  return prisma.marketCandidate.findMany({
    where: { reviewStatus: "FAILED" },
    orderBy: { reviewedAt: "desc" },
    take: limit,
  });
}

/*
 * Puts a failed candidate back in the queue.
 *
 * Useful when the refusal was environmental rather than a judgement: a research
 * re-run found a market price, a duplicate listing was retired, a supplier came
 * back in stock. The candidate is scored exactly as before — retrying does not
 * relax any gate, it just asks again.
 */
export async function retryCandidate(
  candidateId: string,
  adminId: string,
): Promise<ApprovalResult> {
  const row = await prisma.marketCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!row) {
    return { ok: false, message: "That candidate no longer exists." };
  }

  await prisma.marketCandidate.update({
    where: { id: candidateId },
    data: {
      reviewStatus: "PENDING",
      publishError: null,
      reviewedAt: null,
      reviewedBy: null,
    },
  });

  return approveCandidate(candidateId, adminId, "Retried after a failed publish.");
}
