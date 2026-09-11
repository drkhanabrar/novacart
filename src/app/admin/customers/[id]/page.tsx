// FILE: src/app/admin/customers/[id]/page.tsx
//
// A customer's record. Deliberately read-mostly: an admin can see history, end
// sessions and change role, but there is no way to read or set a password. An
// admin should never be able to become a customer.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { ActionButton } from "@/components/admin/AdminForm";
import {
  setCustomerRoleAction,
  revokeCustomerSessionsAction,
} from "@/actions/admin-commerce";

export const dynamic = "force-dynamic";

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await prisma.user.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { isDefault: "desc" } },
      orders: {
        orderBy: { createdAt: "desc" },
        include: { items: { select: { id: true } } },
      },
      _count: { select: { sessions: true } },
    },
  });

  if (!customer) notFound();

  const spend = customer.orders
    .filter((order) =>
      ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status),
    )
    .reduce((sum, order) => sum + Number(order.total), 0);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/admin/customers" className="text-sm text-poppy">
        ← Customers
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {customer.name || customer.email}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {customer.email}
        {customer.phone && ` · ${customer.phone}`} · joined{" "}
        {customer.createdAt.toISOString().slice(0, 10)}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Orders", String(customer.orders.length)],
          ["Lifetime value", spend > 0 ? formatCurrency(spend) : "—"],
          ["Role", customer.role],
          ["Active sessions", String(customer._count.sessions)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-ink/10 bg-card p-4"
          >
            <dt className="font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              {label}
            </dt>
            <dd className="mt-1 text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Addresses</h2>
        {customer.addresses.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft">
            No saved addresses.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft"
              >
                <p className="font-tag text-[10px] uppercase tracking-[0.12em]">
                  {address.label}
                  {address.isDefault && " · default"}
                </p>
                <p className="mt-2 text-ink">{address.fullName}</p>
                {address.line1}
                {address.line2 && <>, {address.line2}</>}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.country} · {address.phone}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Order history</h2>
        {customer.orders.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-card p-5 text-sm text-ink-soft">
            This customer has not ordered yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Placed</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((order) => (
                  <tr key={order.id} className="border-b border-ink/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-ink hover:text-poppy"
                      >
                        {order.createdAt.toISOString().slice(0, 10)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 pb-16">
        <h2 className="text-lg font-semibold text-ink">Account controls</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Passwords cannot be read or changed from here by design. If this
          customer is locked out, they should use the password reset flow.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            action={revokeCustomerSessionsAction}
            values={{ userId: customer.id }}
            label="Sign out everywhere"
            tone="quiet"
            confirm
          />
          <ActionButton
            action={setCustomerRoleAction}
            values={{
              userId: customer.id,
              role: customer.role === "ADMIN" ? "USER" : "ADMIN",
            }}
            label={
              customer.role === "ADMIN"
                ? "Remove admin access"
                : "Make administrator"
            }
            tone={customer.role === "ADMIN" ? "danger" : "primary"}
            confirm
          />
        </div>
      </section>
    </main>
  );
}
