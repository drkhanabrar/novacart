// FILE: src/components/PayPendingOrderButton.tsx

"use client";

import { useState } from "react";
import {
  getPendingRazorpayOrder,
  verifyRazorpayPayment,
} from "@/actions/checkout";

let razorpayLoader: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser required."));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayLoader) {
    return razorpayLoader;
  }

  razorpayLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Razorpay Checkout.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");

    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Razorpay Checkout."));

    document.body.appendChild(script);
  });

  return razorpayLoader;
}

export default function PayPendingOrderButton({
  orderId,
  amount,
}: {
  orderId: string;
  amount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePayNow() {
    setError(null);
    setLoading(true);

    try {
      const result = await getPendingRazorpayOrder(orderId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      await loadRazorpay();

      if (!window.Razorpay) {
        setError(
          "Razorpay Checkout is unavailable right now. Please try again.",
        );
        return;
      }

      const razorpay = new window.Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: "NovaCart",
        description: "Complete your NovaCart payment",
        order_id: result.razorpayOrderId,

        prefill: {},

        notes: {
          novacart_order_id: result.orderId,
        },

        theme: {
          color: "#D94A4A",
        },

        handler: async (response) => {
          setLoading(true);
          setError(null);

          try {
            if (
              !response.razorpay_order_id ||
              !response.razorpay_payment_id ||
              !response.razorpay_signature
            ) {
              setError(
                "Razorpay did not return all required payment details. Please try again.",
              );
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
              return;
            }

            window.location.reload();
          } catch (verificationError) {
            console.error(
              "Pending order payment verification failed:",
              verificationError,
            );

            setError(
              "Payment was received but could not be confirmed yet. Please check My Orders.",
            );
          } finally {
            setLoading(false);
          }
        },

        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      });

      razorpay.open();
    } catch (paymentError) {
      console.error("Pending order payment failed:", paymentError);
      setError("We could not start the payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={handlePayNow}
        disabled={loading}
        className="premium-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Preparing payment…"
          : `Pay Now ${new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(amount)}`}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}