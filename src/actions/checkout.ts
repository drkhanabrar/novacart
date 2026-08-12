'use server';

import { prisma } from "@/lib/prisma";

export async function createOrder(userId: string, items: { id: string; price: number; quantity: number }[]) {
  if (!userId) {
    return { error: "Please sign in to complete your checkout." };
  }

  if (!items || items.length === 0) {
    return { error: "Your cart is empty." };
  }

  try {
    const total = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

    const order = await prisma.order.create({
      data: {
        userId,
        total,
        status: "PAID",
        items: {
          create: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity || 1,
            price: item.price,
          })),
        },
      },
    });

    return { success: true, orderId: order.id };
  } catch (error: any) {
    console.error("Checkout persistence error:", error);
    return { error: "Failed to process order. Please try again." };
  }
}