// FILE: src/app/admin/research/page.tsx
//
// Start a research run on demand, and see the history of past runs.
//
// The scheduled job still fires every Monday at 03:00 UTC. This page exists for
// the times you do not want to wait for Monday — after changing the seed list,
// or when you want to explore one part of the catalogue now.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AdminForm, fieldClass, labelClass } from "@/components/admin/AdminForm";
import { triggerResearchAction } from "@/actions/admin-research";

export const dynamic = "force-dynamic";

/*
 * Seed windows.
 *
 * Research explores a rotating slice of the seed file each week rather than all
 * 108 seeds at once, because every seed costs live API calls. These labels let
 * you jump to a part of the catalogue instead of waiting for its turn.
 */
const WINDOWS = [
  { offset: "", label: "This week's rotation" },
  { offset: "0", label: "Kitchen, storage & cleaning" },
  { offset: "18", label: "Tools, car & phone accessories" },
  { offset: "36", label: "Computing, audio & home decor" },
  { offset: "54", label: "Pets, kids, stationery & fitness" },
  { offset: "72", label: "Travel, grooming & jewellery" },
  { offset: "90", label: "Festive, pooja, seasonal & hobbies" },
];

export default async function AdminResearchPage() {
  const runs = await prisma.marketResearchRun
    .findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      include: { _count: { select: { candidates: true } } },
    })
    .catch(() => []);

  const configured = Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_REPO,
  );

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        Market research
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Runs automatically every Monday at 03:00 UTC. Start one here when you
        don&apos;t want to wait. Nothing is published by a research run —
        candidates queue on the{" "}
        <Link href="/admin/candidates" className="text-poppy">
          Candidates
        </Link>{" "}
        tab for your decision.
      </p>

      {!configured && (
        <p className="mt-6 rounded-2xl border border-poppy/30 bg-poppy/5 p-5 text-sm leading-relaxed text-ink">
          Remote runs aren&apos;t configured yet. Add{" "}
          <span className="font-tag text-ink">GITHUB_DISPATCH_TOKEN</span> and{" "}
          <span className="font-tag text-ink">GITHUB_REPO</span> to your
          environment variables to enable this button. Until then, run{" "}
          <span className="font-tag text-ink">npm run research:market</span> on
          your own machine, or dispatch the workflow from the Actions tab on
          GitHub.
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
        <AdminForm
          action={triggerResearchAction}
          submitLabel="Start research run"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="limit">
                Candidates to evaluate
              </label>
              <input
                id="limit"
                name="limit"
                type="number"
                min={5}
                max={80}
                defaultValue={40}
                className={`mt-1 ${fieldClass}`}
              />
              <p className="mt-1 text-[11px] text-ink-soft">
                Each candidate costs live API calls, so a larger number takes
                proportionally longer. 40 runs in roughly 15 minutes.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="seedOffset">
                Part of the catalogue
              </label>
              <select
                id="seedOffset"
                name="seedOffset"
                defaultValue=""
                className={`mt-1 ${fieldClass}`}
              >
                {WINDOWS.map((window) => (
                  <option key={window.label} value={window.offset}>
                    {window.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-soft">
                Research explores a slice of the seed list each run. Pick one to
                explore it now instead of waiting for its turn.
              </p>
            </div>
          </div>
        </AdminForm>
      </div>

      <section className="mt-10 pb-16">
        <h2 className="text-lg font-semibold text-ink">Past runs</h2>

        {runs.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft">
            No research runs recorded yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Candidates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-ink/5">
                    <td className="px-4 py-3 text-ink">
                      {run.startedAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{run.region}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {run._count.candidates}
                    </td>
                    <td className="px-4 py-3 font-tag text-xs font-bold text-ink-soft">
                      {run.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
          A run started here executes on GitHub Actions, not on this server — a
          full pass takes longer than a web request is allowed to live. Progress
          is visible in the Actions tab of your repository.
        </p>
      </section>
    </main>
  );
}
