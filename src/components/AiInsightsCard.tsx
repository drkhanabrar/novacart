'use client';

import { Sparkles, BrainCircuit, ShieldCheck } from "lucide-react";

interface AiInsightsCardProps {
  aiScore?: number | null;
  insights?: string | null;
}

export function AiInsightsCard({ aiScore, insights }: AiInsightsCardProps) {
  if (!aiScore) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-950/40 via-neutral-900/60 to-neutral-950 border border-indigo-500/30 rounded-2xl p-6 backdrop-blur-md shadow-xl my-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wider uppercase">Nova Intelligence AI</h3>
            <p className="text-xs text-neutral-400">Real-time analytical evaluation</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-full">
          <BrainCircuit className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-indigo-300">Score: {aiScore}%</span>
        </div>
      </div>

      {insights && (
        <p className="text-sm text-neutral-300 leading-relaxed border-t border-neutral-800/80 pt-4">
          {insights}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4 text-xs text-neutral-500">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Verified performance benchmarked against global market telemetry.</span>
      </div>
    </div>
  );
}