"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, ShieldCheck, ShoppingCart, Trash2, Truck } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FEE = 79;

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart } = useCartStore();
  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  const shippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  if (items.length === 0) {
    return (
      <main className="mx-auto flex min-h-[65vh] max-w-3xl items-center px-6 py-20 text-center">
        <div className="w-full">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] border border-ink/10 bg-card text-ink-soft shadow-sm">
            <ShoppingCart className="h-8 w-8" />
          </div>
          <span className="section-kicker mt-7 inline-block">Your NovaCart bag</span>
          <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">Nothing here yet.</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-ink-soft">
            Your bag is ready when you are. Browse the collection and add something you genuinely want to bring home.
          </p>
          <Link href="/products" className="premium-button mt-8">Explore the collection <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="section-kicker">Your bag</span>
          <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">Your selections.</h1>
          <p className="mt-3 text-sm text-ink-soft">Review your items before checkout.</p>
        </div>
        <Link href="/products" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-poppy">Continue shopping <ChevronRight className="h-4 w-4" /></Link>
      </div>

      {shipping > 0 ? (
        <div className="mb-7 rounded-2xl border border-sage/20 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-ink-soft"><Truck className="h-4 w-4 text-sage" /> Add <strong className="text-ink">{formatCurrency(FREE_SHIPPING_THRESHOLD - subtotal)}</strong> more for free delivery.</div>
            <span className="font-tag font-bold text-sage">{Math.round(shippingProgress)}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-soft"><div className="h-full rounded-full bg-sage transition-all" style={{ width: `${shippingProgress}%` }} /></div>
        </div>
      ) : (
        <div className="mb-7 flex items-center gap-2 rounded-2xl border border-sage/20 bg-sage/5 px-4 py-3 text-xs font-semibold text-sage">
          <CheckCircle2 className="h-4 w-4" /> Free delivery unlocked.
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_390px]">
        <section className="space-y-3">
          {items.map((item) => {
            const quantity = item.quantity || 1;
            return (
              <article key={item.id} className="flex gap-4 rounded-[1.6rem] border border-ink/10 bg-card p-4 shadow-sm sm:p-5">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-cream sm:h-28 sm:w-28">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-ink-soft">No image</div>}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-ink sm:text-base">{item.title}</h2>
                      <p className="mt-1 font-tag text-[11px] text-ink-soft">{formatCurrency(item.price)} each</p>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="rounded-full p-2 text-ink-soft hover:bg-poppy/10 hover:text-poppy" aria-label={`Remove ${item.title}`}><Trash2 className="h-4 w-4" /></button>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center overflow-hidden rounded-full border border-ink/10 bg-cream">
                      <button onClick={() => updateQuantity(item.id, Math.max(1, quantity - 1))} className="grid h-9 w-9 place-items-center text-ink-soft hover:bg-cream-soft" aria-label="Decrease quantity">−</button>
                      <span className="w-8 text-center font-tag text-xs font-bold text-ink">{quantity}</span>
                      <button onClick={() => updateQuantity(item.id, quantity + 1)} className="grid h-9 w-9 place-items-center text-ink-soft hover:bg-cream-soft" aria-label="Increase quantity">+</button>
                    </div>
                    <span className="font-tag text-sm font-bold text-poppy">{formatCurrency(item.price * quantity)}</span>
                  </div>
                </div>
              </article>
            );
          })}

          <div className="flex items-center justify-between pt-3">
            <button onClick={clearCart} className="rounded-full border border-ink/10 bg-card px-4 py-2.5 text-xs font-semibold text-ink-soft hover:border-poppy/20 hover:text-poppy">Clear bag</button>
            <Link href="/products" className="text-sm font-semibold text-ink hover:text-poppy">Continue shopping</Link>
          </div>
        </section>

        <aside className="h-max lg:sticky lg:top-24">
          <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-[0_20px_60px_rgba(42,31,26,0.07)] sm:p-7">
            <span className="section-kicker">Order summary</span>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-ink-soft"><span>Delivery</span><span>{shipping === 0 ? "Free" : formatCurrency(shipping)}</span></div>
            </div>
            <div className="mt-6 flex items-end justify-between border-t border-ink/10 pt-6"><span className="text-sm font-semibold text-ink">Total</span><span className="font-tag text-2xl font-bold text-ink">{formatCurrency(total)}</span></div>
            <Link href="/checkout" className="premium-button mt-7 w-full">Proceed to checkout <ArrowRight className="h-4 w-4" /></Link>
            <div className="mt-6 space-y-3 border-t border-ink/10 pt-5 text-[11px] text-ink-soft">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sage" /> Secure checkout with server-side payment verification</div>
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-sage" /> Tracked delivery and simple returns</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
