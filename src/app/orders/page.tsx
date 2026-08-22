import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronRight, Package } from "lucide-react";
import { getUserOrders } from "@/actions/orders";
import { getCurrentUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

function statusClass(status: string) {
  switch (status) {
    case "PAID":
    case "DELIVERED":
      return "bg-sage/10 text-sage";
    case "SHIPPED":
      return "bg-blue-50 text-blue-700";
    case "PROCESSING":
      return "bg-marigold/15 text-marigold";
    case "CANCELLED":
    case "REFUNDED":
      return "bg-poppy/10 text-poppy";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/orders");
  const result = await getUserOrders();
  const orders = result.orders || [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="section-kicker">My NovaCart</span>
          <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">Your orders.</h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">Track every purchase from one place.</p>
        </div>
        <Link href="/account" className="text-sm font-semibold text-ink hover:text-poppy">Account settings <ChevronRight className="inline h-4 w-4" /></Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-[2rem] border border-ink/10 bg-card p-16 text-center shadow-sm sm:p-20">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cream text-poppy"><Package className="h-7 w-7" /></div>
          <span className="section-kicker mt-7 inline-block">Your history</span>
          <h2 className="mt-2 font-display text-3xl italic text-ink">No orders yet.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">Your completed and in-progress NovaCart purchases will appear here.</p>
          <Link href="/products" className="premium-button mt-7">Start shopping <ArrowRight className="h-4 w-4" /></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => (
            <Link key={order.id} href={`/orders/${order.id}`} className="group block rounded-[2rem] border border-ink/10 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-poppy/20 hover:shadow-lg sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-5">
                <div><span className="field-label">Order</span><p className="mt-1 font-tag text-xs font-bold text-ink">#{order.id.slice(0, 10).toUpperCase()}</p></div>
                <div><span className="field-label">Placed</span><p className="mt-1 text-sm text-ink-soft">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p></div>
                <div><span className="field-label">Total</span><p className="mt-1 font-tag text-sm font-bold text-poppy">{formatCurrency(Number(order.total))}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${statusClass(order.status)}`}>{order.status}</span>
                <ChevronRight className="hidden h-5 w-5 text-ink-soft transition group-hover:translate-x-0.5 group-hover:text-poppy sm:block" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {order.items.slice(0, 4).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-cream/70 px-4 py-3 text-sm">
                    <span className="truncate text-ink-soft">{item.product?.title || "Product"} <span className="text-ink-soft/70">× {item.quantity}</span></span>
                    <span className="shrink-0 font-semibold text-ink">{formatCurrency(Number(item.price) * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {order.items.length > 4 && <p className="mt-3 text-xs text-ink-soft">+ {order.items.length - 4} more item(s)</p>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
