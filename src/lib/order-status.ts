// FILE: src/lib/order-status.ts
//
// Order status vocabulary.
//
// This lives outside src/actions/admin-commerce.ts because a "use server" file
// may only export async functions — exporting a const array from one is a build
// error, not a style preference. Any shared constant used by both a server
// action and a page belongs in a plain module like this.

/*
 * A closed set, so a typo cannot invent a status the storefront and fulfilment
 * code have never heard of.
 */
export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}
