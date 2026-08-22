import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CreditCard,
  MapPin,
  Truck,
  AlertCircle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import PayPendingOrderButton from "@/components/PayPendingOrderButton";

const STEPS = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

function statusColor(status: string) {
  if (status === "CANCELLED" || status === "REFUNDED") {
    return "text-poppy";
  }

  if (status === "DELIVERED" || status === "PAID") {
    return "text-sage";
  }

  return "text-marigold";
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=/orders/${params.id}`);
  }

  const order = await prisma.order.findFirst({
    where: {
      id: params.id,
      userId: user.id,
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              variants: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const currentIndex = STEPS.indexOf(order.status);

  const address = (order.shippingAddress || {}) as Record<
    string,
    any
  >;

  const shippingFee = Number(address.shippingFee || 0);

  const isPendingRazorpay =
    order.paymentMethod === "RAZORPAY" &&
    order.status === "PENDING" &&
    Boolean(order.razorpayOrderId);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Link>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="section-kicker">Order details</span>

          <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">
            #{order.id.slice(0, 10).toUpperCase()}
          </h1>

          <p className="mt-3 text-sm text-ink-soft">
            Placed{" "}
            {new Date(order.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>

        <div
          className={`rounded-full bg-card px-4 py-2 font-tag text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm ${statusColor(
            order.status
          )}`}
        >
          {order.status}
        </div>
      </div>

      {isPendingRazorpay && (
        <div className="mt-8 rounded-[2rem] border border-marigold/20 bg-marigold/5 p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
              <AlertCircle className="h-5 w-5 text-marigold" />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-ink">
                Payment is still pending
              </h2>

              <p className="mt-1 text-sm leading-6 text-ink-soft">
                Your order has been created, but the Razorpay payment
                has not been completed yet.
              </p>

              <p className="mt-2 text-sm font-semibold text-ink">
                Amount due: {formatCurrency(Number(order.total))}
              </p>

              <PayPendingOrderButton
                orderId={order.id}
                amount={Number(order.total)}
              />
            </div>
          </div>
        </div>
      )}

      {order.status === "CANCELLED" ||
      order.status === "REFUNDED" ? (
        <div className="mt-8 rounded-2xl border border-poppy/20 bg-poppy/5 p-5 text-sm text-poppy-dark">
          This order is {order.status.toLowerCase()}. If you need
          help, contact NovaCart support.
        </div>
      ) : (
        <div className="mt-10 rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-8">
          <div className="grid grid-cols-5 gap-1">
            {STEPS.map((step, index) => {
              const active = currentIndex >= index;

              return (
                <div
                  key={step}
                  className="relative text-center"
                >
                  <div
                    className={`mx-auto grid h-9 w-9 place-items-center rounded-full border-2 ${
                      active
                        ? "border-poppy bg-poppy text-white"
                        : "border-ink/10 bg-cream text-ink-soft"
                    }`}
                  >
                    {active ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </div>

                  <p
                    className={`mt-3 text-[9px] font-bold uppercase tracking-[0.12em] ${
                      active
                        ? "text-ink"
                        : "text-ink-soft/60"
                    }`}
                  >
                    {step}
                  </p>

                  {index < STEPS.length - 1 && (
                    <span
                      className={`absolute left-1/2 top-[17px] h-[2px] w-full -translate-y-1/2 ${
                        currentIndex > index
                          ? "bg-poppy"
                          : "bg-ink/10"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-ink">
                Items
              </h2>

              <span className="font-tag text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {order.items.length} item(s)
              </span>
            </div>

            <div className="mt-5 divide-y divide-ink/10">
              {order.items.map((item: any) => {
                const image =
                  item.product?.variants?.find(
                    (variant: any) => variant.imageUrl
                  )?.imageUrl;

                return (
                  <div
                    key={item.id}
                    className="flex gap-4 py-5 first:pt-0 last:pb-0"
                  >
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-cream">
                      {image ? (
                        <img
                          src={image}
                          alt={
                            item.product?.title ||
                            "Product"
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] text-ink-soft">
                          No image
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {item.product?.title || "Product"}
                      </p>

                      <p className="mt-1 text-xs text-ink-soft">
                        Qty {item.quantity} ·{" "}
                        {formatCurrency(
                          Number(item.price)
                        )}{" "}
                        each
                      </p>
                    </div>

                    <span className="shrink-0 font-tag text-sm font-bold text-ink">
                      {formatCurrency(
                        Number(item.price) *
                          item.quantity
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm">
              <MapPin className="h-5 w-5 text-poppy" />

              <h3 className="mt-4 text-sm font-bold text-ink">
                Delivery address
              </h3>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {address.fullName}
                <br />
                {address.line1}
                {address.line2
                  ? `, ${address.line2}`
                  : ""}
                <br />
                {address.city}, {address.state}{" "}
                {address.postalCode}
                <br />
                {address.country}
                <br />
                {address.phone}
              </p>
            </div>

            <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm">
              <CreditCard className="h-5 w-5 text-sage" />

              <h3 className="mt-4 text-sm font-bold text-ink">
                Payment
              </h3>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Method:{" "}
                <strong className="text-ink">
                  {order.paymentMethod}
                </strong>
                <br />
                Status:{" "}
                <strong
                  className={statusColor(
                    order.status
                  )}
                >
                  {order.status}
                </strong>

                {order.paidAt && (
                  <>
                    <br />
                    Paid:{" "}
                    {new Date(
                      order.paidAt
                    ).toLocaleString("en-IN")}
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        <aside className="h-max lg:sticky lg:top-24">
          <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-[0_20px_60px_rgba(42,31,26,0.07)] sm:p-7">
            <span className="section-kicker">
              Summary
            </span>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between text-ink-soft">
                <span>Items</span>

                <span>
                  {formatCurrency(
                    Number(order.total) -
                      shippingFee
                  )}
                </span>
              </div>

              <div className="flex justify-between text-ink-soft">
                <span>Delivery</span>

                <span>
                  {shippingFee
                    ? formatCurrency(
                        shippingFee
                      )
                    : "Free"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between border-t border-ink/10 pt-6">
              <span className="text-sm font-semibold text-ink">
                Order total
              </span>

              <span className="font-tag text-2xl font-bold text-ink">
                {formatCurrency(
                  Number(order.total)
                )}
              </span>
            </div>

            <div className="mt-6 rounded-2xl bg-cream p-4 text-xs leading-5 text-ink-soft">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Truck className="h-4 w-4 text-sage" />
                Delivery updates
              </div>

              <p className="mt-2">
                Your saved contact details are used
                for order updates. Tracking information
                will appear here once the order is
                shipped.
              </p>
            </div>

            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-poppy"
            >
              Continue shopping
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}