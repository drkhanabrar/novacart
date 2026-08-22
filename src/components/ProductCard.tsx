"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/lib/store";

export interface ProductCardData {
  id: string;
  slug: string;
  title: string;
  price: number;
  imageUrl?: string;
  categoryName?: string;
  aiScore?: number | null;
  stock?: number | null;
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const [added, setAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const stock = typeof product.stock === "number" ? product.stock : null;
  const lowStock = stock !== null && stock > 0 && stock <= 5;

  function quickAdd() {
    addItem({
      id: product.id,
      title: product.title,
      price: product.price,
      imageUrl: product.imageUrl,
      quantity: 1,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1300);
  }

  return (
    <article className="group">
      <div className="relative">
        <Link href={`/products/${product.slug}`} className="block" aria-label={`View ${product.title}`}>
          <div className="relative aspect-[0.94] overflow-hidden rounded-[1.7rem] border border-ink/10 bg-cream">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
            ) : (
              <div className="grid h-full place-items-center bg-cream-soft px-6 text-center"><span className="font-tag text-[10px] uppercase tracking-[0.18em] text-ink-soft">Image coming soon</span></div>
            )}

            {lowStock && <span className="absolute left-4 top-4 rounded-full bg-card/92 px-3 py-1.5 font-tag text-[9px] font-bold uppercase tracking-[0.16em] text-poppy shadow-sm backdrop-blur">Only {stock} left</span>}
            <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-card/92 text-ink-soft shadow-sm backdrop-blur transition-all duration-300 group-hover:bg-poppy group-hover:text-white"><ArrowUpRight className="h-4 w-4" /></span>
          </div>
        </Link>

        <button
          type="button"
          onClick={quickAdd}
          className={`absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full shadow-lg transition-all duration-300 ${added ? "bg-sage text-white" : "bg-white/95 text-ink hover:bg-poppy hover:text-white"} sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0`}
          aria-label={added ? `Added ${product.title}` : `Add ${product.title} to bag`}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      <Link href={`/products/${product.slug}`} className="block px-1 pt-4">
        {product.categoryName && <span className="font-tag text-[9px] uppercase tracking-[0.18em] text-ink-soft">{product.categoryName}</span>}
        <h2 className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{product.title}</h2>
        <div className="mt-2 flex items-center justify-between gap-3"><p className="font-tag text-sm font-bold text-poppy">{formatCurrency(product.price)}</p><span className="text-[11px] text-ink-soft">Available now</span></div>
      </Link>
    </article>
  );
}
