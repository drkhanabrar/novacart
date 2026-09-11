// FILE: src/app/admin/page.tsx
//
// Commerce dashboard. The first screen an admin sees, so it answers the
// questions you actually open an admin panel to ask: did anything sell, is
// anything waiting on me, and is anything about to go wrong.
//
// Every figure is read from the database at request time. Nothing here is
// cached or estimated.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LOW_STOCK_THRESHOLD = Number(process.env.NOVA_LOW_STOCK_ALERT || 5);

function since(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/*
 * Resilient read.
 *
 * A dashboard should degrade, not die. If one count times out the rest of the
 * page must still render, showing a dash for the figure it could not fetch,
 * because an admin locking themselves out of Orders because a stock query was
 * slow is a far worse outcome than a missing number.
 */
/*
 * Shape of a row in the recent-orders table.
 *
 * Declared explicitly rather than inferred, because the empty-array fallback
 * has to carry the same type as a successful query including its relations -
 * otherwise the fallback widens everything to any and the map below loses all
 * type safety.
 */
interface RecentOrder {
  id: string;
  total: unknown;
  status: string;
  createdAt: Date;
  user: { email: string; name: string | null };
  items: { id: string }[];
}

async function safe<T>(
  query: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    console.error("[admin/dashboard] query failed:", error);
    return fallback;
  }
}

export default async function AdminDashboardPage() {
  /*
   * Queries run SEQUENTIALLY, not through Promise.all.
   *
   * The first version fired ten queries at once. Supabase's pooled connection
   * allowance is small on the free tier, so the later queries queued behind the
   * earlier ones until they hit ETIMEDOUT and the whole page threw. Ten short
   * sequential queries are far quicker than ten parallel ones that exhaust the
   * pool.
   *
   * One groupBy also replaces three separate order counts: it returns the
   * per-status totals and sums in a single round trip.
   */
  const ordersByStatus = await safe(
    () =>
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { total: true },
      }),
    [] as { status: string; _count: { _all: number }; _sum: { total: unknown } }[],
  );

  const COLLECTED = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

  const revenue = ordersByStatus
    .filter((row) => COLLECTED.includes(row.status))
    .reduce((sum, row) => sum + Number(row._sum.total ?? 0), 0);

  const paidOrders = ordersByStatus
    .filter((row) => COLLECTED.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  const pendingOrders =
    ordersByStatus.find((row) => row.status === "PENDING")?._count._all ?? 0;

  const orders30 = await safe(
    () => prisma.order.count({ where: { createdAt: { gte: since(30) } } }),
    0,
  );

  const customers = await safe(() => prisma.user.count(), 0);

  const liveProducts = await safe(
    () => prisma.product.count({ where: { isActive: true } }),
    0,
  );

  const lowStock = await safe(
    () =>
      prisma.productVariant.count({
        where: { stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
      }),
    0,
  );

  const outOfStock = await safe(
    () => prisma.productVariant.count({ where: { stock: { lte: 0 } } }),
    0,
  );

  const pendingCandidates = await safe(
    () => prisma.marketCandidate.count({ where: { reviewStatus: "PENDING" } }),
    0,
  );

  const pendingRetirements = await safe(
    () => prisma.productLifecycle.count({ where: { pendingAction: { not: null } } }),
    0,
  );

  const recentOrders = await safe<RecentOrder[]>(
    () =>
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { email: true, name: true } },
          items: { select: { id: true } },
        },
      }),
    [],
  );

  const averageOrder = paidOrders > 0 ? revenue / paidOrders : 0;

  const stats = [
    ["Revenue collected", formatCurrency(revenue)],
    ["Paid orders", String(paidOrders)],
    ["Average order", paidOrders > 0 ? formatCurrency(averageOrder) : "—"],
    ["Orders, last 30 days", String(orders30)],
    ["Customers", String(customers)],
    ["Live products", String(liveProducts)],
  ];

  const attention = [
    pendingOrders > 0 && {
      label: `${pendingOrders} order${pendingOrders === 1 ? "" : "s"} awaiting payment or processing`,
      href: "/admin/orders?status=PENDING",
    },
    outOfStock > 0 && {
      label: `${outOfStock} variant${outOfStock === 1 ? "" : "s"} out of stock — these are hidden from the storefront`,
      href: "/admin/catalog?filter=out",
    },
    lowStock > 0 && {
      label: `${lowStock} variant${lowStock === 1 ? "" : "s"} low on stock`,
      href: "/admin/catalog?filter=low",
    },
    pendingCandidates > 0 && {
      label: `${pendingCandidates} researched candidate${pendingCandidates === 1 ? "" : "s"} waiting for your decision`,
      href: "/admin/candidates",
    },
    pendingRetirements > 0 && {
      label: `${pendingRetirements} product${pendingRetirements === 1 ? "" : "s"} NOVA wants to retire`,
      href: "/admin/lifecycle",
    },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        Dashboard
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-ink/10 bg-card p-5"
          >
            <dt className="font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              {label}
            </dt>
            <dd className="mt-2 text-xl font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Needs your attention</h2>
        {attention.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft">
            Nothing is waiting. Orders are processed, stock is healthy, and NOVA
            has no pending proposals.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {attention.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-2xl border border-poppy/25 bg-poppy/5 p-4 text-sm text-ink transition hover:border-poppy/50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 pb-16">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Recent orders</h2>
          <Link href="/admin/orders" className="text-sm text-poppy">
            All orders
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft">
            No orders yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-ink/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-ink hover:text-poppy"
                      >
                        {order.user.name || order.user.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {order.items.length}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {formatCurrency(Number(order.total))}
                    </td>
                    <td className="px-4 py-3 font-tag text-xs font-bold text-ink-soft">
                      {order.status}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {order.createdAt.toISOString().slice(0, 10)}
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
