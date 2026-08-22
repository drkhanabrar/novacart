import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, SlidersHorizontal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/ProductCard";

const baseFilter = {
  isActive: true,
  variants: {
    some: { stock: { gt: 0 } },
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) || {};
  const q = (first(params.q) || "").trim();
  const category = (first(params.category) || "").trim();
  const sort = first(params.sort) || "newest";

  const where = {
    ...baseFilter,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(category
      ? { category: { slug: category } }
      : {}),
  };

  const orderBy =
    sort === "price-asc"
      ? { basePrice: "asc" as const }
      : sort === "price-desc"
        ? { basePrice: "desc" as const }
        : { createdAt: "desc" as const };

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, category: true, intelligence: true },
      orderBy,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, take: 12 }),
  ]);

  const bestFirst = sort === "best";
  const sortedProducts = bestFirst
    ? products
        .slice()
        .sort((a, b) => {
          const scoreA = a.intelligence ? Number(a.intelligence.aiScore) : -1;
          const scoreB = b.intelligence ? Number(b.intelligence.aiScore) : -1;
          return scoreB - scoreA;
        })
    : products;

  const buildUrl = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: q || null,
      category: category || null,
      sort: sort !== "newest" ? sort : null,
      ...overrides,
    })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return `/products${query ? `?${query}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 sm:mb-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <span className="section-kicker">The collection</span>
            <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">
              Products worth considering.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-ink-soft sm:text-base">
              A focused selection of products currently available to shop. The collection evolves as new products earn their place.
            </p>
          </div>
          <div className="rounded-full border border-ink/10 bg-card px-4 py-2 font-tag text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft shadow-sm">
            {sortedProducts.length} {sortedProducts.length === 1 ? "product" : "products"}
          </div>
        </div>

        <div className="mt-8 overflow-x-auto pb-2">
          <div className="flex min-w-max items-center gap-2">
            <Link href={buildUrl({ category: null })} className={`rounded-full border px-4 py-2.5 text-xs font-semibold transition ${!category ? "border-poppy bg-poppy text-white" : "border-ink/10 bg-card text-ink-soft hover:border-poppy/30 hover:text-ink"}`}>
              All products
            </Link>
            {categories.map((item) => (
              <Link key={item.id} href={buildUrl({ category: item.slug })} className={`rounded-full border px-4 py-2.5 text-xs font-semibold transition ${category === item.slug ? "border-poppy bg-poppy text-white" : "border-ink/10 bg-card text-ink-soft hover:border-poppy/30 hover:text-ink"}`}>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-card/65 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <SlidersHorizontal className="h-4 w-4" />
          {q ? <span>Showing results for <strong className="text-ink">“{q}”</strong></span> : <span>Available now</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:block font-tag text-[9px] uppercase tracking-[0.16em] text-ink-soft">Sort</span>
          <div className="flex items-center gap-1">
            <Link href={buildUrl({ sort: "newest" })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sort === "newest" ? "bg-ink text-white" : "text-ink-soft hover:bg-cream"}`}>
              Newest
            </Link>
            <Link href={buildUrl({ sort: "price-asc" })} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${sort === "price-asc" ? "bg-ink text-white" : "text-ink-soft hover:bg-cream"}`}>
              <ArrowDown className="h-3 w-3" /> Price
            </Link>
            <Link href={buildUrl({ sort: "price-desc" })} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${sort === "price-desc" ? "bg-ink text-white" : "text-ink-soft hover:bg-cream"}`}>
              <ArrowUp className="h-3 w-3" /> Price
            </Link>
          </div>
        </div>
      </div>

      {sortedProducts.length === 0 ? (
        <div className="rounded-[2rem] border border-ink/10 bg-card p-14 text-center shadow-sm sm:p-20">
          <span className="section-kicker">Nothing matched</span>
          <h2 className="mt-2 font-display text-3xl italic text-ink">Try another search.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">
            Try a broader term or return to the full collection. Products only appear here when they are active and currently available to buy.
          </p>
          <Link href="/products" className="premium-button mt-7">Browse the collection <ChevronDown className="h-4 w-4 rotate-[-90deg]" /></Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
          {sortedProducts.map((product) => {
            const variant = product.variants.find((v) => Boolean(v.imageUrl)) ?? product.variants[0];
            const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
            return (
              <ProductCard
                key={product.id}
                product={{
                  id: product.id,
                  slug: product.slug,
                  title: product.title,
                  price: Number(variant?.price ?? product.basePrice),
                  imageUrl: variant?.imageUrl || undefined,
                  categoryName: product.category?.name,
                  stock,
                }}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
