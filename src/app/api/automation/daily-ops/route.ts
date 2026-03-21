import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";

export const runtime = "nodejs";
export const maxDuration = 60;

// Valid run slots
const VALID_RUNS = ["morning", "mid-morning", "midday", "early-afternoon", "late-afternoon", "eod"] as const;
type RunSlot = typeof VALID_RUNS[number];

// Order status progression
const STATUS_FLOW = ["New", "confirmed", "shipped", "delivered", "invoiced"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export async function POST(request: NextRequest) {
  const t0 = performance.now();

  // Simple auth: require secret or session
  const authHeader = request.headers.get("x-automation-key");
  const expectedKey = process.env.AUTOMATION_SECRET || "crm-auto-2024";
  if (authHeader !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let run: RunSlot;
  try {
    const body = await request.json();
    run = body.run;
    if (!VALID_RUNS.includes(run)) {
      return NextResponse.json({ error: `Invalid run: ${run}. Valid: ${VALID_RUNS.join(", ")}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prisma = getDirectPrisma();
  const log: string[] = [];

  try {
    // ── 1. Progress existing orders (all runs) ────────────────────────
    const progressCount = randInt(3, 8);
    const ordersToProgress = await prisma.deal.findMany({
      where: {
        orderNumber: { not: null },
        orderStatus: { in: ["New", "confirmed", "shipped", "delivered"] },
        isQuote: false,
      },
      take: progressCount,
      orderBy: { updatedAt: "asc" }, // oldest first
    });

    let progressed = 0;
    for (const order of ordersToProgress) {
      const currentIdx = STATUS_FLOW.indexOf(order.orderStatus ?? "New");
      if (currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1) {
        const nextStatus = STATUS_FLOW[currentIdx + 1];
        await prisma.deal.update({
          where: { id: order.id },
          data: {
            orderStatus: nextStatus,
            // Mark as won when invoiced
            ...(nextStatus === "invoiced" ? { won: true, stage: "Closed Won" } : {}),
          },
        });
        progressed++;
      }
    }
    log.push(`Progressed ${progressed} orders to next status`);

    // ── 2. Small inventory adjustments (all runs) ─────────────────────
    const adjustCount = randInt(3, 7);
    const inventoryItems = await prisma.inventory.findMany({
      where: { quantityOnHand: { gt: 0 } },
      take: adjustCount * 3, // get more to randomly pick from
    });

    let adjusted = 0;
    if (inventoryItems.length > 0) {
      // Shuffle and take adjustCount
      const shuffled = inventoryItems.sort(() => Math.random() - 0.5).slice(0, adjustCount);
      for (const inv of shuffled) {
        // Simulate sales: reduce stock by 1-5 units
        const reduction = randInt(1, Math.min(5, inv.quantityOnHand));
        await prisma.inventory.update({
          where: { id: inv.id },
          data: { quantityOnHand: inv.quantityOnHand - reduction },
        });
        adjusted++;
      }
    }
    log.push(`Adjusted inventory for ${adjusted} items`);

    // ── 3. Create small order batch (morning + midday + late-afternoon) ─
    if (["morning", "midday", "late-afternoon"].includes(run)) {
      const newOrderCount = randInt(2, 4);
      const customers = await prisma.lead.findMany({
        where: { status: { in: ["Qualified", "Converted"] } },
        take: 50,
        select: { id: true, name: true },
      });
      const reps = await prisma.employee.findMany({
        where: { role: "sales_rep", isActive: true },
        select: { id: true, name: true },
      });

      if (customers.length > 0 && reps.length > 0) {
        // Get next order number
        const lastOrder = await prisma.deal.findFirst({
          where: { orderNumber: { not: null } },
          orderBy: { orderNumber: "desc" },
          select: { orderNumber: true },
        });
        let nextNum = 1;
        if (lastOrder?.orderNumber) {
          const match = lastOrder.orderNumber.match(/(\d+)$/);
          if (match) nextNum = parseInt(match[1], 10) + 1;
        }

        const orders = [];
        for (let i = 0; i < newOrderCount; i++) {
          const cust = pick(customers);
          const rep = pick(reps);
          const value = randInt(150, 5000);
          orders.push({
            name: `Auto Order ${cust.name.split(" ")[0]}`,
            contact: cust.name,
            value: `$${value.toLocaleString()}`,
            stage: "New Opportunity",
            leadId: cust.id,
            leadName: cust.name,
            ownerId: rep.id,
            owner: rep.name,
            orderNumber: `ORD-${String(nextNum + i).padStart(6, "0")}`,
            orderStatus: "New",
            isQuote: false,
            won: false,
            lost: false,
          });
        }

        await prisma.deal.createMany({ data: orders, skipDuplicates: true });
        log.push(`Created ${orders.length} new orders`);
      } else {
        log.push("Skipped order creation: no qualified customers or reps");
      }
    }

    // ── 4. Progress some customer statuses (mid-morning + early-afternoon) ─
    if (["mid-morning", "early-afternoon"].includes(run)) {
      const leadsToProgress = await prisma.lead.findMany({
        where: { status: { in: ["New", "Contacted"] } },
        take: randInt(5, 12),
        orderBy: { updatedAt: "asc" },
      });

      const statusUp: Record<string, string> = { New: "Contacted", Contacted: "Qualified" };
      let leadsMoved = 0;
      for (const lead of leadsToProgress) {
        const next = statusUp[lead.status];
        if (next) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: next, lastContact: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
          });
          leadsMoved++;
        }
      }
      log.push(`Progressed ${leadsMoved} customer statuses`);
    }

    // ── 5. Low stock check (EOD only) ─────────────────────────────────
    let lowStockItems: { partName: string; qty: number; reorder: number }[] = [];
    if (run === "eod") {
      const lowStock = await prisma.inventory.findMany({
        where: {
          quantityOnHand: { lte: prisma.inventory.fields.reorderPoint as unknown as number },
        },
        include: { part: { select: { name: true, sku: true } } },
        take: 50,
      });

      // Fallback: just query items with qty <= reorderPoint via raw
      const rawLow = await prisma.$queryRaw<{ name: string; sku: string; quantityOnHand: number; reorderPoint: number }[]>`
        SELECT p.name, p.sku, i."quantityOnHand", i."reorderPoint"
        FROM "Inventory" i
        JOIN "Part" p ON p.id = i."partId"
        WHERE i."quantityOnHand" <= i."reorderPoint" AND i."reorderPoint" > 0
        ORDER BY i."quantityOnHand" ASC
        LIMIT 50
      `;

      lowStockItems = rawLow.map((r) => ({
        partName: `${r.name} (${r.sku})`,
        qty: r.quantityOnHand,
        reorder: r.reorderPoint,
      }));

      log.push(`Low stock items: ${lowStockItems.length}`);
    }

    // ── 6. EOD Summary ────────────────────────────────────────────────
    let summary: Record<string, unknown> | null = null;
    if (run === "eod") {
      const [totalOrders, totalCustomers, totalParts, totalInventory] = await Promise.all([
        prisma.deal.count({ where: { isQuote: false } }),
        prisma.lead.count(),
        prisma.part.count(),
        prisma.inventory.count(),
      ]);

      const ordersByStatus = await prisma.deal.groupBy({
        by: ["orderStatus"],
        where: { isQuote: false, orderNumber: { not: null } },
        _count: true,
      });

      summary = {
        totalOrders,
        totalCustomers,
        totalParts,
        totalInventory,
        ordersByStatus: ordersByStatus.map((g) => ({ status: g.orderStatus, count: g._count })),
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 10),
      };

      log.push("Generated end-of-day summary");
    }

    const elapsed = Math.round(performance.now() - t0);

    return NextResponse.json({
      run,
      timestamp: new Date().toISOString(),
      log,
      ...(summary ? { summary } : {}),
      timeMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[AUTOMATION] ${run} failed:`, msg);
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}
