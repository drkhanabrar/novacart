import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return <main className="mx-auto flex min-h-[68vh] max-w-xl items-center px-5 py-20 text-center"><div className="w-full"><span className="font-tag text-[64px] font-bold tracking-[-0.08em] text-poppy/20 sm:text-[96px]">404</span><span className="section-kicker mt-2 block">Nothing here</span><h1 className="mt-2 font-display text-4xl italic text-ink">That page has moved.</h1><p className="mt-3 text-sm leading-6 text-ink-soft">Try the collection or return to the NovaCart home page.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/products" className="premium-button"><Search className="h-4 w-4"/> Browse products</Link><Link href="/" className="rounded-full border border-ink/10 bg-card px-5 py-3 text-sm font-semibold text-ink"><ArrowLeft className="mr-2 inline h-4 w-4"/> Home</Link></div></div></main>;
}
