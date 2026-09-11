// FILE: src/app/admin/layout.tsx
//
// Gate for the whole admin area.
//
// notFound() rather than a redirect or a 403: a non-admin should not be able to
// learn that /admin exists at all, and a 403 confirms it does.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * Two groups, deliberately separated.
 *
 * Running the shop (orders, catalog, customers) and supervising NOVA
 * (candidates, lifecycle, intelligence) are different jobs done in different
 * frames of mind. Mixing them in one flat list made the daily commerce work
 * harder to find.
 */
const SHOP_TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/customers", label: "Customers" },
];

const NOVA_TABS = [
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/lifecycle", label: "Lifecycle" },
  { href: "/admin/nova", label: "Intelligence" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();

  if (!admin) notFound();

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-ink/10 bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              NOVA Control
            </p>
            <p className="text-sm text-ink">
              Signed in as {admin.name || admin.email}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {SHOP_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-cream-soft hover:text-ink"
              >
                {tab.label}
              </Link>
            ))}
            <span className="mx-2 h-4 w-px bg-ink/15" aria-hidden />
            {NOVA_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-cream-soft hover:text-ink"
              >
                {tab.label}
              </Link>
            ))}
            <span className="mx-2 h-4 w-px bg-ink/15" aria-hidden />
            <Link
              href="/"
              className="rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-cream-soft hover:text-ink"
            >
              Storefront
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
