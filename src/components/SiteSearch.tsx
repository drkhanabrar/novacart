"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

export function SiteSearch({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(params.get("q") || "");
  }, [params]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    const next = new URLSearchParams();
    if (value) next.set("q", value);
    router.push(`/products${next.toString() ? `?${next}` : ""}`);
  }

  function clear() {
    setQuery("");
    if (pathname === "/products") router.push("/products");
    inputRef.current?.focus();
  }

  if (mobile) {
    return (
      <form onSubmit={submit} className="relative w-full">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input !mt-0 !rounded-2xl !bg-card !pl-11 !pr-10"
          placeholder="Search NovaCart"
          aria-label="Search products"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="relative hidden lg:block w-[260px] xl:w-[320px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-full border border-ink/10 bg-card/80 px-4 py-2.5 pl-10 pr-9 text-xs text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-poppy/40 focus:bg-card"
        placeholder="Search products"
        aria-label="Search products"
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-soft hover:text-ink"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
