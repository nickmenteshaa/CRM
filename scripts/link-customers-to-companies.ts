/**
 * One-time data migration: link existing customers (Lead) to companies (Company)
 * by matching Lead.companyName to Company.name.
 *
 * - Creates missing companies for unmatched names
 * - Batch-updates Lead.companyId via raw SQL (fast)
 * - Updates Company.contacts count
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  const t0 = performance.now();

  // 1. Get all distinct companyName values from leads
  const distinctNames: { companyName: string }[] = await prisma.$queryRaw`
    SELECT DISTINCT "companyName" FROM "Lead"
    WHERE "companyName" IS NOT NULL AND "companyName" != '' AND "companyId" IS NULL
  `;
  console.log(`Found ${distinctNames.length} distinct company names on unlinked leads`);

  if (distinctNames.length === 0) {
    console.log("No leads to link — done");
    await prisma.$disconnect();
    return;
  }

  // 2. Load existing companies into map
  const existingCompanies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  const companyMap = new Map<string, string>(); // lowercase name → id
  for (const c of existingCompanies) {
    companyMap.set(c.name.toLowerCase(), c.id);
  }
  console.log(`Existing companies in DB: ${existingCompanies.length}`);

  // 3. Find names that need new company records
  const namesToCreate: string[] = [];
  for (const { companyName } of distinctNames) {
    if (!companyMap.has(companyName.toLowerCase())) {
      namesToCreate.push(companyName);
    }
  }
  console.log(`Need to create ${namesToCreate.length} new companies`);

  // 4. Batch-create missing companies
  if (namesToCreate.length > 0) {
    const BATCH = 100;
    let created = 0;
    for (let i = 0; i < namesToCreate.length; i += BATCH) {
      const chunk = namesToCreate.slice(i, i + BATCH);
      const result = await prisma.company.createMany({
        data: chunk.map((name) => ({
          name,
          industry: "",
          revenue: "$0",
          status: "Active",
          isCustomer: true,
          contacts: 0,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    console.log(`Created ${created} new companies`);

    // Rebuild map
    const allCompanies = await prisma.company.findMany({
      select: { id: true, name: true },
    });
    companyMap.clear();
    for (const c of allCompanies) {
      companyMap.set(c.name.toLowerCase(), c.id);
    }
  }

  // 5. Batch-update leads with companyId using raw SQL (fast, no N+1)
  let linked = 0;
  const entries = Array.from(companyMap.entries());
  const BATCH = 50;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    for (const [lowerName, companyId] of chunk) {
      // Use the original name from the map for exact match
      const result: { count: number }[] = await prisma.$queryRaw`
        UPDATE "Lead"
        SET "companyId" = ${companyId}, "updatedAt" = NOW()
        WHERE LOWER("companyName") = ${lowerName} AND "companyId" IS NULL
      `;
      // Raw UPDATE doesn't return count directly in all adapters, count via separate query
    }
    if ((i + BATCH) % 500 === 0 || i + BATCH >= entries.length) {
      console.log(`  Processed ${Math.min(i + BATCH, entries.length)}/${entries.length} companies`);
    }
  }

  // Count how many leads now have companyId set
  const linkedCount: { count: number }[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM "Lead" WHERE "companyId" IS NOT NULL
  `;
  linked = linkedCount[0]?.count ?? 0;
  console.log(`Total leads linked to companies: ${linked}`);

  // 6. Update Company.contacts count from actual lead counts
  await prisma.$queryRaw`
    UPDATE "Company" c
    SET contacts = (SELECT COUNT(*)::int FROM "Lead" l WHERE l."companyId" = c.id)
  `;
  console.log("Updated Company.contacts counts");

  const elapsed = Math.round(performance.now() - t0);
  console.log(`\nDone in ${elapsed}ms`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
