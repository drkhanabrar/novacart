// FILE: src/app/admin/catalog/page.tsx
//
// Product and inventory management. Stock is editable inline because that is
// the field an admin changes most often and it should not require opening a
// second page.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { InlineNumber, ActionButton } from "@/components/admin/AdminForm";
import {
  updateStockAction,
  setProductActiveAction,
} from "@/actions/admin-commerce";

export const dynamic = "force-dynamic";

const LOW_STOCK_THRESHOLD = Number(process.env.NOVA_LOW_STOCK_ALERT || 5);

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;

  const where = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(filter === "out"
      ? { variants: { every: { stock: { lte: 0 } } } }
      : filter === "low"
        ? {
            variants: {
              some: { stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
            },
          }
        : filter === "hidden"
          ? { isActive: false }
          : filter === "live"
            ? { isActive: true }
            : {}),
  };

  const products = await prisma.product.findMany({
    where,
    include: {
      variants: true,
      category: { select: { name: true } },
      lifecycle: { select: { state: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const filters = [
    ["", "All"],
    ["live", "Live"],
    ["hidden", "Hidden"],
    ["low", "Low stock"],
    ["out", "Out of stock"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Catalog
        </h1>
        <Link
          href="/admin/catalog/new"
          className="rounded-full bg-poppy px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Add product
        </Link>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Link
            key={label}
            href={value ? `/admin/catalog?filter=${value}` : "/admin/catalog"}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              (filter ?? "") === value
                ? "border-poppy bg-poppy/10 text-ink"
                : "border-ink/15 text-ink-soft hover:bg-cream-soft"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form className="mt-5" action="/admin/catalog">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search products"
          className="w-full max-w-md rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
        />
      </form>

      {products.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-card p-6 text-sm text-ink-soft">
          No products match this view.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {products.map((product) => {
            const stock = product.variants.reduce(
              (sum, variant) => sum + variant.stock,
              0,
            );
            const visible = product.isActive && stock > 0;

            return (
              <li
                key={product.id}
                className="rounded-2xl border border-ink/10 bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/catalog/${product.id}`}
                      className="font-semibold text-ink hover:text-poppy"
                    >
                      {product.title}
                    </Link>
                    <p className="mt-1 font-tag text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                      {formatCurrency(Number(product.basePrice))}
                      {product.category && ` · ${product.category.name}`}
                      {product.lifecycle && ` · ${product.lifecycle.state}`}
                    </p>
                  </div>
                  <p
                    className={`font-tag text-xs font-bold ${
                      visible ? "text-sage" : "text-poppy"
                    }`}
                  >
                    {visible
                      ? "ON STOREFRONT"
                      : !product.isActive
                        ? "HIDDEN"
                        : "OUT OF STOCK"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-6">
                  {product.variants.map((variant) => (
                    <InlineNumber
                      key={variant.id}
                      action={updateStockAction}
                      values={{ variantId: variant.id }}
                      field="stock"
                      initial={variant.stock}
                      label={`Stock for ${variant.name}`}
                      suffix={`in stock — ${variant.name}`}
                    />
                  ))}

                  {product.variants.length === 0 && (
                    <p className="text-sm text-poppy">
                      No variant exists, so this can never be bought. Open it to
                      add one.
                    </p>
                  )}

                  <ActionButton
                    action={setProductActiveAction}
                    values={{
                      productId: product.id,
                      active: String(!product.isActive),
                    }}
                    label={product.isActive ? "Hide" : "Make live"}
                    tone={product.isActive ? "danger" : "primary"}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
