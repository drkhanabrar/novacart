"use server";

// FILE: src/actions/admin.ts
//
// Every write the admin console performs. All of them re-check the admin role
// server-side rather than trusting that the page rendered — a server action is a
// public HTTP endpoint, and hiding a button is not access control.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  approveCandidate,
  rejectCandidate,
} from "@/lib/services/candidate-approval";
import { resolvePendingAction } from "@/lib/services/product-lifecycle";

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function guard(): Promise<
  { ok: true; adminId: string } | { ok: false; message: string }
> {
  try {
    const admin = await requireAdmin();
    return { ok: true, adminId: admin.id };
  } catch {
    return {
      ok: false,
      message: "You are not signed in as an administrator.",
    };
  }
}

function text(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/// Approve a researched candidate and publish it to the storefront.
export async function approveCandidateAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const candidateId = text(formData.get("candidateId"));
  if (!candidateId) {
    return { ok: false, message: "No candidate was specified." };
  }

  const result = await approveCandidate(
    candidateId,
    auth.adminId,
    text(formData.get("note")),
  );

  revalidatePath("/admin/candidates");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");

  return { ok: result.ok, message: result.message };
}

export async function rejectCandidateAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const candidateId = text(formData.get("candidateId"));
  if (!candidateId) {
    return { ok: false, message: "No candidate was specified." };
  }

  const result = await rejectCandidate(
    candidateId,
    auth.adminId,
    text(formData.get("note")),
  );

  revalidatePath("/admin/candidates");

  return { ok: result.ok, message: result.message };
}

/*
 * Answer a retirement NOVA proposed.
 *
 * "RETIRE" removes the product from the storefront. "KEEP" returns it to its
 * previous state and clears the deterioration counter, which means NOVA must
 * build its case again from scratch rather than retiring it on the next pass.
 */
export async function resolveRetirementAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const productId = text(formData.get("productId"));
  const verdict = text(formData.get("verdict"));

  if (!productId || (verdict !== "RETIRE" && verdict !== "KEEP")) {
    return { ok: false, message: "That request was not understood." };
  }

  const result = await resolvePendingAction(
    productId,
    verdict === "RETIRE",
    auth.adminId,
  );

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/products");
  revalidatePath("/");

  if (!result.applied) {
    return {
      ok: false,
      message: "There was no pending decision on that product.",
    };
  }

  return {
    ok: true,
    message:
      verdict === "RETIRE"
        ? "Product retired and removed from the storefront."
        : `Product kept and returned to ${result.state}.`,
  };
}
