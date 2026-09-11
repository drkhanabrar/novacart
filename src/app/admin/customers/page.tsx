// FILE: src/app/admin/customers/page.tsx

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const customers = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    include: {
      orders: { select: { total: true, status: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        Customers
      </h1>

      <form className="mt-5" action="/admin/customers">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or email"
          className="w-full max-w-md rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
        />
      </form>

      {customers.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          No customers found.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium">Lifetime value</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                // Only money actually collected counts toward lifetime value.
                const spend = customer.orders
                  .filter((order) =>
                    ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(
                      order.status,
                    ),
                  )
                  .reduce((sum, order) => sum + Number(order.total), 0);

                return (
                  <tr key={customer.id} className="border-b border-ink/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="text-ink hover:text-poppy"
                      >
                        {customer.name || customer.email}
                      </Link>
                      {customer.name && (
                        <span className="block text-[11px] text-ink-soft">
                          {customer.email}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {customer._count.orders}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {spend > 0 ? formatCurrency(spend) : "—"}
                    </td>
                    <td className="px-4 py-3 font-tag text-xs font-bold text-ink-soft">
                      {customer.role}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {customer.createdAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
