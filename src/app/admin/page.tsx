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

export default async function AdminDashboardPage() {
  const [
    revenueAgg,
    orders30,
    pendingOrders,
    customers,
    liveProducts,
    lowStock,
    outOfStock,
    pendingCandidates,
    pendingRetirements,
    recentOrders,
  ] = await Promise.all([
    // Revenue counts money actually collected, so cancelled and pending
    // orders never inflate it.
    prisma.order.aggregate({
      _sum: { total: true },
      _count: { _all: true },
      where: { status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } },
    }),
    prisma.order.count({ where: { createdAt: { gte: since(30) } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.productVariant.count({
      where: { stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
    }),
    prisma.productVariant.count({ where: { stock: { lte: 0 } } }),
    prisma.marketCandidate.count({ where: { reviewStatus: "PENDING" } }),
    prisma.productLifecycle.count({ where: { pendingAction: { not: null } } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true, name: true } },
        items: { select: { id: true } },
      },
    }),
  ]);

  const revenue = Number(revenueAgg._sum.total ?? 0);
  const paidOrders = revenueAgg._count._all;
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
