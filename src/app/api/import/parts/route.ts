import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

// Force Node.js runtime — never Edge
export const runtime = "nodejs";

// Increase body size limit for large batches and extend timeout
export const maxDuration = 60; // seconds (Vercel Pro allows up to 60)

type PartRecord = {
  sku: string;
  name: string;
  description?: string;
  oemNumber?: string;
  brand?: string;
  categoryId?: string | null;
  compatMake?: string;
  compatModel?: string;
  compatYearFrom?: string;
  compatYearTo?: string;
  weight?: string;
  dimensions?: string;
  imageUrl?: string;
  unitPrice?: string;
  costPrice?: string;
  isActive?: boolean;
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
  let records: PartRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Received ${records.length} records`);

  // ── Write using direct (non-pooler) connection ──
  const prisma = getDirectPrisma();
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    const result = await prisma.part.createMany({
      data: records.map((d) => ({
        sku: d.sku,
        name: d.name,
        description: d.description || undefined,
        oemNumber: d.oemNumber || undefined,
        brand: d.brand || undefined,
        categoryId: d.categoryId || undefined,
        compatMake: d.compatMake || undefined,
        compatModel: d.compatModel || undefined,
        compatYearFrom: d.compatYearFrom || undefined,
        compatYearTo: d.compatYearTo || undefined,
        weight: d.weight || undefined,
        dimensions: d.dimensions || undefined,
        imageUrl: d.imageUrl || undefined,
        unitPrice: d.unitPrice || undefined,
        costPrice: d.costPrice || undefined,
        isActive: d.isActive ?? true,
      })),
      skipDuplicates: true,
    });

    totalCreated = result.count;
    totalSkipped = records.length - result.count;

    const elapsed = Math.round(performance.now() - t0);
    console.log(`[IMPORT-API] Parts: created=${totalCreated}, skipped=${totalSkipped}, time=${elapsed}ms`);

    try {
      const sd = JSON.parse(decodeURIComponent(session.value));
      await auditLog({
        action: "import.parts",
        entity: "Part",
        userId: sd.id,
        userName: sd.name,
        details: { created: totalCreated, skipped: totalSkipped, total: records.length },
      });
    } catch { /* audit best effort */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    console.error(`[IMPORT-API] DB error after created=${totalCreated}: ${msg}`);

    // Disconnect on error to clean up the direct connection
    try { await prisma.$disconnect(); } catch { /* ignore */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      error: msg,
    }, { status: 500 });
  }
}
