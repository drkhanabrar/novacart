'use client';

import { useState } from "react";
import { ShoppingCart, Minus, Plus, Check } from "lucide-react";
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
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const variant = product.variants && product.variants[selectedVariantIndex];
  const price = variant ? Number(variant.price) : Number(product.basePrice);
  const imageUrl = variant?.imageUrl || "";

  function handleAddToCart() {
    addItem({
      id: product.id,
      title: product.title,
      price: price,
      imageUrl: imageUrl,
      quantity,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center border border-ink/15 rounded-2xl bg-card overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          aria-label="Decrease quantity"
          className="w-11 h-14 flex items-center justify-center text-ink-soft hover:text-poppy hover:bg-cream transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-8 text-center font-tag text-sm font-bold text-ink">{quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.min(99, q + 1))}
          aria-label="Increase quantity"
          className="w-11 h-14 flex items-center justify-center text-ink-soft hover:text-poppy hover:bg-cream transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={handleAddToCart}
        className={`flex-1 h-14 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
          justAdded
            ? "bg-sage text-white shadow-sage/20"
            : "bg-poppy hover:bg-poppy-dark text-white shadow-poppy/20"
        }`}
      >
        {justAdded ? (
          <>
            <Check className="w-5 h-5" />
            Added to cart
          </>
        ) : (
          <>
            <ShoppingCart className="w-5 h-5" />
            Add to cart
          </>
        )}
      </button>
    </div>
  );
}
