// FILE: src/lib/services/purchase-telemetry.ts
//
// Purchase and refund events are the ground truth the entire learning loop is
// graded against, so they are written here and nowhere else. The public
// tracking endpoint rejects both types by design.
//
// Every function swallows its errors. A telemetry failure must never turn a
// completed payment into a visible error for a paying customer.

import { recordServerEvent } from "./telemetry";

interface PurchasedLine {
  productId: string;
  quantity: number;
  price: unknown;
}

export async function recordPurchaseEvents(
  items: PurchasedLine[],
): Promise<void> {
  try {
    await Promise.all(
      items.map((item) =>
        recordServerEvent(item.productId, "PURCHASE", {
          quantity: item.quantity,
          valueInr: Number(item.price) * item.quantity,
        }),
      ),
    );
  } catch (error) {
    console.error("[telemetry] Failed to record purchase events:", error);
  }
}

export async function recordRefundEvents(
  items: PurchasedLine[],
): Promise<void> {
  try {
    await Promise.all(
      items.map((item) =>
        recordServerEvent(item.productId, "REFUND", {
          quantity: item.quantity,
          valueInr: Number(item.price) * item.quantity,
        }),
      ),
    );
  } catch (error) {
    console.error("[telemetry] Failed to record refund events:", error);
  }
}
