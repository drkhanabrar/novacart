"use server";

// FILE: src/actions/admin-research.ts
//
// Triggering a research run from the admin panel.
//
// The run is NOT executed inside this request. A full pass takes ten to twenty
// minutes — it queries Google Trends, News, Reddit, DuckDuckGo, Amazon and CJ
// for every candidate, then calls an LLM for the strongest ones. Vercel caps a
// serverless function at 60 seconds on Hobby and 300 on Pro, so an in-request
// run would always be killed part-way through, leaving a half-written research
// run in the database.
//
// Instead this dispatches the GitHub Actions workflow, which runs on a normal
// runner with no such limit. That is the same job the Monday schedule fires;
// the button just starts it early.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export interface ResearchTriggerResult {
  ok: boolean;
  message: string;
}

export async function triggerResearchAction(
  formData: FormData,
): Promise<ResearchTriggerResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "You are not signed in as an administrator." };
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();

  if (!token || !repo) {
    return {
      ok: false,
      message:
        "Remote runs are not configured. Add GITHUB_DISPATCH_TOKEN and GITHUB_REPO to your environment variables, or run `npm run research:market` locally.",
    };
  }

  const limitRaw = Number(formData.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? String(Math.min(80, Math.max(5, Math.floor(limitRaw))))
      : "40";

  const offsetRaw = formData.get("seedOffset");
  const seedOffset =
    typeof offsetRaw === "string" && offsetRaw.trim() !== ""
      ? String(Math.max(0, Math.floor(Number(offsetRaw)) || 0))
      : "";

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/nova-market-research.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            limit,
            // Empty string means "use the normal weekly rotation".
            seedOffset,
          },
        }),
      },
    );

    if (response.status === 204) {
      return {
        ok: true,
        message: `Research run started for ${limit} candidates${
          seedOffset ? ` from seed ${seedOffset}` : ""
        }. It takes roughly 10–20 minutes; new candidates appear on the Candidates tab when it finishes.`,
      };
    }

    const detail = await response.text();

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message:
          "GitHub rejected the token. It needs the `workflow` scope (classic) or Actions write permission (fine-grained), and must not be expired.",
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        message: `GitHub could not find the workflow. Check GITHUB_REPO is "owner/repo" (currently "${repo}") and that nova-market-research.yml exists on the main branch.`,
      };
    }

    return {
      ok: false,
      message: `GitHub returned ${response.status}. ${detail.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach GitHub: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  } finally {
    revalidatePath("/admin/research");
  }
}
