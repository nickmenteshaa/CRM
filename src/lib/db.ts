import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Prisma singleton ────────────────────────────────────────────────────────────
// In development, Next.js hot-reload creates new module instances which would
// exhaust connection limits if we created a new PrismaClient each time.
// We store the instance on globalThis to reuse it across reloads.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; __prismaSchemaVersion?: string };

// Bumped when schema changes so the dev-mode singleton is recreated.
// Increment this value after running `prisma generate` with new models.
const SCHEMA_VERSION = "8"; // bumped for Employee + EmployeeTeam models

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// In dev mode, invalidate cached client when schema version changes
if (process.env.NODE_ENV !== "production" && globalForPrisma.__prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.__prismaSchemaVersion = SCHEMA_VERSION;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
