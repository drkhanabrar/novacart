import Link from "next/link";
import { Cpu } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function ProductsCatalogPage() {
  // Fetch all products from Supabase, including their variants and AI intelligence
 const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      variants: true,
      category: true,
      intelligence: true,
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-4xl font-bold text-white tracking-tight">
          NOVA Catalog
        </h1>
        <span className="text-sm text-neutral-400 font-mono">
          {products.length} PRODUCT(S)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {products.map((product) => {
          const mainVariant = product.variants[0];

          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="group flex flex-col gap-4 bg-neutral-900/50 border border-neutral-800 rounded-3xl p-4 hover:border-neutral-700 transition-colors"
            >
{/* Product Image Gallery */}
              <div className="aspect-square relative overflow-hidden rounded-2xl bg-neutral-900">
                {mainVariant?.imageUrl ? (
                  <img
                    src={mainVariant.imageUrl}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-700">
                    <Cpu className="w-10 h-10" />
                  </div>
                )}
                
                {/* NOVA AI Intelligence Badge */}
                {product.intelligence && (
                  <div className="absolute top-3 left-3 glass-panel px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-indigo-500/20 bg-indigo-500/10">
                    <Cpu className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      Score: {product.intelligence.aiScore.toString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="flex flex-col gap-1 px-2 pb-2">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                  {product.category?.name || "Uncategorized"}
                </span>
                <h2 className="text-lg font-semibold text-white truncate">
                  {product.title}
                </h2>
                <p className="text-sm text-neutral-400 font-medium mt-1">
                  {formatCurrency(Number(mainVariant?.price || product.basePrice))}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}