import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

// Force Node.js runtime — never Edge
export const runtime = "nodejs";

// Increase body size limit for large batches and extend timeout
export const maxDuration = 60; // seconds (Vercel Pro allows up to 60)

type CustomerRecord = {
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  lastContact?: string;
  customerType?: string;
  companyName?: string;
  country?: string;
  preferredBrands?: string;
  taxId?: string;
  shippingAddress?: string;
  billingAddress?: string;
  paymentTerms?: string;
  customerNotes?: string;
};

export async function POST(request: NextRequest) {
  const t0 = performance.now();

  // ── Auth check: require valid session cookie ──
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionData: { role?: string };
  try {
    const decoded = decodeURIComponent(session.value);
    sessionData = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (sessionData.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // ── Parse body ──
  let records: CustomerRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[CUSTOMER-IMPORT-API] Received ${records.length} records`);

  // ── Write using direct (non-pooler) connection ──
  const prisma = getDirectPrisma();
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    // ── Resolve companyName → companyId (batch, no N+1) ──
    const companyNames = [...new Set(records.map((r) => r.companyName).filter(Boolean))] as string[];
    const companyMap = new Map<string, string>(); // lowercase name → id

    if (companyNames.length > 0) {
      const existing = await prisma.company.findMany({
        where: { name: { in: companyNames } },
        select: { id: true, name: true },
      });
      for (const c of existing) companyMap.set(c.name.toLowerCase(), c.id);

      const missing = companyNames.filter((n) => !companyMap.has(n.toLowerCase()));
      if (missing.length > 0) {
        await prisma.company.createMany({
          data: missing.map((name) => ({
            name, industry: "", revenue: "$0", status: "Active", isCustomer: true, contacts: 0,
          })),
          skipDuplicates: true,
        });
        const created = await prisma.company.findMany({
          where: { name: { in: missing } },
          select: { id: true, name: true },
        });
        for (const c of created) companyMap.set(c.name.toLowerCase(), c.id);
        console.log(`[CUSTOMER-IMPORT-API] Created ${created.length} new companies`);
      }
      console.log(`[CUSTOMER-IMPORT-API] Resolved ${companyMap.size} companies`);
    }

    // ── Single createMany for entire batch (direct connection, no pooler) ──
    const result = await prisma.lead.createMany({
      data: records.map((d) => ({
        name: d.name || "",
        email: d.email || "",
        phone: d.phone || "",
        status: d.status || "New",
        source: d.source || "Website",
        lastContact: d.lastContact || "Today",
        customerType: d.customerType || undefined,
        companyName: d.companyName || undefined,
        companyId: d.companyName ? companyMap.get(d.companyName.toLowerCase()) : undefined,
        country: d.country || undefined,
        preferredBrands: d.preferredBrands || undefined,
        taxId: d.taxId || undefined,
        shippingAddress: d.shippingAddress || undefined,
        billingAddress: d.billingAddress || undefined,
        paymentTerms: d.paymentTerms || undefined,
        customerNotes: d.customerNotes || undefined,
      })),
      skipDuplicates: true,
    });

    totalCreated = result.count;
    totalSkipped = records.length - result.count;
    console.log(`[CUSTOMER-IMPORT-API] Inserted ${result.count} rows in single batch`);

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[CUSTOMER-IMPORT-API] Complete: created=${totalCreated}, skipped=${totalSkipped}, time=${elapsed}ms`);

    auditLog({ action: "import.completed", entity: "Lead", details: { created: totalCreated, skipped: totalSkipped, timeMs: elapsed } });

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    console.error(`[CUSTOMER-IMPORT-API] DB error after created=${totalCreated}: ${msg}`);

    // Disconnect on error to clean up the direct connection
    try { await prisma.$disconnect(); } catch { /* ignore */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      error: msg,
    }, { status: 500 });
  }
}
