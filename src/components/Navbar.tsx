'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, Hexagon, Package, LogOut } from "lucide-react";
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
          
          {/* Store Logo */}
          <Link href="/products" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Hexagon className="w-6 h-6 text-indigo-500 fill-indigo-500/20" />
            <span className="text-lg font-bold text-white tracking-widest">NOVA</span>
          </Link>

          {/* Navigation Links & Cart */}
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
            
            {/* Dynamic Cart Button */}
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
              <Link 
                href="/login" 
                className="text-sm font-medium px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

        </div>
      </header>
      
      {/* Slide-out Cart Panel */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}