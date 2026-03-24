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
    await auditLog({
      action: `automation.${run}.skipped`,
      entity: "System",
      userName: "Automation",
      details: { run, reason: "Before START_DATE", growth: 0, timestamp: new Date().toISOString() },
    });
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

    // ── 9. Employee chat generation (context-aware, persistent groups) ─
    if (growth > 0) {
      let msgsCreated = 0;
      let groupsCreated = 0;

      // ── 9a. Fetch employees ────────────────────────────────────────────
      const allEmps = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
      });
      const adminId = allEmps.find((e) => e.role === "admin")?.id;
      const managers = allEmps.filter((e) => e.role === "manager" || e.role === "admin");
      const salesReps = allEmps.filter((e) => e.role === "sales_rep" || e.role === "senior_rep");
      const nonAdmins = allEmps.filter((e) => e.role !== "admin");

      // ── 9b. Ensure persistent team groups ──────────────────────────────
      // Sales Team: sales reps + senior reps + managers + admin
      // Operations Team: everyone (small company, everyone touches ops)
      const TEAM_GROUPS: { name: string; memberFilter: () => string[] }[] = [
        {
          name: "Sales Team",
          memberFilter: () => {
            const ids = allEmps
              .filter((e) => ["sales_rep", "senior_rep", "manager", "admin"].includes(e.role))
              .map((e) => e.id);
            if (adminId && !ids.includes(adminId)) ids.push(adminId);
            return [...new Set(ids)];
          },
        },
        {
          name: "Operations Team",
          memberFilter: () => {
            const ids = allEmps.map((e) => e.id);
            if (adminId && !ids.includes(adminId)) ids.push(adminId);
            return [...new Set(ids)];
          },
        },
      ];

      const teamConvs: Record<string, string> = {}; // name → conversationId

      for (const tg of TEAM_GROUPS) {
        // Find existing group by exact stable name
        const existing = await prisma.chatConversation.findFirst({
          where: { type: "group", name: tg.name },
          select: { id: true, members: true },
        });

        if (existing) {
          teamConvs[tg.name] = existing.id;
          // Sync members if new employees were added
          const currentMembers = JSON.parse(existing.members) as string[];
          const expected = tg.memberFilter();
          const merged = [...new Set([...currentMembers, ...expected])];
          if (merged.length > currentMembers.length) {
            await prisma.chatConversation.update({
              where: { id: existing.id },
              data: { members: JSON.stringify(merged) },
            });
          }
        } else {
          const members = tg.memberFilter();
          const conv = await prisma.chatConversation.create({
            data: {
              type: "group",
              name: tg.name,
              createdBy: adminId ?? members[0],
              members: JSON.stringify(members),
            },
          });
          teamConvs[tg.name] = conv.id;
          groupsCreated++;
        }
      }

      // ── 9c. Fetch context data for realistic messages ──────────────────
      const [ctxDeals, ctxOrders, ctxLowStock, ctxLeads] = await Promise.all([
        prisma.deal.findMany({
          where: { won: false, lost: false, stage: { not: "Closed Lost" } },
          take: 25,
          orderBy: { updatedAt: "desc" },
          select: { name: true, contact: true, value: true, stage: true, owner: true, ownerId: true },
        }),
        prisma.deal.findMany({
          where: { orderNumber: { not: null }, orderStatus: { in: ["New", "Confirmed", "Paid", "Shipped"] } },
          take: 15,
          orderBy: { updatedAt: "desc" },
          select: { name: true, contact: true, orderNumber: true, orderStatus: true, value: true, owner: true },
        }),
        prisma.inventory.findMany({
          where: { quantityOnHand: { lte: 15 } },
          include: { part: { select: { name: true, sku: true } } },
          take: 15,
          orderBy: { quantityOnHand: "asc" },
        }),
        prisma.lead.findMany({
          where: { status: { in: ["Active", "Qualified", "Contacted"] } },
          take: 20,
          orderBy: { updatedAt: "desc" },
          select: { name: true, status: true },
        }),
      ]);

      // ── 9d. Context-aware message builders ─────────────────────────────
      // Each builder returns a message string using real data, with fallback
      // to a sensible generic if no data is available

      function salesGroupMsg(): string {
        const templates: (() => string | null)[] = [
          // Deal progression
          () => {
            const d = pick(ctxDeals);
            if (!d) return null;
            return pick([
              `Moved ${d.name} to ${d.stage} — ${d.contact} is responsive, looking good`,
              `${d.contact} wants to close ${d.name} (${d.value}) by end of week`,
              `Pipeline update: ${d.name} at ${d.stage}, next step is sending revised proposal`,
              `Good call with ${d.contact} on ${d.name}, they're comparing options but we're the front-runner`,
            ]);
          },
          // Order updates
          () => {
            const o = pick(ctxOrders);
            if (!o) return null;
            return pick([
              `${o.orderNumber} for ${o.contact} is ${o.orderStatus} — following up on payment timeline`,
              `Just confirmed ${o.orderNumber} (${o.value}) with ${o.contact}, processing now`,
              `${o.contact} asked about shipping ETA for ${o.orderNumber}, checking with warehouse`,
              `Order ${o.orderNumber} ready to move to next stage, ${o.contact} approved the terms`,
            ]);
          },
          // Customer follow-up
          () => {
            const l = pick(ctxLeads);
            if (!l) return null;
            return pick([
              `Following up with ${l.name} — they were interested in bulk pricing`,
              `${l.name} requested a callback, scheduling for tomorrow morning`,
              `New inquiry from ${l.name}, adding to pipeline and sending intro email`,
              `${l.name} asked about payment terms, forwarding details to accounts`,
            ]);
          },
          // Discount / quote
          () => {
            const d = pick(ctxDeals);
            if (!d) return null;
            const pct = pick(["3%", "5%", "7%", "8%", "10%"]);
            return pick([
              `Can we offer ${pct} on ${d.name}? ${d.contact} is comparing with another supplier`,
              `${d.contact} is asking for ${pct} discount on ${d.name} (${d.value}) — thoughts?`,
              `Sent revised quote for ${d.name} to ${d.contact}, waiting for sign-off`,
            ]);
          },
        ];
        // Try templates until one produces a message
        const shuffled = templates.sort(() => Math.random() - 0.5);
        for (const fn of shuffled) {
          const msg = fn();
          if (msg) return msg;
        }
        return "Reviewing the pipeline, will update the team shortly";
      }

      function opsGroupMsg(): string {
        const templates: (() => string | null)[] = [
          // Low stock
          () => {
            const inv = pick(ctxLowStock);
            if (!inv?.part) return null;
            const threshold = inv.reorderPoint > 0 ? inv.reorderPoint : 5;
            return pick([
              `${inv.part.name} (${inv.part.sku}) down to ${inv.quantityOnHand} units — reorder point is ${threshold}`,
              `Flagging ${inv.part.sku}: only ${inv.quantityOnHand} left, need to restock ${inv.part.name}`,
              `Running low on ${inv.part.name}, ${inv.quantityOnHand} units remaining — placing supplier order`,
            ]);
          },
          // Stock availability
          () => {
            const inv = ctxLowStock.length > 0
              ? pick(ctxLowStock)
              : null;
            if (!inv?.part) return null;
            return pick([
              `Checked stock for ${inv.part.name}: ${inv.quantityOnHand} units available`,
              `Stock update on ${inv.part.sku} (${inv.part.name}) — current count is ${inv.quantityOnHand}`,
              `Inventory count done for ${inv.part.name}, marking ${inv.quantityOnHand} on hand`,
            ]);
          },
          // Shipment / logistics
          () => {
            const o = pick(ctxOrders);
            if (!o) return null;
            return pick([
              `Shipment for ${o.orderNumber} packed and ready for dispatch`,
              `${o.orderNumber} (${o.contact}) — labels printed, pickup scheduled for today`,
              `Delivery for ${o.orderNumber} dispatched, tracking shared with ${o.contact}`,
            ]);
          },
          // Supplier restock
          () => {
            const inv = pick(ctxLowStock);
            if (!inv?.part) return null;
            return pick([
              `Supplier confirmed restock of ${inv.part.name}, ETA 3-5 business days`,
              `Purchase order submitted for ${inv.part.sku}, expecting delivery next week`,
              `${inv.part.name} restock in transit — should arrive by Thursday`,
            ]);
          },
        ];
        const shuffled = templates.sort(() => Math.random() - 0.5);
        for (const fn of shuffled) {
          const msg = fn();
          if (msg) return msg;
        }
        return "Running through the warehouse checklist, updates coming shortly";
      }

      function crossTeamMsg(): { body: string; targetGroup: string } {
        // Sales → Ops or Ops → Sales
        if (Math.random() < 0.5) {
          const inv = pick(ctxLowStock);
          const d = pick(ctxDeals);
          if (inv?.part && d) {
            return {
              body: `Can someone check availability of ${inv.part.name} (${inv.part.sku})? Need it for ${d.contact}'s order`,
              targetGroup: "Operations Team",
            };
          }
        }
        const o = pick(ctxOrders);
        if (o) {
          return {
            body: `Stock confirmed for ${o.orderNumber} — all items packed and ready, ${o.contact} can expect dispatch today`,
            targetGroup: "Sales Team",
          };
        }
        return {
          body: "Checking pending items with the warehouse, will confirm availability shortly",
          targetGroup: Math.random() < 0.5 ? "Sales Team" : "Operations Team",
        };
      }

      function privateDmMsg(senderRole: string): string {
        if (senderRole === "manager" || senderRole === "admin") {
          const d = pick(ctxDeals);
          if (d) {
            return pick([
              `How's ${d.name} progressing? ${d.contact} seemed interested last week`,
              `Any update on ${d.name}? We need to close this one by end of quarter`,
              `Make sure ${d.name} (${d.value}) is confirmed by EOD`,
              `Let's prioritize ${d.contact}'s account this week — big potential`,
            ]);
          }
          return "Need a status update on your active deals — let's sync up today";
        }
        // sales_rep / senior_rep → manager
        const d = pick(ctxDeals);
        if (d) {
          const pct = pick(["5%", "7%", "8%", "10%"]);
          return pick([
            `Need approval on discount for ${d.contact} — they want ${pct} off on ${d.value}`,
            `${d.contact} is ready to sign on ${d.name}, just needs manager approval`,
            `Quick question on ${d.name} — client wants expedited shipping, okay to proceed?`,
            `${d.name} update: ${d.contact} confirmed interest, sending proposal now`,
          ]);
        }
        return "Working through my pipeline, will send end-of-day summary";
      }

      // ── 9e. Message volume by slot ─────────────────────────────────────
      const slotGroupCount: Record<RunSlot, [number, number]> = {
        "morning": [2, 3], "mid-morning": [1, 2], "midday": [1, 2],
        "early-afternoon": [2, 3], "late-afternoon": [1, 2], "eod": [1, 2],
      };
      const slotDmCount: Record<RunSlot, [number, number]> = {
        "morning": [1, 2], "mid-morning": [1, 2], "midday": [0, 1],
        "early-afternoon": [1, 2], "late-afternoon": [0, 1], "eod": [1, 2],
      };

      const [grpMin, grpMax] = slotGroupCount[run];
      const [dmMin, dmMax] = slotDmCount[run];
      const targetGroupMsgs = Math.max(1, Math.round(randInt(grpMin, grpMax) * growth));
      const targetDmMsgs = Math.round(randInt(dmMin, dmMax) * growth);

      // ── 9f. Generate group messages ────────────────────────────────────
      // Split between Sales, Ops, and occasional cross-team
      const usedBodies = new Set<string>(); // deduplicate within this run

      for (let i = 0; i < targetGroupMsgs; i++) {
        // 20% chance of cross-team message
        const isCross = i > 0 && Math.random() < 0.2;

        let convId: string;
        let body: string;
        let senderPool: typeof allEmps;

        if (isCross) {
          const ct = crossTeamMsg();
          body = ct.body;
          convId = teamConvs[ct.targetGroup] ?? teamConvs["Sales Team"];
          senderPool = ct.targetGroup === "Sales Team"
            ? allEmps.filter((e) => !["sales_rep", "senior_rep"].includes(e.role))
            : salesReps.length > 0 ? salesReps : nonAdmins;
        } else if (i % 2 === 0 && teamConvs["Sales Team"]) {
          body = salesGroupMsg();
          convId = teamConvs["Sales Team"];
          senderPool = salesReps.length > 0 ? [...salesReps, ...managers] : nonAdmins;
        } else {
          body = opsGroupMsg();
          convId = teamConvs["Operations Team"] ?? teamConvs["Sales Team"];
          senderPool = nonAdmins.length > 0 ? nonAdmins : allEmps;
        }

        // Skip duplicate messages within the same run
        if (usedBodies.has(body)) continue;
        usedBodies.add(body);

        const sender = pick(senderPool) ?? allEmps[0];
        if (!sender || !convId) continue;

        await prisma.chatMessage.create({
          data: {
            conversationId: convId,
            senderId: sender.id,
            senderName: sender.name,
            senderRole: sender.role,
            body,
          },
        });
        msgsCreated++;
      }

      // ── 9g. Generate private DM messages ───────────────────────────────
      // Find or create DM conversations with efficient lookup
      const existingDms = await prisma.chatConversation.findMany({
        where: { type: "direct" },
        select: { id: true, members: true },
        take: 100,
        orderBy: { updatedAt: "desc" },
      });

      for (let i = 0; i < targetDmMsgs; i++) {
        // Pick realistic sender → receiver pairs
        let sender: typeof allEmps[0];
        let receiver: typeof allEmps[0];

        const pairType = Math.random();
        if (pairType < 0.4 && managers.length > 0 && salesReps.length > 0) {
          // Manager → rep
          sender = pick(managers);
          receiver = pick(salesReps);
        } else if (pairType < 0.7 && salesReps.length > 0 && managers.length > 0) {
          // Rep → manager
          sender = pick(salesReps);
          receiver = pick(managers);
        } else if (nonAdmins.length >= 2) {
          // Rep → rep (cross-team)
          sender = pick(nonAdmins);
          receiver = pick(nonAdmins.filter((e) => e.id !== sender.id));
        } else {
          continue;
        }
        if (!sender || !receiver || sender.id === receiver.id) continue;

        // Find existing DM
        let convId: string | undefined;
        for (const c of existingDms) {
          try {
            const m = JSON.parse(c.members) as string[];
            if (m.includes(sender.id) && m.includes(receiver.id)) {
              convId = c.id;
              break;
            }
          } catch { /* skip */ }
        }

        if (!convId) {
          const dmMembers = [...new Set([sender.id, receiver.id, ...(adminId ? [adminId] : [])])];
          const conv = await prisma.chatConversation.create({
            data: {
              type: "direct",
              createdBy: sender.id,
              members: JSON.stringify(dmMembers),
            },
          });
          convId = conv.id;
          existingDms.push({ id: conv.id, members: JSON.stringify(dmMembers) });
        }

        const body = privateDmMsg(sender.role);
        if (usedBodies.has(body)) continue;
        usedBodies.add(body);

        await prisma.chatMessage.create({
          data: {
            conversationId: convId,
            senderId: sender.id,
            senderName: sender.name,
            senderRole: sender.role,
            body,
          },
        });
        msgsCreated++;
      }

      if (groupsCreated > 0) log.push(`Chat: created ${groupsCreated} team groups`);
      log.push(`Chat: ${msgsCreated} messages sent (${targetGroupMsgs} group + ${targetDmMsgs} DM target)`);
    }

    // ── Audit log: record this automation run with full metrics ────────
    const elapsed = Math.round(performance.now() - t0);

    await auditLog({
      action: `automation.${run}`,
      entity: "System",
      userName: "Automation",
      details: {
        run,
        success: true,
        growth: Math.round(growth * 100),
        slotMultiplier: slotMultiplier(run),
        timeMs: elapsed,
        timestamp: new Date().toISOString(),
        log,
      },
    });

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

    // Log failure to audit trail
    await auditLog({
      action: `automation.${run}.error`,
      entity: "System",
      userName: "Automation",
      details: {
        run,
        success: false,
        error: msg,
        growth: Math.round(growth * 100),
        timeMs: Math.round(performance.now() - t0),
        timestamp: new Date().toISOString(),
        logSoFar: log,
      },
    });

    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}
