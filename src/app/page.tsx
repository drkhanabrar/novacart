import Link from "next/link";
import { ArrowRight, Sparkles, Shield, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-8 backdrop-blur-md">
        <Sparkles className="w-3.5 h-3.5" />
        Curated by NOVA Intelligence Engine
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight max-w-4xl leading-tight">
        Engineered for speed. <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
          Defined by precision.
        </span>
      </h1>

      <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mt-6">
        Experience a storefront backed by dynamic intelligence. Every item evaluated for real-world reliability and premium performance.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
        <Link 
          href="/products" 
          className="px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-bold transition-all flex items-center gap-2 shadow-xl shadow-indigo-500/25"
        >
          Explore Catalog
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link 
          href="/register" 
          className="px-8 py-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white rounded-2xl font-bold transition-all"
        >
          Create Account
        </Link>
        <Link 
          href="/login" 
          className="px-6 py-4 text-neutral-400 hover:text-white font-medium transition-colors"
        >
          Sign In
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full mt-20 pt-12 border-t border-neutral-800/80 text-left">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 mt-0.5">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Instant Telemetry</h3>
            <p className="text-xs text-neutral-400 mt-1">Real-time performance metrics on every product variant.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 mt-0.5">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Secure Persistence</h3>
            <p className="text-xs text-neutral-400 mt-1">Encrypted orders and secure cloud-backed database storage.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">AI Intelligence</h3>
            <p className="text-xs text-neutral-400 mt-1">Advanced AI insights evaluating market benchmarks.</p>
          </div>
        </div>
      </div>
    </div>
  );
}