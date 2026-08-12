'use client';

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/lib/store";

interface AddToCartProps {
  product: {
    id: string;
    title: string;
    basePrice: any;
    variants?: { id: string; price: any; imageUrl?: string | null }[];
  };
}

export function AddToCart({ product }: AddToCartProps) {
  const [selectedVariantIndex] = useState(0);
  const addItem = useCartStore((state) => state.addItem);

  const variant = product.variants && product.variants[selectedVariantIndex];
  const price = variant ? Number(variant.price) : Number(product.basePrice);
  const imageUrl = variant?.imageUrl || "";

  function handleAddToCart() {
    addItem({
      id: variant ? variant.id : product.id,
      title: product.title,
      price: price,
      imageUrl: imageUrl,
      quantity: 1,
    });
  }

  return (
    <button
      onClick={handleAddToCart}
      className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
    >
      <ShoppingCart className="w-5 h-5" />
      Add to Cart
    </button>
  );
}