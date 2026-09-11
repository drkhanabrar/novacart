"use server";

// FILE: src/actions/admin-commerce.ts
//
// Every write the commerce side of the admin panel performs.
//
// Two rules hold throughout:
//
// 1. Each action re-checks the ADMIN role server-side. A server action is a
//    public HTTP endpoint; hiding a button in the UI is not access control.
//
// 2. Money and stock are never trusted from the form as-is. Every numeric field
//    is parsed and bounds-checked here, because a stray keystroke in a price
//    field is a real financial event.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordRefundEvents } from "@/lib/services/purchase-telemetry";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function guard(): Promise<
  { ok: true; adminId: string } | { ok: false; message: string }
> {
  try {
    const admin = await requireAdmin();
    return { ok: true, adminId: admin.id };
  } catch {
    return { ok: false, message: "You are not signed in as an administrator." };
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function num(
  value: FormDataEntryValue | null,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

/*
 * Updating an order status.
 *
 * REFUNDED is not just a label. It writes REFUND telemetry for every line,
 * which is what lets NOVA see a product's real return rate rather than assuming
 * one from its category. Without this the refund signal in the scoring model is
 * permanently empty.
 */
export async function updateOrderStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const orderId = str(formData.get("orderId"));
  const status = str(formData.get("status")) as OrderStatus | undefined;

  if (!orderId || !isOrderStatus(status)) {
    return { ok: false, message: "That status is not recognised." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { productId: true, quantity: true, price: true } },
    },
  });

  if (!order) return { ok: false, message: "Order not found." };

  if (order.status === status) {
    return { ok: false, message: `Order is already ${status.toLowerCase()}.` };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      // paidAt is stamped once, the first time an order actually becomes paid.
      ...(status === "PAID" && !order.paidAt ? { paidAt: new Date() } : {}),
    },
  });

  if (status === "REFUNDED" && order.status !== "REFUNDED") {
    await recordRefundEvents(order.items, order.id);
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");

  return {
    ok: true,
    message: `Order marked ${status.toLowerCase()}.`,
  };
}

export async function updateFulfillmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const orderItemId = str(formData.get("orderItemId"));
  if (!orderItemId) return { ok: false, message: "No order line specified." };

  const status = str(formData.get("fulfillmentStatus")) ?? "PENDING_REVIEW";
  const notes = str(formData.get("notes")) ?? null;

  await prisma.supplierFulfillment.upsert({
    where: { orderItemId },
    update: { status, notes },
    create: { orderItemId, status, notes },
  });

  revalidatePath("/admin/orders");
  return { ok: true, message: "Fulfilment updated." };
}

/*
 * Editing a product.
 *
 * Price is stored on both Product.basePrice and the variant rows. They must
 * move together: the storefront reads the product price while the cart and
 * order lines read the variant price, so changing only one silently charges a
 * customer something different from what the listing showed.
 */
export async function updateProductAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const productId = str(formData.get("productId"));
  if (!productId) return { ok: false, message: "No product specified." };

  const title = str(formData.get("title"));
  const description = str(formData.get("description")) ?? null;
  const basePrice = num(formData.get("basePrice"), { min: 1, max: 10_000_000 });
  const categoryId = str(formData.get("categoryId")) ?? null;
  const brandId = str(formData.get("brandId")) ?? null;
  const isActive = formData.get("isActive") === "on";

  if (!title) return { ok: false, message: "A product needs a title." };
  if (basePrice === undefined) {
    return { ok: false, message: "Enter a valid price." };
  }

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { basePrice: true },
  });

  if (!existing) return { ok: false, message: "Product not found." };

  const priceChanged = Number(existing.basePrice) !== basePrice;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { title, description, basePrice, categoryId, brandId, isActive },
    });

    if (priceChanged) {
      await tx.productVariant.updateMany({
        where: { productId },
        data: { price: basePrice },
      });
    }
  });

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${productId}`);
  revalidatePath("/products");
  revalidatePath("/");

  return {
    ok: true,
    message: priceChanged
      ? "Product saved. Variant prices were updated to match."
      : "Product saved.",
  };
}

/// Sets stock on a single variant.
export async function updateStockAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const variantId = str(formData.get("variantId"));
  const stock = num(formData.get("stock"), { min: 0, max: 1_000_000 });

  if (!variantId || stock === undefined) {
    return { ok: false, message: "Enter a valid stock number." };
  }

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: Math.floor(stock) },
    select: { productId: true, name: true },
  });

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${variant.productId}`);
  revalidatePath("/products");

  return {
    ok: true,
    message:
      stock === 0
        ? "Stock set to 0. This hides the product from the storefront."
        : `Stock set to ${Math.floor(stock)}.`,
  };
}

/*
 * Deactivating rather than deleting.
 *
 * A product referenced by past OrderItems cannot be deleted without destroying
 * order history, and a customer's receipt should never stop making sense. This
 * hides it from the storefront and keeps every record intact.
 */
export async function setProductActiveAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const productId = str(formData.get("productId"));
  const active = str(formData.get("active")) === "true";

  if (!productId) return { ok: false, message: "No product specified." };

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: active },
  });

  revalidatePath("/admin/catalog");
  revalidatePath("/products");
  revalidatePath("/");

  return {
    ok: true,
    message: active
      ? "Product is live on the storefront."
      : "Product hidden from the storefront.",
  };
}

/*
 * Permanent deletion.
 *
 * Refused when the product appears in any order. That is not a technical
 * limitation - it is a deliberate one, because deleting it would corrupt the
 * order history a customer and your accounts both depend on.
 */
export async function deleteProductAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const productId = str(formData.get("productId"));
  if (!productId) return { ok: false, message: "No product specified." };

  const orderLines = await prisma.orderItem.count({ where: { productId } });

  if (orderLines > 0) {
    return {
      ok: false,
      message: `This product appears in ${orderLines} order line${orderLines === 1 ? "" : "s"}, so deleting it would break that order history. Deactivate it instead — it disappears from the storefront and the records stay intact.`,
    };
  }

  await prisma.product.delete({ where: { id: productId } });

  revalidatePath("/admin/catalog");
  revalidatePath("/products");
  revalidatePath("/");

  return { ok: true, message: "Product deleted." };
}

/// Creates a product manually, outside the NOVA research pipeline.
export async function createProductAction(
  formData: FormData,
): Promise<ActionResult & { productId?: string }> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const title = str(formData.get("title"));
  const basePrice = num(formData.get("basePrice"), { min: 1, max: 10_000_000 });
  const stock = num(formData.get("stock"), { min: 0, max: 1_000_000 }) ?? 0;
  const description = str(formData.get("description")) ?? null;
  const categoryId = str(formData.get("categoryId")) ?? null;
  const brandId = str(formData.get("brandId")) ?? null;

  if (!title || basePrice === undefined) {
    return { ok: false, message: "A title and a valid price are required." };
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const clash = await prisma.product.findUnique({ where: { slug } });

  if (clash) {
    return {
      ok: false,
      message: "A product with a very similar name already exists.",
    };
  }

  const product = await prisma.product.create({
    data: {
      title,
      slug,
      description,
      basePrice,
      categoryId,
      brandId,
      isActive: true,
      variants: {
        create: {
          name: "Standard",
          sku: `MANUAL-${Date.now().toString(36).toUpperCase()}`,
          price: basePrice,
          stock: Math.floor(stock),
        },
      },
    },
  });

  revalidatePath("/admin/catalog");
  revalidatePath("/products");

  return { ok: true, message: `Created "${title}".`, productId: product.id };
}

/*
 * Customer role changes.
 *
 * An admin cannot remove their own admin rights, which would lock them out of
 * the panel with no way back in short of a database edit.
 */
export async function setCustomerRoleAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const userId = str(formData.get("userId"));
  const role = str(formData.get("role"));

  if (!userId || (role !== "ADMIN" && role !== "USER")) {
    return { ok: false, message: "That role is not recognised." };
  }

  if (userId === auth.adminId && role === "USER") {
    return {
      ok: false,
      message:
        "You cannot remove your own administrator access — you would be locked out of this panel.",
    };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { email: true },
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${userId}`);

  return {
    ok: true,
    message:
      role === "ADMIN"
        ? `${user.email} is now an administrator.`
        : `${user.email} is now a normal customer.`,
  };
}

/*
 * Signing a customer out of every device.
 *
 * The useful lever for a compromised or shared account. There is deliberately
 * no way to read or set a password from here: an admin should never be able to
 * take over a customer's account, only to end its sessions.
 */
export async function revokeCustomerSessionsAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const userId = str(formData.get("userId"));
  if (!userId) return { ok: false, message: "No customer specified." };

  const result = await prisma.session.deleteMany({ where: { userId } });

  revalidatePath(`/admin/customers/${userId}`);

  return {
    ok: true,
    message: `Signed out of ${result.count} session${result.count === 1 ? "" : "s"}.`,
  };
}

export async function upsertCategoryAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const name = str(formData.get("name"));
  if (!name) return { ok: false, message: "A category needs a name." };

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  await prisma.category.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });

  revalidatePath("/admin/catalog");
  return { ok: true, message: `Category "${name}" saved.` };
}

/*
 * Editing an order.
 *
 * Only the delivery details are editable — never the items, quantities or
 * prices. A real store does not retroactively rewrite what a customer bought
 * and what they were charged: that is their receipt, your accounts and, if it
 * ever comes to it, your evidence. Amazon and Flipkart work the same way. Use
 * CANCELLED or REFUNDED to unwind an order instead.
 *
 * Correcting a wrong address before dispatch, on the other hand, is routine.
 */
export async function updateOrderDeliveryAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const orderId = str(formData.get("orderId"));
  if (!orderId) return { ok: false, message: "No order specified." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, shippingAddress: true },
  });

  if (!order) return { ok: false, message: "Order not found." };

  if (["SHIPPED", "DELIVERED"].includes(order.status)) {
    return {
      ok: false,
      message:
        "This order has already shipped, so the delivery address can no longer be changed here. Contact the courier instead.",
    };
  }

  const existing = (order.shippingAddress ?? {}) as Record<string, unknown>;

  const address = {
    ...existing,
    fullName: str(formData.get("fullName")) ?? existing.fullName ?? "",
    phone: str(formData.get("addressPhone")) ?? existing.phone ?? "",
    line1: str(formData.get("line1")) ?? existing.line1 ?? "",
    line2: str(formData.get("line2")) ?? null,
    city: str(formData.get("city")) ?? existing.city ?? "",
    state: str(formData.get("state")) ?? existing.state ?? "",
    postalCode: str(formData.get("postalCode")) ?? existing.postalCode ?? "",
    country: str(formData.get("country")) ?? existing.country ?? "India",
  };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippingAddress: address as never,
      contactPhone: str(formData.get("contactPhone")) ?? null,
    },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: "Delivery details updated." };
}

/*
 * Deleting an order.
 *
 * Intended for clearing test data, not for managing real trade. Deleting a
 * genuine order destroys the customer's purchase record and your sales history,
 * and no amount of convenience is worth that — cancel or refund it instead.
 *
 * Two things are cleaned up that are easy to forget:
 *
 * 1. Items and supplier fulfilment rows go automatically through the schema's
 *    cascade rules.
 *
 * 2. PURCHASE and REFUND telemetry is deleted explicitly. ProductEvent has no
 *    foreign key to Order, so these would otherwise survive the deletion and
 *    keep counting toward that product's conversion rate — teaching NOVA that a
 *    test order was a real sale. Daily metrics are recomputed from source on the
 *    next rollup, so removing the raw events is enough to correct them.
 */
export async function deleteOrderAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const orderId = str(formData.get("orderId"));
  if (!orderId) return { ok: false, message: "No order specified." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, total: true, status: true },
  });

  if (!order) return { ok: false, message: "Order not found." };

  const telemetry = await prisma.productEvent.deleteMany({
    where: {
      type: { in: ["PURCHASE", "REFUND"] },
      meta: { path: ["orderId"], equals: orderId },
    },
  });

  await prisma.order.delete({ where: { id: orderId } });

  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      telemetry.count > 0
        ? `Order deleted, along with ${telemetry.count} linked sales event${telemetry.count === 1 ? "" : "s"}. Run the rollup to refresh daily metrics.`
        : "Order deleted. No linked sales events were found — orders placed before this feature existed were not tagged, so any telemetry from them stays until the retention window clears it.",
  };
}
