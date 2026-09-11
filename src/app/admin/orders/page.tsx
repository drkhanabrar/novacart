// FILE: src/app/admin/orders/page.tsx
//
// Order list with status filtering. The workhorse screen of any store admin.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUSES, isOrderStatus } from "@/lib/order-status";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  PENDING: "text-poppy",
  PAID: "text-sage",
  PROCESSING: "text-ink",
  SHIPPED: "text-ink",
  DELIVERED: "text-sage",
  CANCELLED: "text-ink-soft",
  REFUNDED: "text-poppy",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;

  const where = {
    ...(isOrderStatus(status) ? { status } : {}),
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { email: true, name: true } },
        items: { select: { id: true, quantity: true } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (value: string) =>
    counts.find((row) => row.status === value)?._count._all ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        Orders
      </h1>

      <nav className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-full border px-4 py-1.5 text-sm ${
            !status
              ? "border-poppy bg-poppy/10 text-ink"
              : "border-ink/15 text-ink-soft hover:bg-cream-soft"
          }`}
        >
          All
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/orders?status=${value}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              status === value
                ? "border-poppy bg-poppy/10 text-ink"
                : "border-ink/15 text-ink-soft hover:bg-cream-soft"
            }`}
          >
            {value.charAt(0) + value.slice(1).toLowerCase()} ({countFor(value)})
          </Link>
        ))}
      </nav>

      <form className="mt-5" action="/admin/orders">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by customer name or email"
          className="w-full max-w-md rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
        />
      </form>

      {orders.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          No orders match this view.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Units</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
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
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {formatCurrency(Number(order.total))}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {order.paymentMethod}
                  </td>
                  <td
                    className={`px-4 py-3 font-tag text-xs font-bold ${
                      TONE[order.status] ?? "text-ink"
                    }`}
                  >
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
    </main>
  );
}
