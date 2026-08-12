'use client';

import Link from "next/link";
import { ShoppingCart, Trash2, ArrowRight } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { items, removeItem, clearCart } = useCartStore();
  const total = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-neutral-500">
          <ShoppingCart className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Your Cart is Empty</h1>
        <p className="text-sm text-neutral-400 mb-8">Looks like you haven't added anything to your cart yet.</p>
        <Link 
          href="/products" 
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold transition-colors"
        >
          Explore Catalog
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-white tracking-tight mb-8">Shopping Cart</h1>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-4 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-neutral-950 rounded-xl overflow-hidden flex-shrink-0">
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                <p className="text-xs text-neutral-400 mt-1">Quantity: {item.quantity || 1}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-sm font-bold text-emerald-400">{formatCurrency(item.price * (item.quantity || 1))}</span>
              <button 
                onClick={() => removeItem(item.id)} 
                className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">Total Amount</span>
          <p className="text-2xl font-bold text-white mt-0.5">{formatCurrency(total)}</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={clearCart} 
            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm font-medium transition-colors"
          >
            Clear Cart
          </button>
          <Link 
            href="/products" 
            className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}