"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-[65vh] max-w-xl items-center px-5 py-20 text-center"><div className="w-full"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-poppy/10 text-poppy"><AlertTriangle className="h-7 w-7"/></div><span className="section-kicker mt-7 inline-block">Something went wrong</span><h1 className="mt-2 font-display text-4xl italic text-ink">Let&apos;s try that again.</h1><p className="mt-3 text-sm leading-6 text-ink-soft">NovaCart hit an unexpected problem. Your account and order data have not been intentionally changed by this error.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><button onClick={reset} className="premium-button"><RefreshCcw className="h-4 w-4"/> Try again</button><Link href="/" className="rounded-full border border-ink/10 bg-card px-5 py-3 text-sm font-semibold text-ink">Back home</Link></div></div></main>;
}
