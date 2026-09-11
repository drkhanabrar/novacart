"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="en"><body className="min-h-screen bg-[#fbf3e7] text-[#2a1f1a]"><main className="flex min-h-screen items-center justify-center px-5 text-center"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f1543f]">NovaCart</p><h1 className="mt-3 text-4xl font-semibold">We hit an unexpected problem.</h1><p className="mt-4 text-sm leading-6 opacity-70">Please try again. If the problem persists, return to NovaCart and continue browsing.</p><button onClick={() => reset()} className="mt-7 rounded-full bg-[#f1543f] px-6 py-3 text-sm font-semibold text-white">Try again</button></div></main></body></html>;
}
