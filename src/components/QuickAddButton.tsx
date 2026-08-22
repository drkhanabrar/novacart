'use client';

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { useCartStore } from "@/lib/store";

interface QuickAddButtonProps {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
}

// Small icon-only "quick add to cart" button used on product cards, so
// shoppers can add an item straight from the catalog grid without opening
// the product page. Stops propagation so it doesn't trigger the card's Link.
export function QuickAddButton({ id, title, price, imageUrl }: QuickAddButtonProps) {
  const [justAdded, setJustAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem({ id, title, price, imageUrl, quantity: 1 });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      aria-label={`Add ${title} to cart`}
      className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
        justAdded
          ? "bg-sage text-white scale-105"
          : "bg-white/95 text-ink hover:bg-poppy hover:text-white opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0"
      }`}
    >
      {justAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
    </button>
  );
}
