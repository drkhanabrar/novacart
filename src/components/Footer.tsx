import Link from "next/link";
import { ShieldCheck, Truck, RotateCcw } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink/10 bg-card/75">
      <div className="border-b border-ink/10">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 py-7 sm:grid-cols-3 sm:px-6">
          <div className="trust-footer-item"><Truck className="h-4 w-4 text-sage" /><span>Free delivery over ₹999</span></div>
          <div className="trust-footer-item"><RotateCcw className="h-4 w-4 text-marigold" /><span>7-day returns</span></div>
          <div className="trust-footer-item"><ShieldCheck className="h-4 w-4 text-poppy" /><span>Secure checkout</span></div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-ink/10 bg-card p-2 shadow-sm"><img src="/novacart-mark.png" alt="" className="h-7 w-7 object-contain" /></span>
            <span className="font-display text-2xl font-semibold tracking-[-0.04em] text-ink">Nova<span className="text-poppy">Cart</span></span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-ink-soft">Thoughtfully chosen products, a calmer shopping experience, and a collection that keeps evolving.</p>
        </div>

        <div>
          <h3 className="footer-heading">Shop</h3>
          <ul className="footer-list">
            <li><Link href="/products">All products</Link></li>
            <li><Link href="/products?sort=newest">New arrivals</Link></li>
            <li><Link href="/products?sort=best">Best picks</Link></li>
            <li><Link href="/cart">Your bag</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="footer-heading">Account</h3>
          <ul className="footer-list">
            <li><Link href="/account">My account</Link></li>
            <li><Link href="/orders">My orders</Link></li>
            <li><Link href="/login">Sign in</Link></li>
            <li><Link href="/register">Create account</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="footer-heading">Help</h3>
          <ul className="footer-list">
            <li><Link href="/shipping">Shipping</Link></li>
            <li><Link href="/returns">Returns</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/about">About NovaCart</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-5 text-[11px] text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>© {new Date().getFullYear()} NovaCart. All rights reserved.</div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/returns" className="hover:text-ink">Returns</Link>
            <Link href="/contact" className="hover:text-ink">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
