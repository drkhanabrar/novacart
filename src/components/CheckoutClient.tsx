"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MapPin, ShieldCheck, ArrowRight, CreditCard } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { createOrder, createRazorpayOrder, verifyRazorpayPayment } from "@/actions/checkout";
import { formatCurrency } from "@/lib/utils";

interface CheckoutUser {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  addresses?: Array<{
    id: string;
    label: string;
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

let razorpayLoader: Promise<void> | null = null;

function loadRazorpay() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser required."));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoader) return razorpayLoader;

  razorpayLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay Checkout.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(script);
  });

  return razorpayLoader;
}

export default function CheckoutClient({
  user,
  razorpayKeyId,
}: {
  user: CheckoutUser;
  razorpayKeyId: string;
}) {
  const router = useRouter();
  const { items, clearCart } = useCartStore();
  const [selectedAddress, setSelectedAddress] = useState(
    user.addresses?.find((a) => a.isDefault)?.id || user.addresses?.[0]?.id || "",
  );
  const [paymentMethod, setPaymentMethod] = useState<"RAZORPAY" | "COD">("RAZORPAY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 999 ? 0 : 79;
  const total = subtotal + shipping;

  async function placeOrder() {
    setError(null);
    if (!items.length) return setError("Your bag is empty.");
    if (!selectedAddress) return setError("Please select or add a delivery address.");

    setLoading(true);

    try {
      if (paymentMethod === "COD") {
        const result = await createOrder(
          items.map((item) => ({ id: item.id, quantity: item.quantity })),
          selectedAddress,
        );

        if (result.error) setError(result.error);
        else if (result.orderId) {
          clearCart();
          setOrderId(result.orderId);
        }
        return;
      }

      const result = await createRazorpayOrder(
        items.map((item) => ({ id: item.id, quantity: item.quantity })),
        selectedAddress,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      await loadRazorpay();

      if (!window.Razorpay) {
        setError("Razorpay Checkout is unavailable right now. Please try again.");
        return;
      }

      const rzp = new window.Razorpay({
        key: razorpayKeyId || result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: "NovaCart",
        description: "NovaCart purchase",
        order_id: result.razorpayOrderId,
        prefill: {
          name: user.name || "",
          email: user.email,
          contact: user.phone || user.addresses?.find((a) => a.id === selectedAddress)?.phone || "",
        },
        notes: {
          novacart_order_id: result.orderId,
        },
        theme: {
          color: "#D94A4A",
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setLoading(true);
          if (
            !result.orderId ||
            !response.razorpay_order_id ||
            !response.razorpay_payment_id ||
            !response.razorpay_signature
          ) {
            setError(
              "Razorpay did not return all required payment details. Please try again.",
            );
            setLoading(false);
            return;
          }

          const verification = await verifyRazorpayPayment(
            result.orderId,
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          );

          if (verification.error) {
            setError(verification.error);
            setLoading(false);
            return;
          }

          if (!result.orderId) {
            setError(
              "Payment was verified, but the NovaCart order could not be identified.",
            );
            setLoading(false);
            return;
          }

          clearCart();
          setOrderId(result.orderId);
          setLoading(false);
          router.refresh();
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      rzp.open();
    } catch (paymentError) {
      console.error(paymentError);
      setError("We could not start the payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (orderId) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-8 w-8" />
        </div>
        <span className="section-kicker mt-6 inline-block">Order confirmed</span>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-ink">
          Thank you, {user.name?.split(" ")[0] || "there"}.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-ink-soft">
          Your order <strong className="text-ink">#{orderId.slice(0, 8).toUpperCase()}</strong> has been confirmed. We&apos;ll use your saved contact details for order updates.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/orders" className="premium-button">
            View orders <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/products" className="rounded-full border border-ink/10 px-5 py-3 text-sm font-bold text-slate-700">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-6 lg:py-16">
      <div className="mb-10">
        <div className="mb-7 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]">
          <span className="rounded-full bg-poppy px-3 py-1.5 text-white">1 Delivery</span>
          <span className="h-px w-6 bg-ink/10" />
          <span className="rounded-full border border-ink/10 bg-card px-3 py-1.5 text-ink-soft">2 Payment</span>
          <span className="h-px w-6 bg-ink/10" />
          <span className="hidden rounded-full border border-ink/10 bg-card px-3 py-1.5 text-ink-soft sm:inline-flex">3 Confirmation</span>
        </div>
        <span className="section-kicker">Secure checkout</span>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-ink">Complete your order.</h1>
        <p className="mt-2 text-sm text-ink-soft">Review delivery and payment details before placing your order.</p>
      </div>

      {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="premium-surface rounded-3xl p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Delivery address</h2>
                <p className="mt-1 text-xs text-ink-soft">Choose where you want your order delivered.</p>
              </div>
              <Link href="/account" className="text-xs font-bold text-poppy">Manage addresses</Link>
            </div>

            {user.addresses?.length ? (
              <div className="mt-6 space-y-3">
                {user.addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${selectedAddress === address.id ? "border-poppy bg-poppy/5" : "border-ink/10 bg-card hover:border-slate-300"}`}
                  >
                    <input type="radio" name="address" value={address.id} checked={selectedAddress === address.id} onChange={() => setSelectedAddress(address.id)} className="mt-1 accent-poppy" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-ink">
                        <MapPin className="h-4 w-4 text-poppy" />
                        {address.label}
                        {address.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] uppercase tracking-wider text-emerald-700">Default</span>}
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-ink-soft">
                        {address.fullName}<br />
                        {address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />
                        {address.city}, {address.state} {address.postalCode}<br />
                        {address.phone}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-7 text-center">
                <MapPin className="mx-auto h-7 w-7 text-poppy" />
                <p className="mt-3 text-sm font-bold text-ink">Add a delivery address first</p>
                <Link href="/account" className="mt-4 inline-flex text-xs font-bold text-poppy">Open account →</Link>
              </div>
            )}
          </div>

          <div className="premium-surface rounded-3xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-ink">Payment method</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("RAZORPAY")}
                className={`rounded-2xl border p-4 text-left transition ${paymentMethod === "RAZORPAY" ? "border-poppy bg-poppy/5" : "border-ink/10 bg-card hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-poppy" />
                  <div>
                    <p className="text-sm font-bold text-ink">Pay online</p>
                    <p className="mt-1 text-xs text-ink-soft">Cards, UPI, net banking & wallets via Razorpay</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("COD")}
                className={`rounded-2xl border p-4 text-left transition ${paymentMethod === "COD" ? "border-poppy bg-poppy/5" : "border-ink/10 bg-card hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-sage" />
                  <div>
                    <p className="text-sm font-bold text-ink">Cash on delivery</p>
                    <p className="mt-1 text-xs text-ink-soft">Pay when your order arrives</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>

        <aside className="premium-surface h-max rounded-3xl p-6 sm:p-7 lg:sticky lg:top-28">
          <h2 className="text-lg font-bold text-ink">Order summary</h2>
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-sm">
                <span className="min-w-0 text-slate-600">{item.title} <span className="text-ink-soft/70">× {item.quantity}</span></span>
                <span className="shrink-0 font-semibold text-ink">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="my-6 border-t border-ink/10" />

          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-ink-soft"><span>Delivery</span><span>{shipping === 0 ? "Free" : formatCurrency(shipping)}</span></div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-ink/10 pt-5">
            <span className="text-sm font-bold text-ink">Total</span>
            <span className="text-xl font-extrabold text-ink">{formatCurrency(total)}</span>
          </div>

          <button onClick={placeOrder} disabled={loading || !items.length || !selectedAddress} className="premium-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Preparing payment…" : paymentMethod === "RAZORPAY" ? "Pay securely" : "Place order"}
          </button>

          <div className="mt-5 flex gap-2 text-[11px] leading-5 text-ink-soft/70">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Payments are verified server-side before an order is marked paid.
          </div>
        </aside>
      </div>
    </div>
  );
}
