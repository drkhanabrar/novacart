'use client';

import { Cpu, TrendingUp, ShieldCheck } from "lucide-react";

interface AiInsightsCardProps {
  aiScore?: number | null;
  insights?: string | null;
}

export function AiInsightsCard({ aiScore, insights }: AiInsightsCardProps) {
  if (!aiScore) return null;

  return (
    <div className="bg-sage/5 border border-sage/20 rounded-2xl p-6 my-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-sage/15 rounded-xl text-sage">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-tag text-xs font-bold text-ink tracking-wider uppercase">NOVA Intelligence</h3>
            <p className="text-xs text-ink-soft">Live trend & demand evaluation</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sage/10 border border-sage/25 rounded-full">
          <TrendingUp className="w-3.5 h-3.5 text-sage" />
          <span className="font-tag text-xs font-bold text-sage">Score: {aiScore}</span>
        </div>
      </div>

      {insights && (
        <p className="text-sm text-ink-soft leading-relaxed border-t border-sage/15 pt-4">
          {insights}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4 text-xs text-ink-soft">
        <ShieldCheck className="w-4 h-4 text-sage" />
        <span>Benchmarked against live market and trend data.</span>
      </div>
    </div>
  );
}
