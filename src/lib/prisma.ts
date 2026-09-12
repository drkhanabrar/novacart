import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/*
 * Database client.
 *
 * Two faults in the previous version caused intermittent "something went wrong"
 * pages in production, on the storefront as well as the admin panel.
 *
 * 1. The singleton was cached ONLY outside production:
 *
 *        if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
 *
 *    That is advice written for a long-lived Node server, where the only reason
 *    to cache is to survive hot reloads in development. On serverless it is
 *    backwards. Every module evaluation built a brand new PrismaClient AND a new
 *    pg Pool, and nothing ever reused or closed them, so connections
 *    accumulated against Supabase until new ones were refused.
 *
 * 2. The pool had no size limit, so it defaulted to 10 connections PER
 *    INSTANCE. A handful of concurrent visitors, each landing on a different
 *    serverless instance, is enough to exhaust a free-tier Postgres allowance
 *    on its own.
 *
 * The failure this produced is the confusing kind: the first request errors, the
 * retry lands on a warm instance with a free connection and succeeds, so the
 * page "fixes itself" on refresh and looks like a glitch rather than a fault.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. The application cannot start without it.",
  );
}

/*
 * Pool size.
 *
 * Serverless wants a small number per instance, because concurrency comes from
 * many instances rather than many connections inside one. A long-running server
 * benefits from more. Two is a safe default against a pooled Supabase database;
 * raise it with NOVA_DB_POOL_MAX only if you move to a dedicated connection.
 */
const POOL_MAX = Number(process.env.NOVA_DB_POOL_MAX || 2);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

/*
 * Cached in every environment, production included.
 *
 * A serverless instance handles many requests over its lifetime. Reusing the
 * pool across them is the entire point: it is what stops each request opening
 * fresh connections to a database that has a hard limit on them.
 */
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    max: POOL_MAX,
    // Release idle connections reasonably quickly so an instance that goes quiet
    // hands them back rather than holding them until it is recycled.
    idleTimeoutMillis: 10_000,
    // Fail fast rather than hanging the page for 30 seconds on a bad connection.
    connectionTimeoutMillis: 10_000,
  });

// A pool error must never take the process down; log it and let the next query
// get a fresh connection.
pool.on("error", (error) => {
  console.error("[prisma] idle pool client error:", error.message);
});

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

globalForPrisma.pool = pool;
globalForPrisma.prisma = prisma;
