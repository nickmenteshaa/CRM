import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type InventoryRecord = {
  partId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved?: number;
  reorderPoint?: number;
  binLocation?: string;
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

  let records: InventoryRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Inventory: received ${records.length} records`);

  const prisma = getDirectPrisma();
  const SUB_BATCH = 50;
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    for (let i = 0; i < records.length; i += SUB_BATCH) {
      const chunk = records.slice(i, i + SUB_BATCH);

      const result = await prisma.inventory.createMany({
        data: chunk.map((d) => ({
          partId: d.partId,
          warehouseId: d.warehouseId,
          quantityOnHand: d.quantityOnHand,
          quantityReserved: d.quantityReserved ?? 0,
          reorderPoint: d.reorderPoint ?? 0,
          binLocation: d.binLocation || undefined,
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
