'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, Package, LogOut } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { CartDrawer } from "@/components/CartDrawer";

export function Navbar() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const items = useCartStore((state) => state.items) || [];
  const itemCount = items.reduce((total, item) => total + (item.quantity || 1), 0);

  useEffect(() => {
    const userId = localStorage.getItem("novacart_user_id");
    if (userId) setIsLoggedIn(true);
  }, []);

  function handleLogout() {
    localStorage.removeItem("novacart_user_id");
    localStorage.removeItem("novacart_user_name");
    setIsLoggedIn(false);
    window.location.href = "/login";
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="bg-white px-2.5 py-1 rounded-xl shadow-sm flex items-center justify-center">
              <img src="/logo.png" alt="Nova Cart" className="h-6 w-auto object-contain" />
            </div>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/products" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
              Catalog
            </Link>

            {isLoggedIn && (
              <Link href="/orders" className="flex items-center gap-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                <Package className="w-4 h-4 text-indigo-400" />
                Orders
              </Link>
            )}
            
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                {itemCount}
              </span>
            </button>

            {isLoggedIn ? (
              <button 
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <Link 
                  href="/login" 
                  className="text-sm font-medium px-4 py-2 text-neutral-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link 
                  href="/register" 
                  className="text-sm font-medium px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

        </div>
      </header>
      
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}