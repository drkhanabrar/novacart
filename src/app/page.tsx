import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-24 pb-24">
      <section className="relative pt-24 pb-16 px-6 max-w-7xl mx-auto w-full text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/50 text-xs font-mono text-neutral-400 mb-8">
          <Sparkles className="w-3.5 h-3.5 text-neutral-200" />
          <span>Curated by NOVA Engine</span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-white max-w-4xl leading-[1.1]">
          Engineered for speed. Defined by precision.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-neutral-400 max-w-2xl leading-relaxed">
          Experience a storefront backed by dynamic intelligence. Every item evaluated for real-world reliability and premium performance.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link href="/products" className="inline-flex items-center justify-center gap-2 bg-white text-black font-medium px-8 py-3.5 rounded-full hover:bg-neutral-200 transition-colors">
            Explore Catalog
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/categories" className="inline-flex items-center justify-center bg-neutral-900 text-neutral-300 border border-neutral-800 font-medium px-8 py-3.5 rounded-full hover:bg-neutral-800 transition-colors">
            View Categories
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="glass-panel p-8 rounded-2xl flex flex-col gap-3">
          <Zap className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">Zero Latency Storefront</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Instant interaction execution with edge-cached state and real-time inventory verification.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-2xl flex flex-col gap-3">
          <ShieldCheck className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">Verified Supply Chain</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Every product supplier is continuously scored for fulfillment speed and quality assurance.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-2xl flex flex-col gap-3">
          <Sparkles className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">Adaptive Curation</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Behind the scenes, intelligence engines monitor global signals to surface top products.
          </p>
        </div>
      </section>
    </div>
  );
}