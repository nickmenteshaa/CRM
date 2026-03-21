import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Direct (non-pooler) Prisma client for bulk write operations.
 *
 * Neon's pooler (PgBouncer in transaction mode) drops connections on large
 * INSERT payloads. This client uses DIRECT_DATABASE_URL which bypasses the
 * pooler entirely, connecting straight to the Neon compute node.
 *
 * Usage: import this ONLY in API route handlers that need bulk writes.
 * Normal reads should continue using the pooled client from ./db.ts.
 */

function createDirectClient() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set");

  console.log("[DB-DIRECT] Creating direct Prisma client (non-pooler)");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: ["error"],
  });
}

// In production each request is a cold start so no singleton needed.
// In dev, cache on globalThis to avoid connection exhaustion.
const g = globalThis as unknown as { __prismaDirect?: PrismaClient };

export function getDirectPrisma(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    if (!g.__prismaDirect) g.__prismaDirect = createDirectClient();
    return g.__prismaDirect;
  }
  return createDirectClient();
}
