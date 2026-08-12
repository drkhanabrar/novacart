"use client";

import { useCartStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function CartPage() {
  const { items, removeItem, updateQuantity, getSubtotal, clearCart } = useCartStore();
  const subtotal = getSubtotal();
  const shipping = subtotal > 0 ? 15.0 : 0.0;
  const total = subtotal + shipping;

  if (items.length === 0) {
    return (
      
        Your Cart is Empty
        Looks like you haven't added anything to your cart yet.
        
          Explore Catalog
        
      
    );
  }

  return (
    
      Shopping Cart

      
        
          {items.map((item) => (
            
              
              
                {item.title}
                
                  {formatCurrency(item.price)}
                
              

              
                 updateQuantity(item.variantId, parseInt(e.target.value) || 1)}
                  className="w-12 bg-neutral-900 border border-neutral-800 text-center text-xs text-white rounded-md py-1"
                />
                 removeItem(item.variantId)}
                  className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                >
                  
                
              
            
          ))}
        

        
          
            Order Summary
          

          
            Subtotal
            {formatCurrency(subtotal)}
          

          
            Estimated Shipping
            {formatCurrency(shipping)}
          

          
            Total
            {formatCurrency(total)}
          

           {
              alert("Order placed successfully!");
              clearCart();
            }}
            className="w-full mt-4 bg-white text-black font-semibold text-xs py-3 rounded-full hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
          >
            Checkout
            
          
        
      
    
  );
}