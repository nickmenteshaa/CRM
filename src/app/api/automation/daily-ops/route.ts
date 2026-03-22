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
// Target: $50M/year ≈ $192k/business day at full capacity
// Gradual ramp-up from system start date:
//   Week 1: ~30% capacity (light activity, small orders only)
//   Week 2: ~55% capacity (slight increase, medium orders appear)
//   Week 3: ~80% capacity (near normal)
//   Week 4+: 100% capacity (full operations)
//
// START_DATE controls when the live timeline begins
const START_DATE = new Date("2026-03-23T05:00:00+04:00"); // Monday, Dubai time

/** How many business days since system start */
function businessDaysSinceStart(): number {
  const now = new Date();
  let days = 0;
  const d = new Date(START_DATE);
  while (d < now) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days++; // skip weekends
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Growth multiplier based on system age (0.3 → 1.0 over 4 weeks) */
function growthMultiplier(): number {
  const days = businessDaysSinceStart();
  if (days <= 0) return 0; // not started yet
  if (days <= 5) return 0.30;   // week 1: 30%
  if (days <= 10) return 0.55;  // week 2: 55%
  if (days <= 15) return 0.80;  // week 3: 80%
  return 1.0;                   // week 4+: full
}

/** Order value tiers — restricted in early weeks */
function generateOrderValue(growth: number): number {
  const r = Math.random();
  if (growth < 0.5) {
    // Week 1: small orders only ($300–$2k), rare medium ($2k–$3.5k)
    if (r < 0.85) return randInt(300, 2000);
    return randInt(2000, 3500);
  }
  if (growth < 0.8) {
    // Week 2-3: small + medium, occasional large
    if (r < 0.55) return randInt(300, 2000);
    if (r < 0.90) return randInt(2000, 8000);
    return randInt(8000, 15000);
  }
  // Full operations
  if (r < 0.50) return randInt(300, 2000);
  if (r < 0.85) return randInt(2000, 8000);
  return randInt(8000, 25000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

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
    case "morning":           return 1.2;
    case "mid-morning":       return 1.0;
    case "midday":            return 0.8;
    case "early-afternoon":   return 1.1;
    case "late-afternoon":    return 0.7;
    case "eod":               return 0.5;
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
  const growth = growthMultiplier();
  const mult = slotMultiplier(run) * growth;

  // Before start date → do nothing except inventory adjustments
  if (growth <= 0) {
    log.push("System not yet started (before START_DATE)");
    return NextResponse.json({ run, timestamp: new Date().toISOString(), log, timeMs: 0 });
  }

  log.push(`Growth: ${Math.round(growth * 100)}% | Slot: ${run} (×${mult.toFixed(2)})`);

  try {
    // ── 1. Progress order statuses (all runs) ──────────────────────────
    const maxDeliveries = Math.max(1, Math.round(randInt(2, 5) * growth));
    let deliveredThisRun = 0;

    const progressCount = Math.max(1, Math.round(randInt(3, 8) * mult));
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
    const stageCount = Math.max(1, Math.round(randInt(5, 12) * mult));
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
    const invCount = Math.max(1, Math.round(randInt(2, 6) * mult));
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
    // Week 1: 5-10/day (1-3/slot), Week 4+: 15-35/day (4-9/slot)
    if (CREATION_SLOTS.includes(run)) {
      const baseCount = growth < 0.5 ? randInt(1, 3) : randInt(4, 9);
      const newOrderCount = Math.max(1, Math.round(baseCount * slotMultiplier(run)));

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
          const value = generateOrderValue(growth);
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

    // ── 9. Employee chat generation (context-aware) ───────────────────
    if (growth > 0) {
      const allEmps = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
      });
      const admins = allEmps.filter((e) => e.role === "admin");
      const adminId = admins[0]?.id; // primary admin — auto-included in all chats
      const managers = allEmps.filter((e) => e.role === "manager" || e.role === "admin");
      const salesReps = allEmps.filter((e) => e.role === "sales_rep");

      // Message templates by context
      const salesMessages = [
        "Just closed the order, customer confirmed via email",
        "Following up with the distributor, they need updated pricing",
        "New inquiry came in, adding to pipeline",
        "Customer wants expedited shipping, checking with warehouse",
        "Quote sent, waiting for approval",
        "Good call with the buyer, they're interested in bulk order",
        "Need to check stock for this SKU before confirming",
        "Customer asked about payment terms, forwarding to accounts",
      ];
      const warehouseMessages = [
        "Stock checked, we have enough for this order",
        "Running low on a few items, flagging for reorder",
        "Shipment packed and ready for dispatch",
        "Delivery scheduled for tomorrow morning",
        "Received stock update from supplier",
        "Inventory count completed for section B",
      ];
      const managerMessages = [
        "Let's review the pipeline in today's standup",
        "Good progress team, keep pushing on the open quotes",
        "Prioritize the large distributor accounts this week",
        "Make sure all pending orders are confirmed by EOD",
        "Need status update on the delayed shipments",
        "Weekly target looking good, let's maintain the pace",
      ];

      const msgCount = Math.max(2, Math.round(randInt(5, 15) * mult));
      let msgsCreated = 0;

      // Create group chat if triggered by events (1-3/day, only on certain slots)
      const shouldCreateGroup = ["morning", "midday"].includes(run) && Math.random() < 0.4 * growth;
      if (shouldCreateGroup && progressed > 0 && managers.length > 0 && salesReps.length > 0) {
        // Pick a contextual group reason
        const groupTypes = [
          { name: `Weekly Sales Push ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, reason: "sales coordination" },
          { name: `Order Follow-up Batch`, reason: "order handling" },
          { name: `Stock Review ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, reason: "inventory check" },
        ];

        // Add event-specific groups
        if (deliveredThisRun > 2) {
          groupTypes.push({ name: `Delivery Batch Confirmation`, reason: "delivery update" });
        }

        const gt = pick(groupTypes);
        const groupMembers = [
          ...(adminId ? [adminId] : []), // admin always included
          pick(managers).id,
          ...salesReps.sort(() => Math.random() - 0.5).slice(0, randInt(2, 4)).map((r) => r.id),
        ];
        const uniqueMembers = [...new Set(groupMembers)];

        const conv = await prisma.chatConversation.create({
          data: {
            type: "group",
            name: gt.name,
            createdBy: uniqueMembers[0],
            members: JSON.stringify(uniqueMembers),
          },
        });

        // Seed 2-4 messages in the new group
        const groupMsgCount = randInt(2, 4);
        for (let i = 0; i < groupMsgCount; i++) {
          const sender = pick(allEmps.filter((e) => uniqueMembers.includes(e.id)));
          const msgs = sender.role === "manager" || sender.role === "admin" ? managerMessages : salesMessages;
          await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              senderId: sender.id,
              senderName: sender.name,
              senderRole: sender.role,
              body: pick(msgs),
            },
          });
          msgsCreated++;
        }
        log.push(`Chat: created group "${gt.name}" (${uniqueMembers.length} members, ${groupMsgCount} msgs)`);
      }

      // Private messages between reps and managers
      const privateMsgCount = Math.max(1, msgCount - msgsCreated);
      for (let i = 0; i < privateMsgCount; i++) {
        const sender = pick(allEmps);
        const receiver = pick(allEmps.filter((e) => e.id !== sender.id));
        if (!receiver) continue;

        // Find or create DM conversation
        const existingConvs = await prisma.chatConversation.findMany({
          where: { type: "direct" },
          select: { id: true, members: true },
          take: 50,
          orderBy: { updatedAt: "desc" },
        });

        let convId: string | undefined;
        for (const c of existingConvs) {
          try {
            const m = JSON.parse(c.members) as string[];
            if (m.includes(sender.id) && m.includes(receiver.id)) { convId = c.id; break; }
          } catch { /* skip */ }
        }

        if (!convId) {
          // Admin auto-included in all conversations
          const dmMembers = [...new Set([sender.id, receiver.id, ...(adminId ? [adminId] : [])])];
          const conv = await prisma.chatConversation.create({
            data: {
              type: "direct",
              createdBy: sender.id,
              members: JSON.stringify(dmMembers),
            },
          });
          convId = conv.id;
        }

        const msgs = sender.role === "manager" || sender.role === "admin"
          ? managerMessages
          : sender.role === "sales_rep"
            ? salesMessages
            : warehouseMessages;

        await prisma.chatMessage.create({
          data: {
            conversationId: convId,
            senderId: sender.id,
            senderName: sender.name,
            senderRole: sender.role,
            body: pick(msgs),
          },
        });
        msgsCreated++;
      }
      log.push(`Chat: ${msgsCreated} messages sent`);
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
