import Link from "next/link";
import {
  ArrowRight,
  Truck,
  ShieldCheck,
  RotateCcw,
  Lamp,
  Sofa,
  ShowerHead,
  Flower2,
  Gem,
  Star,
  Cpu,
  Sparkles,
  PackageCheck,
  CreditCard,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ProductCard } from "@/components/ProductCard";

const fallbackCategories = [
  { name: "Lighting", icon: Lamp },
  { name: "Furniture", icon: Sofa },
  { name: "Bath", icon: ShowerHead },
  { name: "Planters", icon: Flower2 },
  { name: "Accents", icon: Gem },
];

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function LandingPage() {
  const [currentUser, recentProducts, categories, productCount] =
    await Promise.all([
      getCurrentUser(),
      prisma.product.findMany({
        where: {
          isActive: true,
          variants: {
            some: {
              stock: { gt: 0 },
            },
          },
        },
        include: {
          variants: true,
          category: true,
          intelligence: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.category.findMany({
        orderBy: { name: "asc" },
        take: 6,
      }),
      prisma.product.count({
        where: {
          isActive: true,
          variants: {
            some: {
              stock: { gt: 0 },
            },
          },
        },
      }),
    ]);

  const bestSellers = recentProducts
    .slice()
    .sort((a, b) => {
      const scoreA = a.intelligence
        ? Number(a.intelligence.aiScore)
        : -1;
      const scoreB = b.intelligence
        ? Number(b.intelligence.aiScore)
        : -1;

      return scoreB - scoreA;
    })
    .slice(0, 6);

  const heroProduct = recentProducts[0] ?? null;
  const heroVariant = heroProduct
    ? heroProduct.variants.find((variant) => Boolean(variant.imageUrl)) ??
      heroProduct.variants[0]
    : null;

  const displayCategories =
    categories.length > 0
      ? categories.map((category, index) => ({
          name: category.name,
          slug: category.slug,
          icon: fallbackCategories[index % fallbackCategories.length].icon,
        }))
      : fallbackCategories.map((category) => ({
          name: category.name,
          slug: category.name.toLowerCase().replace(/\s+/g, "-"),
          icon: category.icon,
        }));

  return (
    <div className="overflow-x-hidden">
      {/* ---------- Hero ---------- */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-6 pt-10 sm:pt-14 pb-20 lg:pb-24 grid lg:grid-cols-[0.95fr_1.05fr] gap-12 lg:gap-16 items-center">
          <div className="max-w-2xl">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2">
                <span className="h-px w-8 bg-poppy" />
                <span className="font-tag text-[10px] uppercase tracking-[0.28em] text-poppy">
                  The NovaCart Edit
                </span>
              </div>

              <p className="mt-3 max-w-md text-xs tracking-wide text-ink-soft">
                Thoughtfully selected finds for everyday living.
              </p>
            </div>

            <h1 className="font-display italic text-5xl sm:text-6xl lg:text-[5.8rem] leading-[0.98] tracking-[-0.04em] text-ink">
              Little finds for
              <br />
              <span className="text-poppy">every corner</span>
              <br />
              of home.
            </h1>

            <p className="text-base sm:text-lg text-ink-soft max-w-xl mt-7 leading-relaxed">
              A constantly refreshed collection of products worth buying —
              thoughtfully selected, beautifully presented, and simple to shop.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-9">
              <Link
                href="/products"
                className="px-7 py-3.5 bg-poppy hover:bg-poppy-dark text-white rounded-full font-semibold transition-all duration-300 flex items-center gap-2 shadow-[0_12px_35px_rgba(217,74,74,0.22)] hover:-translate-y-0.5"
              >
                Explore the edit
                <ArrowRight className="w-4 h-4" />
              </Link>

              {currentUser ? (
                <Link
                  href="/account"
                  className="px-7 py-3.5 bg-card border border-ink/12 hover:border-ink/25 text-ink rounded-full font-semibold transition-all duration-300 hover:-translate-y-0.5"
                >
                  My account
                </Link>
              ) : (
                <Link
                  href="/register"
                  className="px-7 py-3.5 bg-card border border-ink/12 hover:border-ink/25 text-ink rounded-full font-semibold transition-all duration-300 hover:-translate-y-0.5"
                >
                  Create account
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 text-xs text-ink-soft">
              <div className="flex items-center gap-1.5">
                <div className="flex text-marigold">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <span>Designed for effortless shopping</span>
              </div>

              <span className="hidden sm:block w-px h-4 bg-ink/10" />

              <span>Free delivery over ₹999</span>
            </div>
          </div>

          <div className="relative min-h-[460px] sm:min-h-[560px] flex items-center justify-center lg:justify-end">
            {heroProduct && heroVariant?.imageUrl ? (
              <>
                <div className="absolute left-4 top-12 hidden sm:block h-20 w-20 rounded-full border border-ink/10 bg-card/70 backdrop-blur-sm shadow-sm" />
                <div className="absolute right-0 top-8 hidden sm:block h-28 w-28 rounded-full bg-marigold/15 blur-2xl" />

                <Link
                  href={`/products/${heroProduct.slug}`}
                  className="group relative z-10 w-[78%] sm:w-[64%] max-w-[460px]"
                  aria-label={`View ${heroProduct.title}`}
                >
                  <div className="relative overflow-hidden rounded-[2rem] border-[6px] border-card bg-card shadow-[0_30px_80px_rgba(35,25,18,0.16)] rotate-[2deg] transition-all duration-500 group-hover:rotate-0 group-hover:-translate-y-1">
                    <img
                      src={heroVariant.imageUrl}
                      alt={heroProduct.title}
                      className="aspect-[0.95] w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                    />

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-5 sm:p-6 pt-20">
                      <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <span className="font-tag text-[9px] uppercase tracking-[0.2em] text-white/70">
                            Featured today
                          </span>
                          <h2 className="mt-1 text-lg sm:text-xl font-semibold leading-tight text-white">
                            {heroProduct.title}
                          </h2>
                        </div>

                        <span className="shrink-0 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-ink">
                          {formatPrice(
                            Number(
                              heroVariant.price ?? heroProduct.basePrice,
                            ),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>

                <div className="absolute left-2 bottom-16 hidden sm:flex items-center gap-2 rounded-full border border-ink/10 bg-card/90 px-4 py-2 shadow-lg backdrop-blur-sm">
                  <PackageCheck className="h-4 w-4 text-sage" />
                  <span className="font-tag text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                    In stock · ready to ship
                  </span>
                </div>

                <div className="absolute right-2 top-4 sm:right-10 sm:top-10 flex h-16 w-16 sm:h-20 sm:w-20 rotate-12 flex-col items-center justify-center rounded-full bg-poppy text-white shadow-xl border-4 border-cream font-tag text-center leading-tight">
                  <span className="text-[9px] sm:text-[10px] font-bold">
                    NOVA
                  </span>
                  <span className="text-[8px] sm:text-[9px]">
                    selected
                  </span>
                </div>
              </>
            ) : (
              <div className="w-full max-w-xl rounded-[2rem] border border-ink/10 bg-card p-10 shadow-xl text-center">
                <p className="font-display italic text-3xl text-ink">
                  The first edit is taking shape.
                </p>
                <p className="mt-3 text-sm text-ink-soft">
                  New products will appear here automatically as NovaCart
                  brings them into stock.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <section className="border-y border-ink/10 bg-card/65 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-7 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
          {[
            {
              icon: Sparkles,
              title: "Thoughtfully selected",
              text: "A focused edit, not an endless catalog.",
              tone: "text-sage bg-sage/10",
            },
            {
              icon: Truck,
              title: "Free over ₹999",
              text: "Straightforward delivery, clearly priced.",
              tone: "text-sage bg-sage/10",
            },
            {
              icon: CreditCard,
              title: "Secure checkout",
              text: "Pay online securely with Razorpay.",
              tone: "text-poppy bg-poppy/10",
            },
            {
              icon: RotateCcw,
              title: "Simple returns",
              text: "A calmer way to shop and change your mind.",
              tone: "text-marigold bg-marigold/10",
            },
          ].map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl mt-0.5 ${tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">{title}</h3>
                <p className="text-xs text-ink-soft mt-1 leading-relaxed">
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Shop by category ---------- */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between gap-5 mb-8">
          <div>
            <span className="font-tag text-[10px] uppercase tracking-[0.22em] text-poppy">
              Discover
            </span>
            <h2 className="font-display italic text-3xl sm:text-4xl text-ink mt-2">
              Shop by category
            </h2>
          </div>

          {productCount > 0 && (
            <Link
              href="/products"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-poppy transition-colors"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {displayCategories.slice(0, 5).map(({ name, icon: Icon }) => (
            <Link
              key={name}
              href="/products"
              className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-card p-5 sm:p-6 min-h-[132px] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-poppy/25 hover:shadow-lg"
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cream-soft transition-transform duration-500 group-hover:scale-125" />
              <div className="relative">
                <div className="inline-flex rounded-xl bg-ink/[0.035] p-2.5 text-ink-soft transition-colors group-hover:bg-poppy/10 group-hover:text-poppy">
                  <Icon className="w-5 h-5" />
                </div>

                <div className="mt-7 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{name}</span>
                  <ArrowRight className="w-4 h-4 text-ink/30 transition-transform group-hover:translate-x-1 group-hover:text-poppy" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Latest edit ---------- */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-9">
          <div>
            <span className="font-tag text-[10px] uppercase tracking-[0.22em] text-poppy">
              This week
            </span>
            <h2 className="font-display italic text-3xl sm:text-4xl text-ink mt-2">
              The latest edit
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {productCount > 0
                ? `${productCount} product${productCount === 1 ? "" : "s"} currently available to shop.`
                : "Fresh pieces appear here as they are ready to sell."}
            </p>
          </div>

          {productCount > 0 && (
            <Link
              href="/products"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-poppy transition-colors"
            >
              See the full collection
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {bestSellers.length === 0 ? (
          <div className="rounded-[2rem] border border-ink/10 bg-card p-16 text-center">
            <p className="font-display italic text-2xl text-ink mb-2">
              New pieces on the way
            </p>
            <p className="text-sm text-ink-soft max-w-sm mx-auto">
              NovaCart is preparing its next release. The collection will
              update automatically as new items become available.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {bestSellers.map((product) => {
              const mainVariant =
                product.variants.find((variant) => Boolean(variant.imageUrl)) ??
                product.variants[0];

              const totalStock = product.variants.reduce(
                (sum, variant) => sum + variant.stock,
                0,
              );

              return (
                <ProductCard
                  key={product.id}
                  product={{
                    id: product.id,
                    slug: product.slug,
                    title: product.title,
                    price: Number(
                      mainVariant?.price ?? product.basePrice,
                    ),
                    imageUrl:
                      mainVariant?.imageUrl || undefined,
                    categoryName: product.category?.name,
                    aiScore: null,
                    stock: totalStock,
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Why NovaCart ---------- */}
      <section className="border-y border-ink/10 bg-card/55">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <span className="font-tag text-[10px] uppercase tracking-[0.22em] text-poppy">
              Why NovaCart
            </span>

            <h2 className="font-display italic text-3xl sm:text-4xl text-ink mt-2">
              Less scrolling. Better finds.
            </h2>

            <p className="mt-4 text-sm sm:text-base leading-7 text-ink-soft">
              We keep the customer experience deliberately simple. A tighter
              edit, clear prices, useful information, and a checkout that gets
              out of the way.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                number: "01",
                title: "A focused collection",
                text: "We would rather show fewer products worth considering than hundreds you have to dig through.",
              },
              {
                number: "02",
                title: "Simple decisions",
                text: "Clear product pages, straightforward pricing, and a checkout designed to feel calm.",
              },
              {
                number: "03",
                title: "Always evolving",
                text: "The collection is designed to change as new products prove themselves and old ones leave.",
              },
            ].map((item) => (
              <div
                key={item.number}
                className="rounded-3xl border border-ink/10 bg-card p-6 sm:p-7"
              >
                <span className="font-tag text-[10px] tracking-[0.2em] text-poppy">
                  {item.number}
                </span>
                <h3 className="mt-7 text-lg font-semibold text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="px-6 py-20">
        <div className="max-w-7xl mx-auto rounded-[2.5rem] border border-ink/10 bg-card px-8 sm:px-16 py-14 sm:py-16 text-center relative overflow-hidden shadow-sm">
          <div className="absolute -top-16 -right-10 h-44 w-44 rounded-full bg-marigold/15" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-poppy/10" />

          <div className="relative max-w-2xl mx-auto">
            <span className="font-tag text-[10px] uppercase tracking-[0.22em] text-poppy">
              The NovaCart edit
            </span>

            <h2 className="font-display italic text-3xl sm:text-5xl text-ink leading-tight mt-2">
              Something good might be waiting.
            </h2>

            <p className="text-ink-soft max-w-xl mx-auto mt-4 leading-7">
              Take a look through the collection and see what catches your
              eye.
            </p>

            <Link
              href="/products"
              className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 bg-poppy text-white rounded-full font-semibold hover:bg-poppy-dark transition-all duration-300 hover:-translate-y-0.5 shadow-[0_12px_35px_rgba(217,74,74,0.18)]"
            >
              Explore the collection
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
