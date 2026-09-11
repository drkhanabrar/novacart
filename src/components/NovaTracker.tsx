"use client";

// FILE: src/components/NovaTracker.tsx
//
// Storefront side of the performance loop. Everything here is designed around
// one constraint: NOVA needs this data, but a customer must never pay for it in
// latency or in a broken page.
//
// So the queue is fire-and-forget, batched, flushed on a timer and on page
// hide via sendBeacon, and every failure is swallowed. If tracking breaks
// entirely the store keeps working and NOVA simply falls back to external
// market signals, which is exactly how it behaved before this existed.

import { useEffect, useRef } from "react";

type TrackableEvent =
  | "IMPRESSION"
  | "VIEW"
  | "ADD_TO_CART"
  | "REMOVE_FROM_CART"
  | "CHECKOUT_START";

interface QueuedEvent {
  productId: string;
  type: TrackableEvent;
  surface?: string;
  quantity?: number;
  valueInr?: number;
}

const ENDPOINT = "/api/nova/track";
const FLUSH_INTERVAL_MS = 4000;
const MAX_QUEUE = 20;

const ANON_KEY = "nova.anon";
const SESSION_KEY = "nova.session";

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/*
 * Impressions are deduplicated per product per page session.
 *
 * A card scrolling in and out of view repeatedly is one impression, not eight.
 * Without this the click-through rate would be diluted by scroll behaviour and
 * every downstream benchmark would be wrong.
 */
const seenImpressions = new Set<string>();

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/*
 * Pseudonymous identifiers.
 *
 * anonId distinguishes returning browsers so repeat interest can be told apart
 * from one person reloading; sessionId scopes a single visit. Neither is linked
 * to a user account, and both are stored client-side only, so a customer
 * clearing their browser storage genuinely resets them.
 */
function readId(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const created = randomId();
  storage.setItem(key, created);
  return created;
}

function identifiers(): { anonId: string | null; sessionId: string | null } {
  if (typeof window === "undefined") {
    return { anonId: null, sessionId: null };
  }

  try {
    return {
      anonId: readId(window.localStorage, ANON_KEY),
      sessionId: readId(window.sessionStorage, SESSION_KEY),
    };
  } catch {
    // Private browsing or blocked storage. Events still count, just anonymously.
    return { anonId: null, sessionId: null };
  }
}

function flush(useBeacon = false): void {
  if (typeof window === "undefined" || queue.length === 0) return;

  const events = queue;
  queue = [];

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const payload = JSON.stringify({ events, ...identifiers() });

  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Telemetry is best effort by design.
    });
  } catch {
    // Ignored deliberately.
  }
}

function bindLifecycleListeners(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;

  // visibilitychange is the reliable signal on mobile, where pagehide and
  // beforeunload often never fire at all.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });

  window.addEventListener("pagehide", () => flush(true));
}

export function trackEvent(
  productId: string,
  type: TrackableEvent,
  options: { surface?: string; quantity?: number; valueInr?: number } = {},
): void {
  if (typeof window === "undefined" || !productId) return;

  bindLifecycleListeners();

  queue.push({
    productId,
    type,
    surface: options.surface,
    quantity: options.quantity,
    valueInr: options.valueInr,
  });

  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }

  if (!timer) {
    timer = setTimeout(() => flush(), FLUSH_INTERVAL_MS);
  }
}

export function trackImpressionOnce(productId: string, surface: string): void {
  const key = `${surface}:${productId}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  trackEvent(productId, "IMPRESSION", { surface });
}

/*
 * Records an impression when a product card is genuinely on screen.
 *
 * "Rendered in the DOM" is not an impression — a card below the fold was never
 * seen, and counting it would understate click-through for every product the
 * customer actually looked at. The observer requires half the card visible for
 * a short dwell before it counts.
 */
export function TrackImpression({
  productId,
  surface = "listing",
  children,
}: {
  productId: string;
  surface?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    let dwell: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            dwell = setTimeout(() => {
              trackImpressionOnce(productId, surface);
              observer.disconnect();
            }, 600);
          } else if (dwell) {
            clearTimeout(dwell);
            dwell = null;
          }
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(element);

    return () => {
      if (dwell) clearTimeout(dwell);
      observer.disconnect();
    };
  }, [productId, surface]);

  return <div ref={ref}>{children}</div>;
}

/// Fires a single VIEW when a product detail page is opened.
export function TrackProductView({
  productId,
  surface = "product",
}: {
  productId: string;
  surface?: string;
}) {
  useEffect(() => {
    trackEvent(productId, "VIEW", { surface });
  }, [productId, surface]);

  return null;
}

/// Fires CHECKOUT_START for every line in the cart when checkout is reached.
export function TrackCheckoutStart({
  items,
}: {
  items: Array<{ id: string; quantity: number; price: number }>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || items.length === 0) return;
    fired.current = true;

    for (const item of items) {
      trackEvent(item.id, "CHECKOUT_START", {
        surface: "checkout",
        quantity: item.quantity,
        valueInr: item.price * item.quantity,
      });
    }
  }, [items]);

  return null;
}
