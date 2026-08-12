import Link from "next/link";
import { ShoppingCart, Hexagon } from "lucide-react";

export function Navbar() {
  return (
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
          
          {/* Static Cart Button */}
          <button className="relative p-2 text-neutral-400 hover:text-white transition-colors">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
              0
            </span>
          </button>
        </div>

      </div>
    </header>
  );
}