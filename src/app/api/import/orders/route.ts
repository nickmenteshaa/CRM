import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type OrderRecord = {
  name: string;
  contact: string;
  value: string;
  stage: string;
  close?: string;
  leadId?: string;
  leadName?: string;
  owner?: string;
  ownerId?: string;
  orderNumber?: string;
  orderStatus?: string;
  shippingMethod?: string;
  shippingCost?: string;
  taxAmount?: string;
  subtotal?: string;
  grandTotal?: string;
  notes?: string;
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

  let records: OrderRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Orders: received ${records.length} records`);

  const prisma = getDirectPrisma();
  const SUB_BATCH = 50;
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    for (let i = 0; i < records.length; i += SUB_BATCH) {
      const chunk = records.slice(i, i + SUB_BATCH);

      const result = await prisma.deal.createMany({
        data: chunk.map((d) => ({
          name: d.name,
          contact: d.contact,
          value: d.value,
          stage: d.stage,
          close: d.close || null,
          leadId: d.leadId || null,
          leadName: d.leadName || null,
          owner: d.owner || null,
          ownerId: d.ownerId || null,
          orderNumber: d.orderNumber || null,
          orderStatus: d.orderStatus || "New",
          shippingMethod: d.shippingMethod || null,
          shippingCost: d.shippingCost || null,
          taxAmount: d.taxAmount || null,
          subtotal: d.subtotal || null,
          grandTotal: d.grandTotal || null,
          notes: d.notes || null,
          isQuote: false,
          won: false,
          lost: false,
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
