"use server";

import crypto from "node:crypto";
import Razorpay from "razorpay";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function getRazorpay() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay environment variables are not configured.");
  }

  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
}

function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  if (!RAZORPAY_KEY_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(razorpaySignature, "utf8");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

async function buildOrderData(
  items: { id: string; quantity: number }[],
  addressId: string,
  userId: string,
) {
  if (!items.length) throw new Error("Your bag is empty.");
  if (!addressId) throw new Error("Please select a delivery address.");

  const address = await prisma.userAddress.findFirst({
    where: { id: addressId, userId },
  });

  if (!address) {
    throw new Error("The selected delivery address is no longer available.");
  }

  const ids = [...new Set(items.map((item) => item.id))];

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { id: { in: ids } },
        { variants: { some: { id: { in: ids } } } },
      ],
      variants: {
        some: {
          stock: {
            gt: 0,
          },
        },
      },
    },
    include: {
      variants: {
        orderBy: {
          price: "asc",
        },
      },
    },
  });

  const resolveProduct = (itemId: string) =>
    products.find((candidate) => candidate.id === itemId) ??
    products.find((candidate) =>
      candidate.variants.some((variant) => variant.id === itemId)
    );

  if (products.length === 0) {
    throw new Error("One or more products are no longer available.");
  }

  const lineItems = items.map((item) => {
    const product = resolveProduct(item.id);

    if (!product) {
      throw new Error("A product in your bag is unavailable.");
    }

    const preferredVariant = product.variants.find(
      (candidate) => candidate.id === item.id,
    );

    const variant =
      preferredVariant ??
      product.variants.find((candidate) => candidate.stock > 0);

    if (!variant || variant.stock <= 0) {
      throw new Error(`${product.title} is currently out of stock.`);
    }

    const quantity = Math.max(
      1,
      Math.min(20, Math.floor(item.quantity || 1)),
    );

    if (quantity > variant.stock) {
      throw new Error(
        `${product.title} only has ${variant.stock} available.`,
      );
    }

    return {
      productId: product.id,
      quantity,
      price: Number(variant.price),
    };
  });

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const shipping = subtotal >= 999 ? 0 : 79;
  const total = subtotal + shipping;

  const shippingAddress = {
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    shippingFee: shipping,
  };

  return {
    address,
    lineItems,
    subtotal,
    shipping,
    total,
    shippingAddress,
  };
}

/**
 * Stage 6: stages a supplier fulfillment checklist entry for one order item.
 */
async function stageFulfillment(
  tx: Prisma.TransactionClient,
  orderItem: { id: string; productId: string },
) {
  const intelligence = await tx.productIntelligence.findUnique({
    where: {
      productId: orderItem.productId,
    },
  });

  const hasSupplierMatch = Boolean(intelligence?.supplierProductId);

  await tx.supplierFulfillment.create({
    data: {
      orderItemId: orderItem.id,
      supplierName: intelligence?.supplierName ?? null,
      supplierProductId: intelligence?.supplierProductId ?? null,
      supplierUrl: intelligence?.supplierUrl ?? null,
      supplierCostUsd: intelligence?.supplierCostUsd ?? null,
      status: hasSupplierMatch
        ? "PENDING_REVIEW"
        : "NEEDS_MANUAL_SOURCING",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Razorpay result types                                                       */
/* -------------------------------------------------------------------------- */

type CreateRazorpayOrderSuccess = {
  success: true;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
};

type CreateRazorpayOrderFailure = {
  success: false;
  error: string;
};

type CreateRazorpayOrderResult =
  | CreateRazorpayOrderSuccess
  | CreateRazorpayOrderFailure;

/* -------------------------------------------------------------------------- */
/* Create Razorpay order                                                       */
/* -------------------------------------------------------------------------- */

export async function createRazorpayOrder(
  items: { id: string; quantity: number }[],
  addressId: string,
): Promise<CreateRazorpayOrderResult> {
  const user = await requireUser();

  try {
    const orderData = await buildOrderData(items, addressId, user.id);
    const localOrderId = crypto.randomUUID();

    const localOrder = await prisma.order.create({
      data: {
        id: localOrderId,
        userId: user.id,
        total: orderData.total,
        status: "PENDING",
        paymentMethod: "RAZORPAY",
        contactPhone: orderData.address.phone,
        shippingAddress: orderData.shippingAddress,
        items: {
          create: orderData.lineItems,
        },
      },
    });

    try {
      const razorpay = getRazorpay();

      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(orderData.total * 100),
        currency: "INR",
        receipt: localOrder.id,
        notes: {
          novacart_order_id: localOrder.id,
          user_id: user.id,
        },
      });

      const razorpayOrderId = String(razorpayOrder.id);
      const razorpayAmount = Number(razorpayOrder.amount);
      const razorpayCurrency = String(razorpayOrder.currency);

      /*
       * getRazorpay() has already guaranteed that these environment
       * variables exist, so the success result can safely expose
       * them as required strings.
       */
      const keyId = RAZORPAY_KEY_ID;

      if (!keyId) {
        throw new Error("Razorpay key ID is not configured.");
      }

      await prisma.order.update({
        where: {
          id: localOrder.id,
        },
        data: {
          razorpayOrderId,
        },
      });

      return {
        success: true,
        orderId: String(localOrder.id),
        razorpayOrderId,
        amount: razorpayAmount,
        currency: razorpayCurrency,
        keyId,
      };
    } catch (error) {
      await prisma.order
        .delete({
          where: {
            id: localOrder.id,
          },
        })
        .catch(() => undefined);

      console.error("Razorpay order creation failed:", error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "We could not start the online payment. Please try again.",
      };
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "We could not prepare your order.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Verify Razorpay payment                                                     */
/* -------------------------------------------------------------------------- */

export async function verifyRazorpayPayment(
  localOrderId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const user = await requireUser();

  if (
    !verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    )
  ) {
    return {
      error: "Payment verification failed. Your order was not confirmed.",
    };
  }

  try {
    const razorpay = getRazorpay();
    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    if (payment.order_id !== razorpayOrderId) {
      return {
        error: "Payment order verification failed.",
      };
    }

    if (payment.status !== "captured") {
      return {
        error:
          "Payment has not been captured yet. Please wait for confirmation.",
      };
    }

    const paid = await markOrderPaid({
      localOrderId,
      userId: user.id,
      razorpayOrderId,
      razorpayPaymentId,
    });

    if (paid.error) {
      return paid;
    }

    revalidatePath("/orders");

    return {
      success: true,
      orderId: localOrderId,
    };
  } catch (error) {
    console.error("Razorpay payment verification failed:", error);

    return {
      error:
        "Payment was received but could not be confirmed yet. Please check My Orders.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* COD order                                                                   */
/* -------------------------------------------------------------------------- */

export async function createOrder(
  items: { id: string; quantity: number }[],
  addressId: string,
) {
  const user = await requireUser();

  try {
    const {
      address,
      lineItems,
      total,
      shipping,
    } = await buildOrderData(items, addressId, user.id);

    const order = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        for (const item of lineItems) {
          const product = await tx.product.findUnique({
            where: {
              id: item.productId,
            },
            include: {
              variants: {
                orderBy: {
                  price: "asc",
                },
                take: 1,
              },
            },
          });

          const variant = product?.variants[0];

          if (!variant) {
            throw new Error(`OUT_OF_STOCK:${item.productId}`);
          }

          const updated = await tx.productVariant.updateMany({
            where: {
              id: variant.id,
              stock: {
                gte: item.quantity,
              },
            },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          if (updated.count !== 1) {
            throw new Error(`OUT_OF_STOCK:${item.productId}`);
          }
        }

        const createdOrder = await tx.order.create({
          data: {
            userId: user.id,
            total,
            status: "PENDING",
            paymentMethod: "COD",
            contactPhone: address.phone,
            shippingAddress: {
              ...address,
              shippingFee: shipping,
            },
            items: {
              create: lineItems,
            },
          },
          include: {
            items: true,
          },
        });

        for (const item of createdOrder.items) {
          await stageFulfillment(tx, item);
        }

        return createdOrder;
      },
    );

    revalidatePath("/orders");

    return {
      success: true,
      orderId: order.id,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("OUT_OF_STOCK:")
    ) {
      return {
        error:
          "One of the products in your bag is no longer available in the requested quantity.",
      };
    }

    console.error("COD order creation failed:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "We could not place your order. Please try again.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Mark order paid                                                             */
/* -------------------------------------------------------------------------- */

export async function markOrderPaid(input: {
  localOrderId: string;
  userId?: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
}) {
  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.findFirst({
          where: {
            id: input.localOrderId,
            razorpayOrderId: input.razorpayOrderId,
            ...(input.userId
              ? {
                  userId: input.userId,
                }
              : {}),
          },
          include: {
            items: true,
          },
        });

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        /*
         * Idempotency guard:
         * if the client callback and Razorpay webhook both arrive,
         * only the first successful path performs the stock decrement
         * and fulfillment staging.
         */
        if (order.status === "PAID") {
          return order;
        }

        for (const item of order.items) {
          const product = await tx.product.findUnique({
            where: {
              id: item.productId,
            },
            include: {
              variants: {
                orderBy: {
                  price: "asc",
                },
                take: 1,
              },
            },
          });

          const variant = product?.variants[0];

          if (!variant) {
            throw new Error(`OUT_OF_STOCK:${item.productId}`);
          }

          const updated = await tx.productVariant.updateMany({
            where: {
              id: variant.id,
              stock: {
                gte: item.quantity,
              },
            },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          if (updated.count !== 1) {
            throw new Error(`OUT_OF_STOCK:${item.productId}`);
          }
        }

        const updatedOrder = await tx.order.update({
          where: {
            id: order.id,
          },
          data: {
            status: "PAID",
            paymentMethod: "RAZORPAY",
            razorpayPaymentId: input.razorpayPaymentId,
            paidAt: new Date(),
          },
        });

        for (const item of order.items) {
          await stageFulfillment(tx, item);
        }

        return updatedOrder;
      },
    );

    return {
      success: true,
      order: result,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("OUT_OF_STOCK:")
    ) {
      return {
        error:
          "Payment was received, but stock became unavailable. Contact NovaCart support before fulfilment.",
      };
    }

    if (
      error instanceof Error &&
      error.message === "ORDER_NOT_FOUND"
    ) {
      return {
        error: "Order could not be found.",
      };
    }

    console.error("markOrderPaid failed:", error);

    return {
      error: "We could not confirm the order.",
    };
  }
}