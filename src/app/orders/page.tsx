'use client';

import { useEffect, useState } from "react";
import { getUserOrders } from "@/actions/orders";
import { formatCurrency } from "@/lib/utils";
import { Package, CheckCircle2 } from "lucide-react";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("novacart_user_id");
    if (userId) {
      getUserOrders(userId).then((res) => {
        if (res.orders) setOrders(res.orders);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order History</h1>
          <p className="text-sm text-neutral-400">Track and review your past purchases on NOVA</p>
        </div>
      </div>

      {loading ? (
        <div className="text-neutral-500 py-16 text-center text-sm">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-12 text-center text-neutral-400 backdrop-blur-md">
          No orders found. Complete a checkout from the catalog to see your transaction history here!
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 backdrop-blur-md shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Order ID</span>
                  <p className="text-xs font-mono text-white mt-0.5">{order.id}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Date</span>
                  <p className="text-xs text-neutral-300 mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Total Amount</span>
                  <p className="text-xs font-bold text-emerald-400 mt-0.5">{formatCurrency(order.total)}</p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {order.status}
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Items Purchased</span>
                <div className="divide-y divide-neutral-800/60">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-sm text-neutral-300 first:pt-0 last:pb-0">
                      <span className="font-medium text-white">{item.product?.title || "Product item"} × {item.quantity}</span>
                      <span className="text-emerald-400 font-mono">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}