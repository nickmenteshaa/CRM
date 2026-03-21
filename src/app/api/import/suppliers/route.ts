import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type SupplierRecord = {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  website?: string;
  leadTimeDays?: number;
  moq?: number;
  rating?: number;
  notes?: string;
  isActive?: boolean;
};

export async function POST(request: NextRequest) {
  const t0 = performance.now();

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

  let records: SupplierRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Suppliers: received ${records.length} records`);

  const prisma = getDirectPrisma();
  const SUB_BATCH = 50;
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    for (let i = 0; i < records.length; i += SUB_BATCH) {
      const chunk = records.slice(i, i + SUB_BATCH);

      const result = await prisma.supplier.createMany({
        data: chunk.map((d) => ({
          name: d.name,
          contactName: d.contactName || undefined,
          email: d.email || undefined,
          phone: d.phone || undefined,
          country: d.country || undefined,
          website: d.website || undefined,
          leadTimeDays: d.leadTimeDays ?? undefined,
          moq: d.moq ?? undefined,
          rating: d.rating ?? undefined,
          notes: d.notes || undefined,
          isActive: d.isActive ?? true,
        })),
        skipDuplicates: true,
      });

      totalCreated += result.count;
      totalSkipped += chunk.length - result.count;
    }

    const elapsed = Math.round(performance.now() - t0);
    return NextResponse.json({ created: totalCreated, skipped: totalSkipped, timeMs: elapsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({ created: totalCreated, skipped: totalSkipped, error: msg }, { status: 500 });
  }
}
