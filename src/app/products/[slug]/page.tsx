import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CreditCard,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AddToCart } from "@/components/AddToCart";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductCard } from "@/components/ProductCard";
import { formatCurrency } from "@/lib/utils";

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      brand: true,
      category: true,
      variants: true,
    },
  });

  if (!product || !product.isActive) return notFound();

  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  if (product.variants.length === 0 || totalStock <= 0) return notFound();

  const mainVariant = product.variants.find((v) => Boolean(v.imageUrl)) ?? product.variants[0];
  const displayPrice = Number(mainVariant?.price ?? product.basePrice);
  const images = product.variants.map((v) => v.imageUrl || "").filter(Boolean);
  const freeShippingEligible = displayPrice >= 999;

  const related = await prisma.product.findMany({
    where: {
      isActive: true,
      id: { not: product.id },
      ...(product.categoryId ? { categoryId: product.categoryId } : {}),
      variants: { some: { stock: { gt: 0 } } },
    },
    include: { variants: true, category: true },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  return (
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-6 sm:pt-10">
      <nav className="mb-8 flex items-center gap-1.5 overflow-hidden text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/" className="shrink-0 hover:text-poppy">Home</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href="/products" className="shrink-0 hover:text-poppy">Catalog</Link>
        {product.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <Link href={`/products?category=${product.category.slug}`} className="shrink-0 hover:text-poppy">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium text-ink">{product.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <ProductGallery title={product.title} images={images} />

        <div className="pt-2 lg:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            {product.category && (
              <Link href={`/products?category=${product.category.slug}`} className="rounded-full bg-cream-soft px-3 py-1.5 font-tag text-[9px] uppercase tracking-[0.16em] text-ink-soft hover:text-poppy">
                {product.category.name}
              </Link>
            )}
            {product.brand && (
              <span className="rounded-full border border-ink/10 bg-card px-3 py-1.5 font-tag text-[9px] uppercase tracking-[0.16em] text-ink-soft">
                {product.brand.name}
              </span>
            )}
          </div>

          <h1 className="mt-5 max-w-2xl font-display text-4xl italic leading-[1.04] tracking-[-0.03em] text-ink sm:text-5xl">
            {product.title}
          </h1>

          <div className="mt-6 flex items-end gap-4 border-b border-ink/10 pb-7">
            <span className="font-tag text-3xl font-bold text-poppy">{formatCurrency(displayPrice)}</span>
            <span className="pb-1 text-xs text-ink-soft">Inclusive of all taxes</span>
          </div>

          <p className="mt-7 text-sm leading-7 text-ink-soft sm:text-base">
            {product.description || "A thoughtfully selected NovaCart find, presented with the details you need to make an easy decision."}
          </p>

          <div className="mt-6 flex items-center gap-2 text-sm font-semibold">
            {totalStock > 5 ? (
              <><CircleCheck className="h-4 w-4 text-sage" /> <span className="text-sage">In stock · ready to ship</span></>
            ) : (
              <><CircleAlert className="h-4 w-4 text-marigold" /> <span className="text-marigold">Only {totalStock} left</span></>
            )}
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-ink/10 bg-card p-4 shadow-sm sm:p-5">
            <AddToCart product={product} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink/10 bg-card p-4">
              <Truck className="h-4 w-4 text-sage" />
              <p className="mt-3 text-xs font-bold text-ink">{freeShippingEligible ? "Free delivery" : "Tracked delivery"}</p>
              <p className="mt-1 text-[11px] leading-5 text-ink-soft">3–6 business days</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-card p-4">
              <RotateCcw className="h-4 w-4 text-marigold" />
              <p className="mt-3 text-xs font-bold text-ink">7-day returns</p>
              <p className="mt-1 text-[11px] leading-5 text-ink-soft">Simple return process</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-card p-4">
              <ShieldCheck className="h-4 w-4 text-poppy" />
              <p className="mt-3 text-xs font-bold text-ink">Secure checkout</p>
              <p className="mt-1 text-[11px] leading-5 text-ink-soft">Payments verified server-side</p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-ink/10 bg-card p-6">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-5 w-5 text-poppy" />
              <div>
                <h2 className="text-sm font-bold text-ink">Pay the way that suits you</h2>
                <p className="mt-1 text-xs leading-5 text-ink-soft">Razorpay supports cards, UPI, net banking and wallets. Cash on delivery is also available where enabled.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-20 border-y border-ink/10 py-14">
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <span className="section-kicker">Product details</span>
            <h2 className="mt-2 font-display text-3xl italic text-ink">Everything you need to know.</h2>
          </div>
          <div className="lg:col-span-2 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-ink">The NovaCart standard</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">Products are presented with clear pricing, current availability and straightforward delivery information so the shopping decision stays simple.</p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Delivery & returns</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">Orders are tracked and supported by a simple seven-day return window. Your selected address and contact details are used to fulfil the order.</p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Payment</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">Online payments are processed through Razorpay and verified server-side before the order is marked paid.</p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Availability</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">Products are shown to customers only when they are active and there is sellable stock available.</p>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="section-kicker">More to explore</span>
              <h2 className="mt-2 font-display text-3xl italic text-ink">You may also like.</h2>
            </div>
            <Link href="/products" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-poppy">
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4 lg:gap-7">
            {related.map((item) => {
              const variant = item.variants.find((v) => Boolean(v.imageUrl)) ?? item.variants[0];
              const stock = item.variants.reduce((sum, v) => sum + v.stock, 0);
              return (
                <ProductCard key={item.id} product={{ id: item.id, slug: item.slug, title: item.title, price: Number(variant?.price ?? item.basePrice), imageUrl: variant?.imageUrl || undefined, categoryName: item.category?.name, stock }} />
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
