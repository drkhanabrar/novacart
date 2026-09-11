// FILE: src/lib/services/telemetry.ts
//
// NOVA was designed to "watch the product" after publication, but the store
// recorded nothing except orders. Orders are a lagging, extremely sparse signal:
// a new catalogue can go weeks without one, which left the lifecycle engine
// guessing from external search trends alone.
//
// This module captures the cheap upstream signals — impressions, views,
// add-to-cart, checkout starts — that move long before revenue does.
//
// Cost discipline: raw events are pruned after a retention window once they have
// been rolled into ProductDailyMetric, so the row count stays inside a free
// Postgres tier indefinitely.

import { prisma } from "@/lib/prisma";
import {
  PRODUCT_EVENT_TYPES,
  type ProductEventType,
  utcDay,
  daysAgo,
} from "./nova-contracts";

/// Raw events older than this are deleted after being rolled up.
export const RAW_EVENT_RETENTION_DAYS = Number(
  process.env.NOVA_EVENT_RETENTION_DAYS || 45,
);

/// Hard ceiling on a single ingestion request, so a misbehaving or hostile
/// client cannot write unbounded rows.
export const MAX_EVENTS_PER_BATCH = 25;

export interface IncomingEvent {
  productId: string;
  type: string;
  surface?: string;
  quantity?: number;
  valueInr?: number;
  meta?: Record<string, unknown>;
}

export interface RecordContext {
  anonId?: string | null;
  sessionId?: string | null;
}

function isEventType(value: string): value is ProductEventType {
  return (PRODUCT_EVENT_TYPES as readonly string[]).includes(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitiseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

/*
 * Validates and persists a batch of behavioural events.
 *
 * Unknown product ids are dropped rather than throwing: telemetry must never be
 * able to break a page render or a checkout.
 */
export async function recordEvents(
  events: IncomingEvent[],
  context: RecordContext = {},
): Promise<{ accepted: number; rejected: number }> {
  if (!Array.isArray(events) || events.length === 0) {
    return { accepted: 0, rejected: 0 };
  }

  const batch = events.slice(0, MAX_EVENTS_PER_BATCH);
  const anonId = sanitiseId(context.anonId);
  const sessionId = sanitiseId(context.sessionId);

  const candidates = batch.filter(
    (event): event is IncomingEvent =>
      Boolean(event) &&
      typeof event.productId === "string" &&
      UUID_PATTERN.test(event.productId) &&
      typeof event.type === "string" &&
      isEventType(event.type),
  );

  if (candidates.length === 0) {
    return { accepted: 0, rejected: batch.length };
  }

  const uniqueProductIds = Array.from(
    new Set(candidates.map((event) => event.productId)),
  );

  const known = await prisma.product.findMany({
    where: { id: { in: uniqueProductIds } },
    select: { id: true },
  });

  const knownIds = new Set(known.map((product) => product.id));

  const rows = candidates
    .filter((event) => knownIds.has(event.productId))
    .map((event) => ({
      productId: event.productId,
      type: event.type,
      anonId,
      sessionId,
      surface:
        typeof event.surface === "string"
          ? event.surface.slice(0, 40)
          : null,
      quantity:
        Number.isFinite(event.quantity) && Number(event.quantity) > 0
          ? Math.min(999, Math.floor(Number(event.quantity)))
          : 1,
      valueInr:
        Number.isFinite(event.valueInr) && Number(event.valueInr) >= 0
          ? Number(event.valueInr)
          : null,
      meta: (event.meta ?? undefined) as never,
    }));

  if (rows.length === 0) {
    return { accepted: 0, rejected: batch.length };
  }

  await prisma.productEvent.createMany({ data: rows });

  return { accepted: rows.length, rejected: batch.length - rows.length };
}

/*
 * Server-side event recording for things the browser must not be trusted with.
 *
 * A PURCHASE event written from the client could be forged, which would poison
 * every downstream conversion rate and every model version trained on it.
 * Purchases and refunds are therefore only ever written from server actions.
 */
export async function recordServerEvent(
  productId: string,
  type: ProductEventType,
  options: {
    quantity?: number;
    valueInr?: number;
    meta?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await prisma.productEvent.create({
      data: {
        productId,
        type,
        surface: "server",
        quantity: options.quantity ?? 1,
        valueInr: options.valueInr ?? null,
        meta: (options.meta ?? undefined) as never,
      },
    });
  } catch (error) {
    // Telemetry failures must never surface to a paying customer.
    console.error("[telemetry] Failed to record server event:", error);
  }
}

export interface RollupResult {
  day: string;
  productsUpdated: number;
  eventsProcessed: number;
}

/*
 * Aggregates raw events for a single UTC day into ProductDailyMetric.
 *
 * Idempotent: re-running for the same day recomputes from source rather than
 * incrementing, so a retried cron job cannot double-count.
 */
export async function rollupDay(day: Date = daysAgo(0)): Promise<RollupResult> {
  const start = utcDay(day);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const grouped = await prisma.productEvent.groupBy({
    by: ["productId", "type"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
    _sum: { quantity: true, valueInr: true },
  });

  if (grouped.length === 0) {
    return { day: start.toISOString().slice(0, 10), productsUpdated: 0, eventsProcessed: 0 };
  }

  interface Accumulator {
    impressions: number;
    views: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    unitsSold: number;
    refunds: number;
    revenueInr: number;
  }

  const byProduct = new Map<string, Accumulator>();
  let eventsProcessed = 0;

  for (const row of grouped) {
    const current: Accumulator =
      byProduct.get(row.productId) ?? {
        impressions: 0,
        views: 0,
        addToCarts: 0,
        checkoutStarts: 0,
        purchases: 0,
        unitsSold: 0,
        refunds: 0,
        revenueInr: 0,
      };

    const count = row._count._all;
    const units = Number(row._sum.quantity ?? 0);
    const value = Number(row._sum.valueInr ?? 0);
    eventsProcessed += count;

    switch (row.type) {
      case "IMPRESSION":
        current.impressions += count;
        break;
      case "VIEW":
        current.views += count;
        break;
      case "ADD_TO_CART":
        current.addToCarts += count;
        break;
      case "CHECKOUT_START":
        current.checkoutStarts += count;
        break;
      case "PURCHASE":
        current.purchases += count;
        current.unitsSold += units;
        current.revenueInr += value;
        break;
      case "REFUND":
        current.refunds += count;
        break;
      default:
        break;
    }

    byProduct.set(row.productId, current);
  }

  for (const [productId, totals] of byProduct) {
    await prisma.productDailyMetric.upsert({
      where: { productId_date: { productId, date: start } },
      update: totals,
      create: { productId, date: start, ...totals },
    });
  }

  return {
    day: start.toISOString().slice(0, 10),
    productsUpdated: byProduct.size,
    eventsProcessed,
  };
}

/// Rolls up today and the preceding `days` days, then prunes expired raw events.
export async function rollupRecent(days = 2): Promise<{
  rollups: RollupResult[];
  pruned: number;
}> {
  const rollups: RollupResult[] = [];

  for (let offset = 0; offset <= days; offset += 1) {
    rollups.push(await rollupDay(daysAgo(offset)));
  }

  const pruned = await pruneRawEvents();

  return { rollups, pruned };
}

/// Deletes raw events that are already represented in the daily rollup.
export async function pruneRawEvents(): Promise<number> {
  const cutoff = daysAgo(RAW_EVENT_RETENTION_DAYS);

  const result = await prisma.productEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return result.count;
}
