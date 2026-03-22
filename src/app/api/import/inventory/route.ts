import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  let records: Record<string, unknown>[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── DEBUG: log first 5 rows exactly as received ──────────────────────
  console.log("[IMPORT-API] Inventory: received", records.length, "records");
  console.log("[IMPORT-API] ROW SAMPLE (first 5):", JSON.stringify(records.slice(0, 5), null, 2));

  const prisma = getDirectPrisma();
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalUnresolved = 0;

  try {
    // ── Pre-load SKU → partId map (both original + lowercase) ──────────
    const allParts = await prisma.part.findMany({ select: { id: true, sku: true } });
    const skuMap = new Map<string, string>();
    for (const p of allParts) {
      skuMap.set(p.sku, p.id);                // exact case
      skuMap.set(p.sku.toLowerCase(), p.id);   // lowercase
      skuMap.set(p.sku.trim(), p.id);          // trimmed
      skuMap.set(p.sku.trim().toLowerCase(), p.id); // trimmed + lowercase
    }
    console.log(`[IMPORT-API] Inventory: loaded ${allParts.length} parts → ${skuMap.size} SKU map entries`);
    // Show a few sample SKUs from DB
    const sampleSkus = allParts.slice(0, 5).map(p => p.sku);
    console.log("[IMPORT-API] Sample DB SKUs:", sampleSkus);

    // ── Pre-load warehouse name → warehouseId map ──────────────────────
    const allWarehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
    const whMap = new Map<string, string>();
    for (const w of allWarehouses) {
      whMap.set(w.name, w.id);
      whMap.set(w.name.toLowerCase(), w.id);
      whMap.set(w.name.trim().toLowerCase(), w.id);
    }
    console.log(`[IMPORT-API] Inventory: loaded ${allWarehouses.length} warehouses`);

    // ── Resolve foreign keys row by row ────────────────────────────────
    type ValidRow = {
      partId: string;
      warehouseId: string;
      quantityOnHand: number;
      quantityReserved: number;
      reorderPoint: number;
      binLocation?: string;
    };
    const validRows: ValidRow[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      // partId field contains the raw SKU string from buildRecord
      const rawSku = String(row.partId ?? "").trim();
      const partId = skuMap.get(rawSku) ?? skuMap.get(rawSku.toLowerCase());

      // Log first 5 resolution attempts
      if (i < 5) {
        console.log(`[IMPORT-API] Row ${i}: SKU FROM FILE="${rawSku}" → MAPPED partId=${partId ?? "NOT FOUND"}`);
      }

      if (!partId) {
        totalUnresolved++;
        continue; // skip — SKU not found in Parts table
      }

      // warehouseId field contains the raw warehouse name from buildRecord
      const rawWh = String(row.warehouseId ?? "").trim();
      let warehouseId = whMap.get(rawWh) ?? whMap.get(rawWh.toLowerCase());

      if (!warehouseId) {
        // Check if it's already a valid cuid (direct ID)
        const directMatch = allWarehouses.find(w => w.id === rawWh);
        if (directMatch) {
          warehouseId = directMatch.id;
        } else if (rawWh) {
          // Auto-create warehouse
          const newWh = await prisma.warehouse.create({ data: { name: rawWh } });
          whMap.set(newWh.name, newWh.id);
          whMap.set(newWh.name.toLowerCase(), newWh.id);
          warehouseId = newWh.id;
          console.log(`[IMPORT-API] Auto-created warehouse "${newWh.name}" → ${newWh.id}`);
        } else {
          totalUnresolved++;
          continue;
        }
      }

      validRows.push({
        partId,
        warehouseId,
        quantityOnHand: Number(row.quantityOnHand) || 0,
        quantityReserved: Number(row.quantityReserved) || 0,
        reorderPoint: Number(row.reorderPoint) || 0,
        binLocation: row.binLocation ? String(row.binLocation) : undefined,
      });
    }

    console.log(`[IMPORT-API] VALID ROWS: ${validRows.length}, UNRESOLVED: ${totalUnresolved}`);

    if (validRows.length === 0) {
      const elapsed = Math.round(performance.now() - t0);
      return NextResponse.json({
        created: 0,
        skipped: 0,
        unresolved: totalUnresolved,
        timeMs: elapsed,
        note: "No rows had matching SKUs in Parts table",
      });
    }

    // ── Batch insert ONLY valid rows (all have real partId) ─────────────
    const result = await prisma.inventory.createMany({
      data: validRows,
      skipDuplicates: true,
    });

    totalCreated = result.count;
    totalSkipped = validRows.length - result.count;
    console.log(`[IMPORT-API] Inventory: created=${totalCreated}, skipped=${totalSkipped}`);

    const elapsed = Math.round(performance.now() - t0);

    try {
      const sd = JSON.parse(decodeURIComponent(session.value));
      await auditLog({
        action: "import.inventory",
        entity: "Inventory",
        userId: sd.id,
        userName: sd.name,
        details: { created: totalCreated, skipped: totalSkipped, total: records.length },
      });
    } catch { /* audit best effort */ }

    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      unresolved: totalUnresolved,
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    console.error("[IMPORT-API] Inventory error:", msg);
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({
      created: totalCreated,
      skipped: totalSkipped,
      unresolved: totalUnresolved,
      error: msg,
    }, { status: 500 });
  }
}
