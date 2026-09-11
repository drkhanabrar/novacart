// FILE: src/components/CancelPendingOrderButton.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { deletePendingRazorpayOrder } from "@/actions/checkout";

export default function CancelPendingOrderButton({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    const confirmed = window.confirm(
      "Remove this pending payment order? This cannot be undone."
    );

    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      const result = await deletePendingRazorpayOrder(orderId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push("/orders");
      router.refresh();
    } catch (err) {
      console.error("Failed to remove pending order:", err);
      setError("We could not remove this order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <XCircle className="h-4 w-4" />
        {loading ? "Removing…" : "Remove pending order"}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}