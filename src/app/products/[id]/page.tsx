import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cpu, ShieldCheck } from "lucide-react";
import { AddToCart } from "@/components/AddToCart";
import { prisma } from "@/lib/prisma";

export default async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const product = await prisma.product.findUnique({
    where: { slug: id },
    include: {
      category: true,
      brand: true,
      variants: true,
      intelligence: true,
    }
  });

  if (!product || !product.intelligence || product.variants.length === 0) {
    return notFound();
  }

  const mainVariant = product.variants[0];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Link href="/products" className="inline-flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-white mb-10 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Catalog
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <div className="flex flex-col gap-4">
          <div className="aspect-square relative overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800">
            <img
              src={mainVariant.imageUrl}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
              {product.brand.name} / {product.category.name}
            </span>
          </div>

          <h1 className="text-4xl font-bold text-white tracking-tight mb-6">
            {product.title}
          </h1>

          <div className="glass-panel rounded-xl p-5 mb-8 flex flex-col gap-3 border border-indigo-500/20 bg-indigo-500/5">
            <div className="flex items-center gap-2 text-indigo-400">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">NOVA AI Analysis</span>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Product ranks in the 94th percentile for reliability. Global supply chain signals indicate high demand velocity with stable fulfillment metrics.
            </p>
            <div className="flex items-center gap-6 mt-2 pt-4 border-t border-indigo-500/10">
              <div>
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Trust Score</p>
                <p className="text-lg font-mono text-white font-medium">{product.intelligence.aiScore}/100</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Market Demand</p>
                <p className="text-sm font-semibold text-emerald-400">{product.intelligence.demandLevel}</p>
              </div>
            </div>
          </div>

          <p className="text-base text-neutral-400 leading-relaxed mb-8">
            {product.description}
          </p>

          <div className="flex items-center gap-4 mb-2 text-sm text-neutral-400">
            <ShieldCheck className="w-5 h-5 text-neutral-500" />
            <span>Verified authentic. 2-year warranty included.</span>
          </div>

          <AddToCart
            productId={product.id}
            variantId={mainVariant.id}
            title={product.title}
            price={Number(mainVariant.price)}
            imageUrl={mainVariant.imageUrl}
          />
        </div>
      </div>
    </div>
  );
}