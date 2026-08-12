'use server';

import { prisma } from "@/lib/prisma";

export async function getUserOrders(userId: string) {
  if (!userId) {
    return { error: "Unauthorized access." };
  }

  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { orders };
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return { error: "Failed to retrieve order history." };
  }
}