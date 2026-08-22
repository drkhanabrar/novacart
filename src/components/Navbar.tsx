"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  MapPin,
  Menu,
  Package,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { logoutUser } from "@/actions/auth";
import { useCartStore } from "@/lib/store";
import { CartDrawer } from "@/components/CartDrawer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteSearch } from "@/components/SiteSearch";

interface NavbarUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
}

export function Navbar({ user }: { user: NavbarUser | null }) {
  const router = useRouter();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const items = useCartStore((s) => s.items) || [];
  const itemCount = items.reduce((n, i) => n + (i.quantity || 1), 0);
  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "Customer";
  const shortName =
    displayName.length > 17 ? `${displayName.slice(0, 17)}…` : displayName;

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
      setAccountOpen(false);
      setMobileOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-ink/10 bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-5 sm:px-6">
          <Link href="/" className="shrink-0" aria-label="NovaCart home">
            <div className="flex items-center gap-2.5 rounded-2xl px-1 py-1 transition-opacity hover:opacity-85">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-ink/10 bg-card p-2 shadow-sm">
                <img
                  src="/novacart-mark.png"
                  alt=""
                  className="h-7 w-7 object-contain"
                />
              </span>
              <span className="hidden sm:block leading-none">
                <span className="block font-display text-[26px] font-semibold tracking-[-0.04em] text-ink">
                  Nova<span className="text-poppy">Cart</span>
                </span>
                <span className="mt-1 block font-tag text-[7px] uppercase tracking-[0.28em] text-ink-soft">
                  Smart shopping. Delivered.
                </span>
              </span>
            </div>
          </Link>

          <nav className="hidden xl:flex items-center gap-6 ml-2" aria-label="Primary navigation">
            <Link href="/products" className="nav-link">Catalog</Link>
            <Link href="/products?sort=newest" className="nav-link">New arrivals</Link>
            <Link href="/products?sort=best" className="nav-link">Best picks</Link>
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <SiteSearch />
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`Open shopping bag with ${itemCount} items`}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-card text-ink-soft transition hover:border-poppy/30 hover:text-ink"
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.7} />
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-poppy px-1 text-[8px] font-bold text-white">
                {itemCount}
              </span>
            </button>

            <ThemeToggle />

            {user ? (
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  className="flex max-w-[220px] items-center gap-2 rounded-full border border-ink/10 bg-card px-3 py-1.5 text-ink shadow-sm transition hover:border-poppy/30"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-poppy/10 text-poppy">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="hidden md:block max-w-[140px] truncate text-sm font-semibold">
                    {shortName}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
                </button>

                {accountOpen && (
                  <>
                    <button
                      className="fixed inset-0 z-40 cursor-default"
                      aria-label="Close account menu"
                      onClick={() => setAccountOpen(false)}
                    />
                    <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-3xl border border-ink/10 bg-card shadow-[0_24px_80px_rgba(35,25,18,0.16)]">
                      <div className="border-b border-ink/10 bg-cream-soft/70 p-5">
                        <p className="font-semibold text-ink truncate">{displayName}</p>
                        <p className="mt-1 text-xs text-ink-soft truncate">{user.email}</p>
                      </div>
                      <div className="p-2">
                        <Link href="/account" onClick={() => setAccountOpen(false)} className="account-menu-link">
                          <UserRound className="h-4 w-4 text-poppy" /> My account
                        </Link>
                        <Link href="/account#addresses" onClick={() => setAccountOpen(false)} className="account-menu-link">
                          <MapPin className="h-4 w-4 text-poppy" /> Addresses
                        </Link>
                        <Link href="/orders" onClick={() => setAccountOpen(false)} className="account-menu-link">
                          <Package className="h-4 w-4 text-poppy" /> My orders
                        </Link>
                      </div>
                      <div className="border-t border-ink/10 p-2">
                        <button
                          onClick={handleLogout}
                          disabled={loggingOut}
                          className="account-menu-link w-full text-poppy"
                        >
                          <LogOut className="h-4 w-4" /> {loggingOut ? "Signing out…" : "Sign out"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5">
                <Link href="/login" className="text-sm font-semibold px-3 py-2 text-ink-soft hover:text-ink transition-colors">
                  Sign in
                </Link>
                <Link href="/register" className="inline-flex text-sm font-semibold px-4 py-2.5 bg-poppy hover:bg-poppy-dark text-white rounded-xl transition-colors shadow-sm">
                  Register
                </Link>
              </div>
            )}

            <button
              type="button"
              className="sm:hidden grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-card text-ink-soft"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-ink/10 bg-card px-5 py-4 sm:hidden">
            <div className="mx-auto max-w-7xl space-y-3">
              <SiteSearch mobile />
              <nav className="grid gap-1" aria-label="Mobile navigation">
                <Link href="/products" onClick={() => setMobileOpen(false)} className="mobile-nav-link">Catalog</Link>
                <Link href="/products?sort=newest" onClick={() => setMobileOpen(false)} className="mobile-nav-link">New arrivals</Link>
                <Link href="/products?sort=best" onClick={() => setMobileOpen(false)} className="mobile-nav-link">Best picks</Link>
                {user ? (
                  <>
                    <Link href="/account" onClick={() => setMobileOpen(false)} className="mobile-nav-link">My account</Link>
                    <Link href="/orders" onClick={() => setMobileOpen(false)} className="mobile-nav-link">My orders</Link>
                    <button onClick={handleLogout} className="mobile-nav-link text-left text-poppy">{loggingOut ? "Signing out…" : "Sign out"}</button>
                  </>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setMobileOpen(false)} className="mobile-nav-link">Sign in</Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)} className="mobile-nav-link">Create account</Link>
                  </>
                )}
              </nav>
            </div>
          </div>
        )}
      </header>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
