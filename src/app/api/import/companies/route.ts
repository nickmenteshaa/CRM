import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type CompanyRecord = {
  name: string;
  industry?: string;
  revenue?: string;
  status?: string;
  phone?: string;
  website?: string;
  country?: string;
  taxId?: string;
  paymentTerms?: string;
};

export async function POST(request: NextRequest) {
  const t0 = performance.now();

  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionData: { role?: string };
  try {
    sessionData = JSON.parse(decodeURIComponent(session.value));
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (sessionData.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let records: CompanyRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[COMPANY-IMPORT-API] Received ${records.length} records`);

  const prisma = getDirectPrisma();
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    // Single createMany for entire batch (direct connection, no pooler)
    const result = await prisma.company.createMany({
      data: records.map((d) => ({
        name: d.name,
        industry: d.industry || "",
        revenue: d.revenue || "$0",
        status: d.status || "Lead",
        phone: d.phone || undefined,
        website: d.website || undefined,
        country: d.country || undefined,
        taxId: d.taxId || undefined,
        paymentTerms: d.paymentTerms || undefined,
        isCustomer: true,
        contacts: 0,
      })),
      skipDuplicates: true,
    });

    totalCreated = result.count;
    totalSkipped = records.length - result.count;
    console.log(`[COMPANY-IMPORT-API] Inserted ${result.count} rows in single batch`);

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[COMPANY-IMPORT-API] Complete: created=${totalCreated}, skipped=${totalSkipped}, time=${elapsed}ms`);

    const sd = JSON.parse(decodeURIComponent(session.value));
    await auditLog({
      action: "import.companies",
      entity: "Company",
      userId: sd.id,
      userName: sd.name,
      details: { created: totalCreated, skipped: totalSkipped, total: records.length, timeMs: elapsed },
    });

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    console.error(`[COMPANY-IMPORT-API] Error: ${msg}`);
    try { await prisma.$disconnect(); } catch { /* ignore */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      error: msg,
    }, { status: 500 });
  }
}
