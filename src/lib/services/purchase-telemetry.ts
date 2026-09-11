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

/*
 * orderId is stamped into the event metadata.
 *
 * ProductEvent has no foreign key to Order, so without this there is no way to
 * find the telemetry belonging to a particular order. That matters when an
 * order is deleted: the purchase events would survive it and keep inflating
 * that product's conversion rate forever, which then feeds NOVA's scoring as
 * though the sale had really happened.
 */
export async function recordPurchaseEvents(
  items: PurchasedLine[],
  orderId?: string,
): Promise<void> {
  try {
    await Promise.all(
      items.map((item) =>
        recordServerEvent(item.productId, "PURCHASE", {
          quantity: item.quantity,
          valueInr: Number(item.price) * item.quantity,
          meta: orderId ? { orderId } : undefined,
        }),
      ),
    );
  } catch (error) {
    console.error("[telemetry] Failed to record purchase events:", error);
  }
}

export async function recordRefundEvents(
  items: PurchasedLine[],
  orderId?: string,
): Promise<void> {
  try {
    await Promise.all(
      items.map((item) =>
        recordServerEvent(item.productId, "REFUND", {
          quantity: item.quantity,
          valueInr: Number(item.price) * item.quantity,
          meta: orderId ? { orderId } : undefined,
        }),
      ),
    );
  } catch (error) {
    console.error("[telemetry] Failed to record refund events:", error);
  }
}
