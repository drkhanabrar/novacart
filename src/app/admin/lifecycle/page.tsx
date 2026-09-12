// FILE: src/app/admin/lifecycle/page.tsx
//
// The deselection screen.
//
// When NOVA concludes a live product is underperforming it does not remove it.
// It raises the case here, with the evidence, and waits. Approving retires the
// product and it disappears from the storefront; declining returns it to its
// previous state and resets the deterioration count, so NOVA has to rebuild its
// argument from scratch rather than asking again tomorrow.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DecisionForm } from "@/components/admin/DecisionForm";
import { resolveRetirementAction } from "@/actions/admin";

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

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [pending, lifecycles] = await Promise.all([
    prisma.productLifecycle.findMany({
      where: { pendingAction: { not: null } },
      include: {
        product: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { pendingRaisedAt: "asc" },
    }),
    prisma.productLifecycle.findMany({
      where: q
        ? {
            product: {
              title: { contains: q, mode: "insensitive" },
            },
          }
        : {},
      include: {
        product: {
          select: { id: true, title: true, slug: true, isActive: true },
        },
      },
      orderBy: [{ exposure: "desc" }, { updatedAt: "desc" }],
      take: 120,
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Live products
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {pending.length === 0
            ? "Nothing needs your decision right now."
            : `${pending.length} product${pending.length === 1 ? "" : "s"} NOVA wants to retire. Nothing is removed until you approve it.`}
        </p>
      </header>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">
            Retirement proposed
          </h2>
          <ul className="mt-4 grid gap-4">
            {pending.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-poppy/30 bg-poppy/5 p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Link
                    href={`/products/${row.product.slug}`}
                    className="text-lg font-semibold text-ink hover:text-poppy"
                  >
                    {row.product.title}
                  </Link>
                  <p className="font-tag text-[11px] text-ink-soft">
                    {row.state} · {row.exposure}% exposure
                  </p>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {row.pendingReason}
                </p>

                <p className="mt-2 font-tag text-[11px] text-ink-soft">
                  Raised{" "}
                  {row.pendingRaisedAt?.toISOString().slice(0, 10) ??
                    "recently"}{" "}
                  after {row.declineReadings} deteriorating review
                  {row.declineReadings === 1 ? "" : "s"}
                </p>

                <DecisionForm
                  action={resolveRetirementAction}
                  hidden={{ productId: row.productId }}
                  fieldName="verdict"
                  options={[
                    {
                      label: "Remove from store",
                      value: "RETIRE",
                      tone: "danger",
                      confirm: true,
                    },
                    { label: "Keep it listed", value: "KEEP", tone: "quiet" },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 pb-16">
        <h2 className="text-lg font-semibold text-ink">Lifecycle</h2>

        <form className="mt-3" action="/admin/lifecycle">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search tracked products"
            className="w-full max-w-md rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
          />
        </form>
        <p className="mt-1 text-sm text-ink-soft">
          Exposure is the merchandising weight the storefront sorts by. NOVA
          lowers it before it ever proposes removing something.
        </p>

        {lifecycles.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
            No products are being tracked yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Exposure</th>
                  <th className="px-4 py-3 font-medium">Live</th>
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
                      {row.product.isActive ? "yes" : "no"}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {row.lastReviewedAt?.toISOString().slice(0, 10) ??
                        "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
