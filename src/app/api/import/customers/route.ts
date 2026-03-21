import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";

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
  const SUB_BATCH = 50;
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    for (let i = 0; i < records.length; i += SUB_BATCH) {
      const chunk = records.slice(i, i + SUB_BATCH);
      const batchNum = Math.floor(i / SUB_BATCH) + 1;

      console.log(`[CUSTOMER-IMPORT-API] Writing sub-batch ${batchNum} (${chunk.length} rows)`);

      const result = await prisma.lead.createMany({
        data: chunk.map((d) => ({
          name: d.name || "",
          email: d.email || "",
          phone: d.phone || "",
          status: d.status || "New",
          source: d.source || "Website",
          lastContact: d.lastContact || "Today",
          customerType: d.customerType || undefined,
          companyName: d.companyName || undefined,
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

      totalCreated += result.count;
      totalSkipped += chunk.length - result.count;

      console.log(`[CUSTOMER-IMPORT-API] Sub-batch ${batchNum} done: created=${result.count}, skipped=${chunk.length - result.count}`);
    }

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[CUSTOMER-IMPORT-API] Complete: created=${totalCreated}, skipped=${totalSkipped}, time=${elapsed}ms`);

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
