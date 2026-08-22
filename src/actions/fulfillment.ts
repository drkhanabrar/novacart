'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getFulfillments() {
  return prisma.supplierFulfillment.findMany({
    include: {
      orderItem: {
        include: {
          product: true,
          order: { include: { user: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Marks a fulfillment as ORDERED. This is called only after a human has
 * actually gone and placed the real order with the supplier — this
 * function itself does not place any order or spend any money.
 */
export async function markFulfillmentOrdered(formData: FormData) {
  const fulfillmentId = formData.get("fulfillmentId");
  if (typeof fulfillmentId !== "string" || !fulfillmentId) return;

  await prisma.supplierFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: "ORDERED" },
  });

  revalidatePath("/fulfillment");
}