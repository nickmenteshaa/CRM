/**
 * Deduplicate Company records by name before adding the unique constraint.
 * Keeps the oldest record (earliest createdAt) and deletes duplicates.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find duplicate company names
  const dupes: { name: string; cnt: number }[] = await prisma.$queryRaw`
    SELECT name, COUNT(*)::int as cnt FROM "Company" GROUP BY name HAVING COUNT(*) > 1
  `;

  console.log(`Found ${dupes.length} duplicate company names`);

  if (dupes.length === 0) {
    console.log("No duplicates — safe to add unique constraint");
    await prisma.$disconnect();
    return;
  }

  let totalDeleted = 0;
  for (const { name, cnt } of dupes) {
    // Keep the first (oldest), delete the rest
    const records = await prisma.company.findMany({
      where: { name },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const toDelete = records.slice(1).map((r) => r.id);
    await prisma.company.deleteMany({ where: { id: { in: toDelete } } });
    totalDeleted += toDelete.length;
    console.log(`  "${name}": kept 1, deleted ${toDelete.length}`);
  }

  console.log(`\nTotal deleted: ${totalDeleted}`);
  const remaining = await prisma.company.count();
  console.log(`Companies remaining: ${remaining}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
