'use client';

import { useState } from "react";
import { X, Trash2, CheckCircle2 } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { createOrder } from "@/actions/checkout";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, clearCart } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const total = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    const userId = localStorage.getItem("novacart_user_id");
    if (!userId) {
      setError("Please sign in first to complete your checkout.");
      setLoading(false);
      return;
    }

    const res = await createOrder(userId, items);

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else {
      setOrderSuccess(res.orderId || "Success");
      clearCart();
      setLoading(false);
    }
  }

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={onClose}
        />
      )}
      
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-[#0a0a0a] border-l border-neutral-800 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
        <div className="flex items-center justify-between p-6 border-b border-neutral-800">
          <h2 className="text-xl font-bold text-white">Your Cart</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {orderSuccess ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <h3 className="text-lg font-bold text-white">Order Confirmed!</h3>
              <p className="text-sm text-neutral-400">Your order has been successfully saved to Supabase.</p>
              <p className="text-xs font-mono text-neutral-500 mt-2">ID: {orderSuccess}</p>
              <button 
                onClick={() => { setOrderSuccess(null); onClose(); }} 
                className="mt-4 px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500">
              Your cart is empty.
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex gap-4">
                <div className="w-20 h-20 bg-neutral-900 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-neutral-400 mt-1">Qty: {item.quantity}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-400">{formatCurrency(item.price)}</span>
                    <button onClick={() => removeItem(item.id)} className="text-neutral-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {!orderSuccess && items.length > 0 && (
          <div className="p-6 border-t border-neutral-800 bg-neutral-900/50">
            {error && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-neutral-400">Total</span>
              <span className="text-xl font-bold text-white">{formatCurrency(total)}</span>
            </div>
            <button 
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Checkout & Save Order"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}