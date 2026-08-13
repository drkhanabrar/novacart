import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/AddToCart";
import { Hexagon, Sparkles } from "lucide-react";

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { brand: true, category: true, variants: true, intelligence: true }
  });

  if (!product) return notFound();

  const displayPrice = product.basePrice.toString();
  const aiScore = product.intelligence?.aiScore?.toString() || "N/A";
  const imageUrl = (product.variants && product.variants.length > 0 && product.variants[0].imageUrl) ? product.variants[0].imageUrl : "";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
        
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 flex items-center justify-center min-h-[400px]">
          {imageUrl ? (
            <img src={imageUrl} alt={product.title} className="max-w-full h-auto rounded-xl object-contain" />
          ) : (
            <div className="flex flex-col items-center opacity-50">
               <Hexagon className="w-24 h-24 text-neutral-600 mb-4" />
               <span className="text-sm text-neutral-500 font-mono">No Image Available</span>
            </div>
          )}
        </div>
        
        <div className="flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-6 w-max backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5" />
            {product.brand?.name || "Independent"} • {product.category?.name || "General"}
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">{product.title}</h1>
          <p className="text-neutral-400 text-lg mb-8 leading-relaxed">
            {product.description || "Experience premium engineering. No detailed description available for this variant."}
          </p>
          
          <div className="flex items-center gap-6 mb-8 border-t border-neutral-800/80 pt-8">
            <span className="text-4xl font-bold text-white">${displayPrice}</span>
            <span className="px-4 py-1.5 bg-neutral-800/50 border border-neutral-700/50 rounded-xl text-sm font-bold text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              AI Score: {aiScore}
            </span>
          </div>
          
          {/* Passing the exact required prop here to fix the TS2322 Error */}
          <AddToCart product={product} />
        </div>
      </div>
    </div>
  );
}