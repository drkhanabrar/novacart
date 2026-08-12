"use client";

import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

interface AddToCartProps {
  productId: string;
  variantId: string;
  title: string;
  price: number;
  imageUrl: string;
}

export function AddToCart({ productId, variantId, title, price, imageUrl }: AddToCartProps) {
  const addItem = useCartStore((state) => state.addItem);

  return (
    <button
      onClick={() =>
        addItem({
          productId,
          variantId,
          title,
          price,
          imageUrl,
          quantity: 1,
          attributes: {},
        })
      }
      className="w-full mt-8 bg-white text-black font-semibold text-sm px-6 py-4 rounded-full hover:bg-neutral-200 transition-colors flex items-center justify-center gap-3"
    >
      <ShoppingBag className="w-5 h-5" />
      {"Add to Cart"} — {formatCurrency(price)}
    </button>
  );
}