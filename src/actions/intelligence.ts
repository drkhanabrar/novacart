'use server';

import { prisma } from "@/lib/prisma";

export async function getProductIntelligence(productId: string) {
  try {
    const intelligence = await prisma.productIntelligence.findUnique({
      where: { productId },
    });
    return { intelligence };
  } catch (error) {
    console.error("Error fetching AI intelligence:", error);
    return { error: "Failed to fetch AI insights." };
  }
}