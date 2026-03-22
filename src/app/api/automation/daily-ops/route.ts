import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Constants ──────────────────────────────────────────────────────────────────

const VALID_RUNS = ["morning", "mid-morning", "midday", "early-afternoon", "late-afternoon", "eod"] as const;
type RunSlot = typeof VALID_RUNS[number];

// 3 creation slots per day: morning, midday, late-afternoon
const CREATION_SLOTS: RunSlot[] = ["morning", "midday", "late-afternoon"];

// Order status flow
const STATUS_FLOW = ["New", "confirmed", "shipped", "delivered", "invoiced"];

// Deal pipeline stages
const STAGE_FLOW = [
  "New Opportunity",
  "Prospecting",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Closed Won",
] as const;

// Per-stage advance probability (conservative — gradual movement)
const STAGE_ADVANCE_CHANCE: Record<string, number> = {
  "New Opportunity": 0.30,
  "Prospecting":     0.25,
  "Qualified":       0.20,
  "Proposal":        0.15,
  "Negotiation":     0.12,
};

// ── Revenue-calibrated deal values ─────────────────────────────────────────────
// Target: $100M/year ≈ $275k/day ≈ $45k per run (6 runs)
// With ~30% win rate and avg deal ~$1,900:
//   need ~40 new deals/day → ~13 per creation slot (3 slots)
//
// Value tiers:
//   40% small  $300–$800   (avg $550)
//   40% medium $800–$2,500 (avg $1,650)
//   20% large  $2,500–$8,000 (avg $5,250)
//   Weighted avg ≈ $1,930

function generateDealValue(): number {
  const r = Math.random();
  if (r < 0.40)      return randInt(300, 800);    // small
  if (r < 0.80)      return randInt(800, 2500);   // medium
  return randInt(2500, 8000);                      // large
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Round-robin rep assignment — picks rep with fewest active deals
function pickLeastLoadedRep(
  reps: { id: string; name: string }[],
  dealCounts: Map<string, number>,
): { id: string; name: string } {
  let minCount = Infinity;
  let best = reps[0];
  // Shuffle first so ties are random
  const shuffled = [...reps].sort(() => Math.random() - 0.5);
  for (const rep of shuffled) {
    const count = dealCounts.get(rep.id) ?? 0;
    if (count < minCount) {
      minCount = count;
      best = rep;
    }
  }
  // Increment for next call within same batch
  dealCounts.set(best.id, (dealCounts.get(best.id) ?? 0) + 1);
  return best;
}

// ── Main handler ───────────────────────────────────────────────────────────────

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

  try {
    // ── 1. Progress order statuses (all runs) ──────────────────────────
    // Cap deliveries: only 2-5 orders move to "delivered" per run (10-30/day)
    const maxDeliveries = randInt(2, 5);
    let deliveredThisRun = 0;

    const progressCount = randInt(3, 6);
    const ordersToProgress = await prisma.deal.findMany({
      where: {
        orderNumber: { not: null },
        orderStatus: { in: ["New", "confirmed", "shipped", "delivered"] },
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

      // Enforce delivery cap
      if (nextStatus === "delivered") {
        if (deliveredThisRun >= maxDeliveries) continue;
        deliveredThisRun++;
      }

      await prisma.deal.update({
        where: { id: order.id },
        data: {
          orderStatus: nextStatus,
          ...(nextStatus === "invoiced" ? { won: true, stage: "Closed Won" } : {}),
        },
      });
      progressed++;
    }
    log.push(`Progressed ${progressed} orders (${deliveredThisRun} delivered, cap ${maxDeliveries})`);

    // ── 2. Progress deal pipeline stages (all runs) ────────────────────
    // Small batch per run — gradual, not mass-move
    const stageConsiderCount = randInt(8, 15);
    const dealsToConsider = await prisma.deal.findMany({
      where: {
        stage: { in: ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation"] },
        won: false,
        lost: false,
      },
      orderBy: { updatedAt: "asc" },
      take: stageConsiderCount,
    });

    let dealsProgressed = 0;
    for (const deal of dealsToConsider) {
      const chance = STAGE_ADVANCE_CHANCE[deal.stage] ?? 0;
      if (Math.random() > chance) continue;

      const currentIdx = STAGE_FLOW.indexOf(deal.stage as typeof STAGE_FLOW[number]);
      if (currentIdx < 0 || currentIdx >= STAGE_FLOW.length - 1) continue;

      const nextStage = STAGE_FLOW[currentIdx + 1];
      const isWon = nextStage === "Closed Won";

      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          stage: nextStage,
          ...(isWon ? { won: true } : {}),
        },
      });
      dealsProgressed++;
    }
    log.push(`Progressed ${dealsProgressed}/${dealsToConsider.length} deals to next pipeline stage`);

    // ── 3. Realistic deal churn (mid-morning + late-afternoon) ─────────
    if (["mid-morning", "late-afternoon"].includes(run)) {
      const lostCandidates = await prisma.deal.findMany({
        where: {
          stage: { in: ["Proposal", "Negotiation"] },
          won: false,
          lost: false,
        },
        take: 8,
      });
      let dealsLost = 0;
      for (const deal of lostCandidates) {
        if (Math.random() < 0.08) {
          await prisma.deal.update({
            where: { id: deal.id },
            data: { stage: "Closed Lost", lost: true },
          });
          dealsLost++;
        }
      }
      if (dealsLost > 0) log.push(`Marked ${dealsLost} deals as Closed Lost`);
    }

    // ── 4. Inventory adjustments (all runs) ────────────────────────────
    const adjustCount = randInt(2, 5);
    const inventoryItems = await prisma.inventory.findMany({
      where: { quantityOnHand: { gt: 0 } },
      take: adjustCount * 3,
    });

    let adjusted = 0;
    if (inventoryItems.length > 0) {
      const shuffled = inventoryItems.sort(() => Math.random() - 0.5).slice(0, adjustCount);
      for (const inv of shuffled) {
        const reduction = randInt(1, Math.min(5, inv.quantityOnHand));
        await prisma.inventory.update({
          where: { id: inv.id },
          data: { quantityOnHand: inv.quantityOnHand - reduction },
        });
        adjusted++;
      }
    }
    log.push(`Adjusted inventory for ${adjusted} items`);

    // ── 5. Create new deals (3 creation slots only) ────────────────────
    // 20-60 deals/day ÷ 3 slots = 7-20 per slot
    if (CREATION_SLOTS.includes(run)) {
      const newDealCount = randInt(7, 20);

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
        // Build rep workload map for balanced assignment
        const repLoadRaw = await prisma.deal.groupBy({
          by: ["ownerId"],
          where: {
            ownerId: { in: reps.map((r) => r.id) },
            won: false,
            lost: false,
          },
          _count: true,
        });
        const repLoads = new Map<string, number>();
        for (const r of repLoadRaw) {
          if (r.ownerId) repLoads.set(r.ownerId, r._count);
        }

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

        const deals = [];
        let batchValue = 0;
        for (let i = 0; i < newDealCount; i++) {
          const cust = pick(customers);
          const rep = pickLeastLoadedRep(reps, repLoads);
          const value = generateDealValue();
          batchValue += value;

          deals.push({
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

        await prisma.deal.createMany({ data: deals, skipDuplicates: true });
        log.push(`Created ${deals.length} deals (batch value: $${batchValue.toLocaleString()})`);
      } else {
        log.push("Skipped deal creation: no qualified customers or reps");
      }
    }

    // ── 6. Progress customer statuses (mid-morning + early-afternoon) ──
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

    // ── 7. Low stock check (EOD only) ──────────────────────────────────
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

      log.push(`Low stock items: ${lowStockItems.length}`);
    }

    // ── 8. EOD Summary ─────────────────────────────────────────────────
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

      summary = {
        totalOrders,
        totalCustomers,
        totalParts,
        totalInventory,
        ordersByStatus: ordersByStatus.map((g) => ({ status: g.orderStatus, count: g._count })),
        dealsByStage: dealsByStage.map((g) => ({ stage: g.stage, count: g._count })),
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
