import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Accept EITHER resolved IDs OR raw orderNumber+sku for server-side resolution
type OrderItemRecord = {
  dealId?: string;
  partId?: string;
  orderNumber?: string;
  sku?: string;
  quantity: number;
  unitPrice?: string;
  discount?: string;
  lineTotal?: string;
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

  let records: OrderItemRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Order Items: received ${records.length} records`);

  const prisma = getDirectPrisma();

  try {
    // ── Build server-side lookup maps ──────────────────────────────────
    const [allOrders, allParts] = await Promise.all([
      prisma.deal.findMany({ select: { id: true, orderNumber: true } }),
      prisma.part.findMany({ select: { id: true, sku: true } }),
    ]);

    const orderMap = new Map<string, string>();
    for (const o of allOrders) {
      if (o.orderNumber) {
        orderMap.set(o.orderNumber.trim().toLowerCase(), o.id);
      }
    }

    const skuMap = new Map<string, string>();
    for (const p of allParts) {
      skuMap.set(p.sku.trim().toLowerCase(), p.id);
    }

    console.log(`[IMPORT-API] Lookup maps: ${orderMap.size} orders, ${skuMap.size} parts`);

    // ── Resolve and filter rows ───────────────────────────────────────
    type ValidRow = {
      dealId: string;
      partId: string;
      quantity: number;
      unitPrice: string | null;
      discount: string | null;
      lineTotal: string | null;
    };

    const validRows: ValidRow[] = [];
    let skippedNoOrder = 0;
    let skippedNoPart = 0;

    for (const d of records) {
      // Resolve dealId: prefer pre-resolved, fallback to orderNumber lookup
      let dealId = d.dealId;
      if (!dealId || dealId === "") {
        const orderNum = d.orderNumber?.trim().toLowerCase() ?? "";
        dealId = orderMap.get(orderNum) ?? "";
      }

      // Resolve partId: prefer pre-resolved, fallback to SKU lookup
      let partId = d.partId;
      if (!partId || partId === "") {
        const sku = d.sku?.trim().toLowerCase() ?? "";
        partId = skuMap.get(sku) ?? "";
      }

      if (!dealId) {
        skippedNoOrder++;
        continue;
      }
      if (!partId) {
        skippedNoPart++;
        continue;
      }

      validRows.push({
        dealId,
        partId,
        quantity: Number(d.quantity) || 1,
        unitPrice: d.unitPrice || null,
        discount: d.discount || null,
        lineTotal: d.lineTotal || null,
      });
    }

    console.log(`[IMPORT-API] Valid rows: ${validRows.length}, skipped (no order): ${skippedNoOrder}, skipped (no part): ${skippedNoPart}`);

    // ── Batch insert ──────────────────────────────────────────────────
    const insertResult = await prisma.orderLine.createMany({
      data: validRows,
      skipDuplicates: true,
    });

    const totalCreated = insertResult.count;
    console.log(`[IMPORT-API] Order Items: created=${totalCreated}`);

    const totalSkipped = records.length - totalCreated;
    const elapsed = Math.round(performance.now() - t0);

    try {
      const sd = JSON.parse(decodeURIComponent(session.value));
      await auditLog({
        action: "import.order_items",
        entity: "OrderLine",
        userId: sd.id,
        userName: sd.name,
        details: { created: totalCreated, skipped: totalSkipped, total: records.length },
      });
    } catch { /* audit best effort */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      skippedNoOrder,
      skippedNoPart,
      totalValid: validRows.length,
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
