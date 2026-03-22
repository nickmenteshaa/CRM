import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Schedule (Dubai time) ───────────────────────────────────────────────────────
// 6 runs/day: 09:00, 10:30, 12:00, 13:30, 15:30, 17:30
// Slots: morning, mid-morning, midday, early-afternoon, late-afternoon, eod

const VALID_RUNS = ["morning", "mid-morning", "midday", "early-afternoon", "late-afternoon", "eod"] as const;
type RunSlot = typeof VALID_RUNS[number];

// 4 creation slots: morning, mid-morning, midday, early-afternoon
// (late-afternoon + eod = wind-down, no new orders)
const CREATION_SLOTS: RunSlot[] = ["morning", "mid-morning", "midday", "early-afternoon"];

// Order status flow
const STATUS_FLOW = ["New", "Confirmed", "Paid", "Shipped", "Delivered"];

// Deal pipeline stages
const STAGE_FLOW = [
  "New Opportunity", "Prospecting", "Qualified",
  "Proposal", "Negotiation", "Closed Won",
] as const;

// Per-stage advance probability — tuned for 40-80 progressions/day across 6 runs
const STAGE_ADVANCE_CHANCE: Record<string, number> = {
  "New Opportunity": 0.40,
  "Prospecting":     0.35,
  "Qualified":       0.30,
  "Proposal":        0.22,
  "Negotiation":     0.18,
};

// ── Revenue model ───────────────────────────────────────────────────────────────
// Target: $50M/year ≈ $192k/business day (260 days) ≈ $32k per run (6 runs)
//
// Order value tiers (aligned with real spare-parts B2B):
//   50% small   $300–$2,000   (avg ~$1,150)
//   35% medium  $2,000–$8,000 (avg ~$5,000)
//   15% large   $8,000–$25,000 (avg ~$16,500)
//   Weighted avg ≈ $4,800
//
// With ~30% win rate: need ~15-35 new orders/day → 4-9 per creation slot (4 slots)
// Daily new order value: 25 orders × $4,800 avg = ~$120k pipeline added
// Daily closings: ~8 orders × $4,800 = ~$38k → annualized ~$10M closed
// But existing pipeline closings add: ~$150k/day → $39M additional
// Total annual ≈ $49-51M target range

function generateOrderValue(): number {
  const r = Math.random();
  if (r < 0.50) return randInt(300, 2000);     // small
  if (r < 0.85) return randInt(2000, 8000);    // medium
  return randInt(8000, 25000);                  // large
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Weighted rep pick — least-loaded gets priority but with randomness
function pickLeastLoadedRep(
  reps: { id: string; name: string }[],
  dealCounts: Map<string, number>,
): { id: string; name: string } {
  let minCount = Infinity;
  let best = reps[0];
  const shuffled = [...reps].sort(() => Math.random() - 0.5);
  for (const rep of shuffled) {
    const count = dealCounts.get(rep.id) ?? 0;
    if (count < minCount) { minCount = count; best = rep; }
  }
  dealCounts.set(best.id, (dealCounts.get(best.id) ?? 0) + 1);
  return best;
}

// Slot-based activity multiplier (some slots are busier)
function slotMultiplier(run: RunSlot): number {
  switch (run) {
    case "morning":           return 1.2;  // peak start
    case "mid-morning":       return 1.0;
    case "midday":            return 0.8;  // lunch slowdown
    case "early-afternoon":   return 1.1;
    case "late-afternoon":    return 0.7;  // winding down
    case "eod":               return 0.5;  // end of day
    default:                  return 1.0;
  }
}

// ── Main handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const t0 = performance.now();

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
  const mult = slotMultiplier(run);

  try {
    // ── 1. Progress order statuses (all runs) ──────────────────────────
    // ~5-10 orders progress per run, cap deliveries at 3-6/run (18-36/day)
    const maxDeliveries = randInt(3, 6);
    let deliveredThisRun = 0;

    const progressCount = Math.round(randInt(5, 10) * mult);
    const ordersToProgress = await prisma.deal.findMany({
      where: {
        orderNumber: { not: null },
        orderStatus: { in: ["New", "Confirmed", "Paid", "Shipped", "Delivered"] },
        isQuote: false,
      },
      take: progressCount,
      orderBy: { updatedAt: "asc" },
    });

    let progressed = 0;
    for (const order of ordersToProgress) {
      const currentIdx = STATUS_FLOW.indexOf(order.orderStatus ?? "New");
      if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) continue;

      const nextStatus = STATUS_FLOW[currentIdx + 1];

      if (nextStatus === "Delivered") {
        if (deliveredThisRun >= maxDeliveries) continue;
        deliveredThisRun++;
      }

      await prisma.deal.update({
        where: { id: order.id },
        data: {
          orderStatus: nextStatus,
          ...(nextStatus === "Delivered" ? { won: true, stage: "Closed Won" } : {}),
        },
      });
      progressed++;
    }
    log.push(`Orders: progressed ${progressed} (${deliveredThisRun} delivered, cap ${maxDeliveries})`);

    // ── 2. Progress deal pipeline stages (all runs) ────────────────────
    // 40-80 progressions/day ÷ 6 runs = 7-13 per run
    const stageCount = Math.round(randInt(7, 13) * mult);
    const dealsToConsider = await prisma.deal.findMany({
      where: {
        stage: { in: ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation"] },
        won: false, lost: false,
      },
      orderBy: { updatedAt: "asc" },
      take: stageCount,
    });

    let dealsProgressed = 0;
    for (const deal of dealsToConsider) {
      const chance = STAGE_ADVANCE_CHANCE[deal.stage] ?? 0;
      if (Math.random() > chance) continue;

      const currentIdx = STAGE_FLOW.indexOf(deal.stage as typeof STAGE_FLOW[number]);
      if (currentIdx < 0 || currentIdx >= STAGE_FLOW.length - 1) continue;

      const nextStage = STAGE_FLOW[currentIdx + 1];
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          stage: nextStage,
          ...(nextStage === "Closed Won" ? { won: true } : {}),
        },
      });
      dealsProgressed++;
    }
    log.push(`Pipeline: ${dealsProgressed}/${dealsToConsider.length} deals advanced`);

    // ── 3. Deal churn — realistic losses ────────────────────────────────
    // Only on mid-morning + late-afternoon (2x/day)
    if (["mid-morning", "late-afternoon"].includes(run)) {
      const lostCandidates = await prisma.deal.findMany({
        where: { stage: { in: ["Proposal", "Negotiation"] }, won: false, lost: false },
        take: 10,
      });
      let dealsLost = 0;
      for (const deal of lostCandidates) {
        if (Math.random() < 0.06) { // ~6% per candidate
          await prisma.deal.update({
            where: { id: deal.id },
            data: { stage: "Closed Lost", lost: true },
          });
          dealsLost++;
        }
      }
      if (dealsLost > 0) log.push(`Lost: ${dealsLost} deals marked Closed Lost`);
    }

    // ── 4. Inventory consumption (all runs) ─────────────────────────────
    // Simulate parts being used for orders — 3-8 items reduced per run
    const invCount = Math.round(randInt(3, 8) * mult);
    const invItems = await prisma.inventory.findMany({
      where: { quantityOnHand: { gt: 0 } },
      take: invCount * 3,
    });

    let adjusted = 0;
    if (invItems.length > 0) {
      const shuffled = invItems.sort(() => Math.random() - 0.5).slice(0, invCount);
      for (const inv of shuffled) {
        const reduction = randInt(1, Math.min(8, inv.quantityOnHand)); // never go negative
        await prisma.inventory.update({
          where: { id: inv.id },
          data: { quantityOnHand: inv.quantityOnHand - reduction },
        });
        adjusted++;
      }
    }
    log.push(`Inventory: ${adjusted} items reduced`);

    // ── 5. Create new orders (creation slots only) ──────────────────────
    // 15-35 orders/day ÷ 4 slots = 4-9 per slot
    if (CREATION_SLOTS.includes(run)) {
      const newOrderCount = Math.round(randInt(4, 9) * mult);

      // Get customers with Active/Qualified status
      const customers = await prisma.lead.findMany({
        where: { status: { in: ["Active", "Qualified", "Converted"] } },
        take: 100,
        select: { id: true, name: true, companyId: true },
      });
      const reps = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      if (customers.length > 0 && reps.length > 0) {
        // Build rep workload for balanced assignment
        const repLoadRaw = await prisma.deal.groupBy({
          by: ["ownerId"],
          where: { ownerId: { in: reps.map((r) => r.id) }, won: false, lost: false },
          _count: true,
        });
        const repLoads = new Map<string, number>();
        for (const r of repLoadRaw) {
          if (r.ownerId) repLoads.set(r.ownerId, r._count);
        }

        // Next order number
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
        let batchValue = 0;
        for (let i = 0; i < newOrderCount; i++) {
          const cust = pick(customers);
          const rep = pickLeastLoadedRep(reps, repLoads);
          const value = generateOrderValue();
          batchValue += value;

          orders.push({
            name: `Order ${cust.name.split(" ")[0]}-${nextNum + i}`,
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
        log.push(`New orders: ${orders.length} created ($${batchValue.toLocaleString()} value)`);
      } else {
        log.push("Skipped order creation: no eligible customers or reps");
      }
    }

    // ── 6. Customer status progression (mid-morning + early-afternoon) ──
    if (["mid-morning", "early-afternoon"].includes(run)) {
      const leadsToProgress = await prisma.lead.findMany({
        where: { status: { in: ["New", "Contacted"] } },
        take: Math.round(randInt(8, 18) * mult),
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
      log.push(`Customers: ${leadsMoved} status progressions`);
    }

    // ── 7. Low stock check (EOD only) ───────────────────────────────────
    let lowStockItems: { partName: string; qty: number; reorder: number }[] = [];
    if (run === "eod") {
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
      log.push(`Low stock: ${lowStockItems.length} items`);
    }

    // ── 8. EOD Summary ──────────────────────────────────────────────────
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

      const dealsByStage = await prisma.deal.groupBy({
        by: ["stage"],
        _count: true,
      });

      // Revenue calculation
      const wonDeals = await prisma.deal.findMany({
        where: { won: true },
        select: { value: true },
      });
      const totalRevenue = wonDeals.reduce((sum, d) => {
        return sum + (parseFloat(d.value?.replace(/[^0-9.]/g, "") || "0") || 0);
      }, 0);

      summary = {
        totalOrders,
        totalCustomers,
        totalParts,
        totalInventory,
        totalRevenue: `$${totalRevenue.toLocaleString()}`,
        ordersByStatus: ordersByStatus.map((g) => ({ status: g.orderStatus, count: g._count })),
        dealsByStage: dealsByStage.map((g) => ({ stage: g.stage, count: g._count })),
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 10),
      };

      log.push("EOD summary generated");
    }

    // ── Audit log: record this automation run ──────────────────────────
    await auditLog({
      action: `automation.${run}`,
      entity: "System",
      userName: "Automation",
      details: { run, log, timeMs: Math.round(performance.now() - t0) },
    });

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
