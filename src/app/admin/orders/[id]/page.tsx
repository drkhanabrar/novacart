// FILE: src/app/admin/orders/[id]/page.tsx
//
// Single order: what was bought, where it goes, and the controls to move it
// through fulfilment.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import {
  ActionButton,
  AdminForm,
  fieldClass,
  labelClass,
} from "@/components/admin/AdminForm";
import {
  updateOrderStatusAction,
  updateOrderDeliveryAction,
  deleteOrderAction,
} from "@/actions/admin-commerce";
import { ORDER_STATUSES } from "@/lib/order-status";

export const dynamic = "force-dynamic";

interface Address {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true } },
      items: {
        include: {
          product: { select: { id: true, title: true, slug: true } },
          fulfillment: true,
        },
      },
    },
  });

  if (!order) notFound();

  const address = (order.shippingAddress ?? null) as Address | null;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/admin/orders" className="text-sm text-poppy">
        ← All orders
      </Link>

      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {formatCurrency(Number(order.total))}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {order.paymentMethod} · placed{" "}
            {order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            {order.paidAt &&
              ` · paid ${order.paidAt.toISOString().slice(0, 10)}`}
          </p>
        </div>
        <p className="font-tag text-sm font-bold text-poppy">{order.status}</p>
      </header>

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-card p-5">
          <h2 className="font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            Customer
          </h2>
          <p className="mt-2 text-ink">
            <Link
              href={`/admin/customers/${order.user.id}`}
              className="hover:text-poppy"
            >
              {order.user.name || order.user.email}
            </Link>
          </p>
          <p className="text-sm text-ink-soft">{order.user.email}</p>
          {(order.contactPhone || order.user.phone) && (
            <p className="text-sm text-ink-soft">
              {order.contactPhone || order.user.phone}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-ink/10 bg-card p-5">
          <h2 className="font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            Shipping to
          </h2>
          {address ? (
            <address className="mt-2 text-sm not-italic leading-relaxed text-ink-soft">
              {address.fullName && (
                <span className="block text-ink">{address.fullName}</span>
              )}
              {address.line1}
              {address.line2 && <>, {address.line2}</>}
              <br />
              {address.city}, {address.state} {address.postalCode}
              <br />
              {address.country}
              {address.phone && <> · {address.phone}</>}
            </address>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">
              No shipping address was captured on this order.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Items</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Line</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-ink/5">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/catalog/${item.product.id}`}
                      className="text-ink hover:text-poppy"
                    >
                      {item.product.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{item.quantity}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {formatCurrency(Number(item.price))}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {formatCurrency(Number(item.price) * item.quantity)}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {item.fulfillment?.status ?? "not ordered"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 pb-16">
        <h2 className="text-lg font-semibold text-ink">Update status</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Marking an order refunded also records a refund against each product,
          which is how NOVA learns a product&apos;s real return rate instead of
          assuming one from its category.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ORDER_STATUSES.filter((value) => value !== order.status).map(
            (value) => (
              <ActionButton
                key={value}
                action={updateOrderStatusAction}
                values={{ orderId: order.id, status: value }}
                label={value.charAt(0) + value.slice(1).toLowerCase()}
                tone={
                  value === "REFUNDED" || value === "CANCELLED"
                    ? "danger"
                    : value === "DELIVERED"
                      ? "primary"
                      : "quiet"
                }
                confirm={value === "REFUNDED" || value === "CANCELLED"}
              />
            ),
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Delivery details</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Items, quantities and prices are deliberately not editable. That is the
          customer&apos;s receipt and your sales record — use Cancel or Refund to
          unwind an order rather than rewriting what it says.
        </p>

        <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
          <AdminForm
            action={updateOrderDeliveryAction}
            hidden={{ orderId: order.id }}
            submitLabel="Save delivery details"
          >
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="fullName">
                    Recipient
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    defaultValue={address?.fullName ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="addressPhone">
                    Delivery phone
                  </label>
                  <input
                    id="addressPhone"
                    name="addressPhone"
                    defaultValue={address?.phone ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="line1">
                  Address line 1
                </label>
                <input
                  id="line1"
                  name="line1"
                  defaultValue={address?.line1 ?? ""}
                  className={`mt-1 ${fieldClass}`}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="line2">
                  Address line 2
                </label>
                <input
                  id="line2"
                  name="line2"
                  defaultValue={address?.line2 ?? ""}
                  className={`mt-1 ${fieldClass}`}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass} htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    defaultValue={address?.city ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="state">
                    State
                  </label>
                  <input
                    id="state"
                    name="state"
                    defaultValue={address?.state ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="postalCode">
                    PIN code
                  </label>
                  <input
                    id="postalCode"
                    name="postalCode"
                    defaultValue={address?.postalCode ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="country">
                    Country
                  </label>
                  <input
                    id="country"
                    name="country"
                    defaultValue={address?.country ?? "India"}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="contactPhone">
                    Contact phone on order
                  </label>
                  <input
                    id="contactPhone"
                    name="contactPhone"
                    defaultValue={order.contactPhone ?? ""}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
              </div>
            </div>
          </AdminForm>
        </div>
      </section>

      <section className="mt-10 pb-16">
        <h2 className="text-lg font-semibold text-ink">Delete this order</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          For clearing test data. Deleting a real order destroys the
          customer&apos;s purchase record and your sales history, and it cannot be
          undone. Any sales telemetry linked to this order is removed with it, so
          a test purchase stops counting toward that product&apos;s conversion
          rate.
        </p>
        <div className="mt-4">
          <ActionButton
            action={deleteOrderAction}
            values={{ orderId: order.id }}
            label="Delete order permanently"
            tone="danger"
            confirm
          />
        </div>
      </section>
    </main>
  );
}
