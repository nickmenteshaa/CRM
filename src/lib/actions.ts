"use server";

import { prisma } from "@/lib/db";
import type { Lead, Task, Deal, Activity, Company, Message } from "@/context/AppContext";
import { aiSummarizeActivities, aiNextBestAction, aiSummarizeConversation, aiFollowUpDraft } from "@/lib/ai";

// ── Mappers: Prisma DateTime → ISO string for our app types ──────────────────

function mapLead(r: {
  id: string; name: string; email: string; phone: string; status: string;
  source: string; lastContact: string; lastContactAt: Date | null;
  summary: string | null; nextAction: string | null;
  convSummary?: string | null; followUpDraft?: string | null;
  ownerId?: string | null; createdAt: Date;
  carModel?: string | null; carYear?: string | null; carPrice?: string | null;
  carVin?: string | null; carCondition?: string | null;
  customerType?: string | null; taxId?: string | null;
  shippingAddress?: string | null; billingAddress?: string | null;
  paymentTerms?: string | null;
  companyName?: string | null; country?: string | null;
  preferredBrands?: string | null; customerNotes?: string | null;
  [k: string]: unknown;
}): Lead {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    status: r.status, source: r.source, lastContact: r.lastContact,
    lastContactAt: r.lastContactAt?.toISOString(),
    summary: r.summary ?? undefined,
    nextAction: r.nextAction ?? undefined,
    convSummary: r.convSummary ?? undefined,
    followUpDraft: r.followUpDraft ?? undefined,
    ownerId: r.ownerId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    carModel: r.carModel ?? undefined,
    carYear: r.carYear ?? undefined,
    carPrice: r.carPrice ?? undefined,
    carVin: r.carVin ?? undefined,
    carCondition: r.carCondition ?? undefined,
    customerType: r.customerType ?? undefined,
    taxId: r.taxId ?? undefined,
    shippingAddress: r.shippingAddress ?? undefined,
    billingAddress: r.billingAddress ?? undefined,
    paymentTerms: r.paymentTerms ?? undefined,
    companyName: r.companyName ?? undefined,
    country: r.country ?? undefined,
    preferredBrands: r.preferredBrands ?? undefined,
    customerNotes: r.customerNotes ?? undefined,
  };
}

function mapTask(r: {
  id: string; title: string; leadName: string; due: string;
  priority: string; done: boolean; auto: boolean; ownerId?: string | null;
  orderId?: string | null; supplierId?: string | null;
  [k: string]: unknown;
}): Task {
  return {
    id: r.id, title: r.title, leadName: r.leadName,
    due: r.due, priority: r.priority, done: r.done, auto: r.auto,
    ownerId: r.ownerId ?? undefined,
    orderId: r.orderId ?? undefined,
    supplierId: r.supplierId ?? undefined,
  };
}

function mapDeal(r: {
  id: string; name: string; contact: string; value: string; stage: string;
  close: string | null; leadId: string | null; leadName: string | null;
  owner: string | null; ownerId?: string | null; won: boolean; lost: boolean;
  createdAt: Date; updatedAt: Date;
  carModel?: string | null; carYear?: string | null; carPrice?: string | null;
  carVin?: string | null; carCondition?: string | null;
  orderNumber?: string | null; orderStatus?: string | null;
  shippingMethod?: string | null; shippingCost?: string | null;
  taxAmount?: string | null; subtotal?: string | null;
  grandTotal?: string | null; notes?: string | null;
  isQuote?: boolean; quoteNumber?: string | null;
  quoteStatus?: string | null; validUntil?: string | null;
  convertedToOrderId?: string | null;
  [k: string]: unknown;
}): Deal {
  return {
    id: r.id, name: r.name, contact: r.contact, value: r.value,
    stage: r.stage, close: r.close ?? "",
    leadId: r.leadId ?? undefined, leadName: r.leadName ?? undefined,
    owner: r.owner ?? undefined, ownerId: r.ownerId ?? undefined,
    won: r.won, lost: r.lost,
    createdDate: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    carModel: r.carModel ?? undefined,
    carYear: r.carYear ?? undefined,
    carPrice: r.carPrice ?? undefined,
    carVin: r.carVin ?? undefined,
    carCondition: r.carCondition ?? undefined,
    orderNumber: r.orderNumber ?? undefined,
    orderStatus: r.orderStatus ?? undefined,
    shippingMethod: r.shippingMethod ?? undefined,
    shippingCost: r.shippingCost ?? undefined,
    taxAmount: r.taxAmount ?? undefined,
    subtotal: r.subtotal ?? undefined,
    grandTotal: r.grandTotal ?? undefined,
    notes: r.notes ?? undefined,
    isQuote: r.isQuote ?? false,
    quoteNumber: r.quoteNumber ?? undefined,
    quoteStatus: r.quoteStatus ?? undefined,
    validUntil: r.validUntil ?? undefined,
    convertedToOrderId: r.convertedToOrderId ?? undefined,
  };
}

function mapActivity(r: {
  id: string; leadId: string; type: string; note: string; date: string;
  createdAt: Date;
}): Activity {
  return {
    id: r.id, leadId: r.leadId,
    type: r.type as Activity["type"],
    note: r.note, date: r.date,
    createdAt: r.createdAt.toISOString(),
  };
}

function mapMessage(r: {
  id: string; leadId: string | null; dealId: string | null; channel: string;
  direction: string; subject: string | null; body: string;
  sender: string; recipient: string; date: string;
}): Message {
  return {
    id: r.id, leadId: r.leadId ?? undefined,
    dealId: r.dealId ?? undefined,
    channel: r.channel as Message["channel"],
    direction: r.direction as Message["direction"],
    subject: r.subject ?? undefined,
    body: r.body, sender: r.sender, recipient: r.recipient,
    date: r.date,
  };
}

function mapCompany(r: {
  id: string; name: string; industry: string; contacts: number;
  revenue: string; status: string; website: string | null; phone: string | null;
  country?: string | null; taxId?: string | null; paymentTerms?: string | null;
  isSupplier?: boolean; isCustomer?: boolean;
  [k: string]: unknown;
}): Company {
  return {
    id: r.id, name: r.name, industry: r.industry, contacts: r.contacts,
    revenue: r.revenue, status: r.status,
    website: r.website ?? undefined, phone: r.phone ?? undefined,
    country: r.country ?? undefined, taxId: r.taxId ?? undefined,
    paymentTerms: r.paymentTerms ?? undefined,
    isSupplier: r.isSupplier ?? false,
    isCustomer: r.isCustomer ?? false,
  };
}

// ── READS ─────────────────────────────────────────────────────────────────────

export async function dbGetAll(): Promise<{
  leads: Lead[]; tasks: Task[]; deals: Deal[];
  activities: Activity[]; companies: Company[]; messages: Message[];
}> {
  const [leads, tasks, deals, activities, companies, messages] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.task.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.deal.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.company.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.message.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return {
    leads: leads.map(mapLead),
    tasks: tasks.map(mapTask),
    deals: deals.map(mapDeal),
    activities: activities.map(mapActivity),
    companies: companies.map(mapCompany),
    messages: messages.map(mapMessage),
  };
}

// ── PAGINATED LEADS (CUSTOMERS) QUERY ────────────────────────────────────────

export type LeadsPageResult = {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function dbGetLeadsPaginated(opts: {
  page?: number;
  limit?: number;
  query?: string;
  status?: string;
  customerType?: string;
  country?: string;
  source?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}): Promise<LeadsPageResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const skip = (page - 1) * limit;

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (opts.query?.trim()) {
    const q = opts.query.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { country: { contains: q, mode: "insensitive" } },
    ];
  }

  if (opts.status && opts.status !== "all") {
    where.status = opts.status;
  }

  if (opts.customerType && opts.customerType !== "all") {
    where.customerType = opts.customerType;
  }

  if (opts.country && opts.country !== "all") {
    where.country = opts.country;
  }

  if (opts.source && opts.source !== "all") {
    where.source = opts.source;
  }

  // Build orderBy
  const allowedSorts = ["name", "status", "source", "lastContact", "companyName", "country", "createdAt", "customerType"];
  const sortField = opts.sortKey && allowedSorts.includes(opts.sortKey) ? opts.sortKey : "createdAt";
  const sortDirection = opts.sortDir === "asc" ? "asc" : "desc";
  const orderBy = { [sortField]: sortDirection };

  const [rows, total] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.lead.findMany({ where: where as any, orderBy, skip, take: limit }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.lead.count({ where: where as any }),
  ]);

  return {
    leads: rows.map(mapLead),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/** Get filter options (distinct countries, sources, statuses, customer types) without loading all leads */
export async function dbGetLeadsFilterOptions(): Promise<{
  countries: string[];
  sources: string[];
  statuses: string[];
  customerTypes: string[];
}> {
  const [countryRows, sourceRows, statusRows, typeRows] = await Promise.all([
    prisma.lead.findMany({ where: { country: { not: null } }, select: { country: true }, distinct: ["country"] }),
    prisma.lead.findMany({ select: { source: true }, distinct: ["source"] }),
    prisma.lead.findMany({ select: { status: true }, distinct: ["status"] }),
    prisma.lead.findMany({ where: { customerType: { not: null } }, select: { customerType: true }, distinct: ["customerType"] }),
  ]);
  return {
    countries: countryRows.map((r) => r.country!).filter(Boolean).sort(),
    sources: sourceRows.map((r) => r.source).filter(Boolean).sort(),
    statuses: statusRows.map((r) => r.status).filter(Boolean).sort(),
    customerTypes: typeRows.map((r) => r.customerType!).filter(Boolean).sort(),
  };
}

// ── BULK CREATE LEADS (for import — mirrors dbBulkCreateParts) ───────────────

export async function dbBulkCreateLeads(
  records: Omit<Lead, "id">[],
): Promise<{ created: number; skipped: number; error?: string }> {
  const SUB_BATCH = 50;
  const MAX_RETRIES = 2;
  let totalCreated = 0;
  let totalSkipped = 0;

  console.log(`[IMPORT] dbBulkCreateLeads called with ${records.length} records`);

  for (let i = 0; i < records.length; i += SUB_BATCH) {
    const chunk = records.slice(i, i + SUB_BATCH);
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.lead.createMany({
          data: chunk.map((d) => ({
            name: d.name || "", email: d.email || "", phone: d.phone || "",
            status: d.status || "New", source: d.source || "Website",
            lastContact: d.lastContact || "Today",
            customerType: d.customerType || undefined,
            companyName: d.companyName || undefined,
            country: d.country || undefined,
            preferredBrands: d.preferredBrands || undefined,
            taxId: d.taxId || undefined,
            shippingAddress: d.shippingAddress || undefined,
            billingAddress: d.billingAddress || undefined,
            paymentTerms: d.paymentTerms || undefined,
            customerNotes: d.customerNotes || undefined,
            ownerId: d.ownerId || undefined,
          })),
          skipDuplicates: true,
        });
        totalCreated += result.count;
        totalSkipped += chunk.length - result.count;
        success = true;
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[IMPORT] Sub-batch retry ${attempt + 1} for rows ${i + 1}–${i + chunk.length}`);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[IMPORT] Sub-batch failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
          return { created: totalCreated, skipped: totalSkipped, error: msg };
        }
      }
    }

    if (!success) break;
  }

  return { created: totalCreated, skipped: totalSkipped };
}

// ── LEADS ────────────────────────────────────────────────────────────────────

export async function dbCreateLead(
  data: Omit<Lead, "id">,
  autoTask: Omit<Task, "id">
): Promise<{ lead: Lead; task: Task }> {
  const [lead, task] = await prisma.$transaction([
    prisma.lead.create({
      data: {
        name: data.name, email: data.email, phone: data.phone,
        status: data.status, source: data.source,
        lastContact: data.lastContact,
        lastContactAt: data.lastContactAt ? new Date(data.lastContactAt) : null,
        summary: data.summary, nextAction: data.nextAction,
        ownerId: data.ownerId,
        carModel: data.carModel, carYear: data.carYear, carPrice: data.carPrice,
        carVin: data.carVin, carCondition: data.carCondition,
        customerType: data.customerType, companyName: data.companyName,
        country: data.country, preferredBrands: data.preferredBrands,
        taxId: data.taxId, shippingAddress: data.shippingAddress,
        billingAddress: data.billingAddress, paymentTerms: data.paymentTerms,
        customerNotes: data.customerNotes,
      },
    }),
    prisma.task.create({
      data: {
        title: autoTask.title, leadName: autoTask.leadName,
        due: autoTask.due, priority: autoTask.priority,
        done: autoTask.done, auto: autoTask.auto,
        ownerId: data.ownerId,
      },
    }),
  ]);
  return { lead: mapLead(lead), task: mapTask(task) };
}

export async function dbUpdateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const row = await prisma.lead.update({
    where: { id },
    data: {
      ...(updates.name        !== undefined && { name: updates.name }),
      ...(updates.email       !== undefined && { email: updates.email }),
      ...(updates.phone       !== undefined && { phone: updates.phone }),
      ...(updates.status      !== undefined && { status: updates.status }),
      ...(updates.source      !== undefined && { source: updates.source }),
      ...(updates.lastContact !== undefined && { lastContact: updates.lastContact }),
      ...(updates.lastContactAt !== undefined && { lastContactAt: new Date(updates.lastContactAt) }),
      ...(updates.summary     !== undefined && { summary: updates.summary }),
      ...(updates.nextAction  !== undefined && { nextAction: updates.nextAction }),
      ...(updates.ownerId     !== undefined && { ownerId: updates.ownerId }),
      ...(updates.carModel    !== undefined && { carModel: updates.carModel }),
      ...(updates.carYear     !== undefined && { carYear: updates.carYear }),
      ...(updates.carPrice    !== undefined && { carPrice: updates.carPrice }),
      ...(updates.carVin      !== undefined && { carVin: updates.carVin }),
      ...(updates.carCondition !== undefined && { carCondition: updates.carCondition }),
      ...(updates.customerType !== undefined && { customerType: updates.customerType }),
      ...(updates.companyName  !== undefined && { companyName: updates.companyName }),
      ...(updates.country      !== undefined && { country: updates.country }),
      ...(updates.preferredBrands !== undefined && { preferredBrands: updates.preferredBrands }),
      ...(updates.taxId        !== undefined && { taxId: updates.taxId }),
      ...(updates.shippingAddress !== undefined && { shippingAddress: updates.shippingAddress }),
      ...(updates.billingAddress !== undefined && { billingAddress: updates.billingAddress }),
      ...(updates.paymentTerms !== undefined && { paymentTerms: updates.paymentTerms }),
      ...(updates.customerNotes !== undefined && { customerNotes: updates.customerNotes }),
    },
  });
  return mapLead(row);
}

export async function dbDeleteLead(id: string): Promise<void> {
  await prisma.lead.delete({ where: { id } });
}

export async function dbBulkDeleteLeads(ids: string[]): Promise<void> {
  await prisma.lead.deleteMany({ where: { id: { in: ids } } });
}

// ── TASKS ─────────────────────────────────────────────────────────────────────

export async function dbCreateTask(data: Omit<Task, "id">): Promise<Task> {
  const row = await prisma.task.create({
    data: {
      title: data.title, leadName: data.leadName,
      due: data.due, priority: data.priority,
      done: data.done, auto: data.auto,
      ownerId: data.ownerId,
    },
  });
  return mapTask(row);
}

export async function dbToggleTask(id: string, done: boolean): Promise<Task> {
  const row = await prisma.task.update({ where: { id }, data: { done } });
  return mapTask(row);
}

// ── DEALS ─────────────────────────────────────────────────────────────────────

export async function dbCreateDeal(data: Omit<Deal, "id">): Promise<Deal> {
  const isQuote = data.isQuote ?? false;

  // Auto-generate order number or quote number
  let orderNumber: string | undefined = undefined;
  let quoteNumber: string | undefined = undefined;

  if (isQuote) {
    const lastQ = await prisma.deal.findFirst({
      where: { quoteNumber: { not: null } },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true },
    });
    const nextQ = lastQ?.quoteNumber
      ? parseInt(lastQ.quoteNumber.replace("QUO-", "")) + 1
      : 1;
    quoteNumber = `QUO-${String(nextQ).padStart(4, "0")}`;
  } else {
    const last = await prisma.deal.findFirst({
      where: { orderNumber: { not: null } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const nextNum = last?.orderNumber
      ? parseInt(last.orderNumber.replace("ORD-", "")) + 1
      : 1;
    orderNumber = `ORD-${String(nextNum).padStart(4, "0")}`;
  }

  const row = await prisma.deal.create({
    data: {
      name: data.name, contact: data.contact, value: data.value,
      stage: data.stage, close: data.close || null,
      leadId: data.leadId, leadName: data.leadName,
      owner: data.owner, ownerId: data.ownerId,
      won: data.won ?? false, lost: data.lost ?? false,
      carModel: data.carModel, carYear: data.carYear, carPrice: data.carPrice,
      carVin: data.carVin, carCondition: data.carCondition,
      orderNumber: orderNumber ?? null,
      orderStatus: isQuote ? null : (data.orderStatus || "New"),
      shippingMethod: data.shippingMethod,
      shippingCost: data.shippingCost,
      taxAmount: data.taxAmount,
      subtotal: data.subtotal,
      grandTotal: data.grandTotal,
      notes: data.notes,
      isQuote,
      quoteNumber: quoteNumber ?? null,
      quoteStatus: isQuote ? (data.quoteStatus || "Draft") : null,
      validUntil: data.validUntil ?? null,
      convertedToOrderId: data.convertedToOrderId ?? null,
    },
  });
  return mapDeal(row);
}

export async function dbUpdateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
  const row = await prisma.deal.update({
    where: { id },
    data: {
      ...(updates.name     !== undefined && { name: updates.name }),
      ...(updates.contact  !== undefined && { contact: updates.contact }),
      ...(updates.value    !== undefined && { value: updates.value }),
      ...(updates.stage    !== undefined && { stage: updates.stage }),
      ...(updates.close    !== undefined && { close: updates.close || null }),
      ...(updates.owner    !== undefined && { owner: updates.owner }),
      ...(updates.ownerId  !== undefined && { ownerId: updates.ownerId }),
      ...(updates.won      !== undefined && { won: updates.won }),
      ...(updates.lost     !== undefined && { lost: updates.lost }),
      ...(updates.carModel !== undefined && { carModel: updates.carModel }),
      ...(updates.carYear  !== undefined && { carYear: updates.carYear }),
      ...(updates.carPrice !== undefined && { carPrice: updates.carPrice }),
      ...(updates.carVin   !== undefined && { carVin: updates.carVin }),
      ...(updates.carCondition !== undefined && { carCondition: updates.carCondition }),
      ...(updates.orderNumber !== undefined && { orderNumber: updates.orderNumber }),
      ...(updates.orderStatus !== undefined && { orderStatus: updates.orderStatus }),
      ...(updates.shippingMethod !== undefined && { shippingMethod: updates.shippingMethod }),
      ...(updates.shippingCost !== undefined && { shippingCost: updates.shippingCost }),
      ...(updates.taxAmount !== undefined && { taxAmount: updates.taxAmount }),
      ...(updates.subtotal !== undefined && { subtotal: updates.subtotal }),
      ...(updates.grandTotal !== undefined && { grandTotal: updates.grandTotal }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.isQuote !== undefined && { isQuote: updates.isQuote }),
      ...(updates.quoteNumber !== undefined && { quoteNumber: updates.quoteNumber }),
      ...(updates.quoteStatus !== undefined && { quoteStatus: updates.quoteStatus }),
      ...(updates.validUntil !== undefined && { validUntil: updates.validUntil }),
      ...(updates.convertedToOrderId !== undefined && { convertedToOrderId: updates.convertedToOrderId }),
    },
  });
  return mapDeal(row);
}

export async function dbDeleteDeal(id: string): Promise<void> {
  await prisma.deal.delete({ where: { id } });
}

/**
 * Bulk create deals/orders via createMany with sub-batching and retry logic.
 * orderNumber must be pre-assigned by the caller for each record.
 */
export async function dbBulkCreateDeals(
  records: Omit<Deal, "id">[],
): Promise<{ created: number; skipped: number; error?: string }> {
  const SUB_BATCH = 50;
  const MAX_RETRIES = 2;
  let totalCreated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < records.length; i += SUB_BATCH) {
    const chunk = records.slice(i, i + SUB_BATCH);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
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
            won: d.won ?? false,
            lost: d.lost ?? false,
            orderNumber: d.orderNumber || null,
            orderStatus: d.orderStatus || "New",
            shippingMethod: d.shippingMethod || null,
            shippingCost: d.shippingCost || null,
            taxAmount: d.taxAmount || null,
            subtotal: d.subtotal || null,
            grandTotal: d.grandTotal || null,
            notes: d.notes || null,
            isQuote: false,
          })),
          skipDuplicates: true,
        });
        totalCreated += result.count;
        totalSkipped += chunk.length - result.count;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "DB write failed";
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } else {
          return {
            created: totalCreated,
            skipped: totalSkipped,
            error: `Failed at rows ${i + 1}–${Math.min(i + SUB_BATCH, records.length)}: ${msg}`,
          };
        }
      }
    }
  }

  return { created: totalCreated, skipped: totalSkipped };
}

export async function dbReserveStockForOrder(
  dealId: string
): Promise<{ reserved: number; failed: number }> {
  const lines = await prisma.orderLine.findMany({ where: { dealId } });
  let reserved = 0;
  let failed = 0;

  for (const line of lines) {
    const inventoryRecords = await prisma.inventory.findMany({
      where: { partId: line.partId },
      orderBy: { quantityOnHand: "desc" },
    });
    let remaining = line.quantity;
    for (const inv of inventoryRecords) {
      if (remaining <= 0) break;
      const available = inv.quantityOnHand - inv.quantityReserved;
      if (available <= 0) continue;
      const toReserve = Math.min(remaining, available);
      await prisma.inventory.update({
        where: { id: inv.id },
        data: { quantityReserved: inv.quantityReserved + toReserve },
      });
      remaining -= toReserve;
    }
    if (remaining <= 0) reserved++;
    else failed++;
  }

  return { reserved, failed };
}

// ── ACTIVITIES ────────────────────────────────────────────────────────────────

export async function dbCreateActivity(
  data: Omit<Activity, "id">,
  leadUpdates: Partial<Lead>,
  followUpTask?: Omit<Task, "id">
): Promise<{ activity: Activity; task?: Task }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.activity.create({
      data: {
        leadId: data.leadId, type: data.type,
        note: data.note, date: data.date,
      },
    }),
    prisma.lead.update({
      where: { id: data.leadId },
      data: {
        status: leadUpdates.status,
        lastContact: leadUpdates.lastContact,
        lastContactAt: leadUpdates.lastContactAt ? new Date(leadUpdates.lastContactAt) : undefined,
        summary: leadUpdates.summary,
        nextAction: leadUpdates.nextAction,
      },
    }),
  ];

  if (followUpTask) {
    ops.push(
      prisma.task.create({
        data: {
          title: followUpTask.title, leadName: followUpTask.leadName,
          due: followUpTask.due, priority: followUpTask.priority,
          done: followUpTask.done, auto: followUpTask.auto,
          ownerId: followUpTask.ownerId,
        },
      })
    );
  }

  const results = await prisma.$transaction(ops);
  return {
    activity: mapActivity(results[0] as Awaited<ReturnType<typeof prisma.activity.create>>),
    task: followUpTask ? mapTask(results[2] as Awaited<ReturnType<typeof prisma.task.create>>) : undefined,
  };
}

// ── COMPANIES ─────────────────────────────────────────────────────────────────

export async function dbCreateCompany(data: Omit<Company, "id">): Promise<Company> {
  const row = await prisma.company.create({ data });
  return mapCompany(row);
}

export async function dbUpdateCompany(id: string, updates: Partial<Company>): Promise<Company> {
  const row = await prisma.company.update({ where: { id }, data: updates });
  return mapCompany(row);
}

export async function dbDeleteCompany(id: string): Promise<void> {
  await prisma.company.delete({ where: { id } });
}

export async function dbBulkDeleteCompanies(ids: string[]): Promise<void> {
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
}

// ── MESSAGES ─────────────────────────────────────────────────────────────────

export async function dbCreateMessage(data: Omit<Message, "id">): Promise<Message> {
  const row = await prisma.message.create({
    data: {
      leadId: data.leadId, dealId: data.dealId,
      channel: data.channel, direction: data.direction,
      subject: data.subject, body: data.body,
      sender: data.sender, recipient: data.recipient, date: data.date,
    },
  });
  return mapMessage(row);
}

export async function dbDeleteMessage(id: string): Promise<void> {
  await prisma.message.delete({ where: { id } });
}

// ── RESET: truncate all tables and re-seed ────────────────────────────────────

export async function dbReset(seed: {
  leads: Omit<Lead, "id">[]; tasks: Omit<Task, "id">[];
  deals: Omit<Deal, "id">[]; companies: Omit<Company, "id">[];
}): Promise<void> {
  await prisma.$transaction([
    // Spare-parts tables first (FK deps)
    prisma.orderLine.deleteMany(),
    prisma.supplierPart.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.warehouse.deleteMany(),
    prisma.part.deleteMany(),
    prisma.category.deleteMany(),
    prisma.supplier.deleteMany(),
    // Original tables
    prisma.message.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.task.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  await prisma.$transaction([
    prisma.lead.createMany({ data: seed.leads.map((l) => ({
      name: l.name, email: l.email, phone: l.phone, status: l.status,
      source: l.source, lastContact: l.lastContact,
      lastContactAt: l.lastContactAt ? new Date(l.lastContactAt) : null,
      summary: l.summary, nextAction: l.nextAction, ownerId: l.ownerId,
      carModel: l.carModel, carYear: l.carYear, carPrice: l.carPrice,
      carVin: l.carVin, carCondition: l.carCondition,
      customerType: l.customerType, companyName: l.companyName,
      country: l.country, preferredBrands: l.preferredBrands,
      taxId: l.taxId, shippingAddress: l.shippingAddress,
      billingAddress: l.billingAddress, paymentTerms: l.paymentTerms,
      customerNotes: l.customerNotes,
    })) }),
    prisma.task.createMany({ data: seed.tasks.map((t) => ({
      title: t.title, leadName: t.leadName, due: t.due,
      priority: t.priority, done: t.done, auto: t.auto, ownerId: t.ownerId,
    })) }),
    prisma.deal.createMany({ data: seed.deals.map((d) => ({
      name: d.name, contact: d.contact, value: d.value, stage: d.stage,
      close: d.close || null, leadName: d.leadName, owner: d.owner,
      ownerId: d.ownerId, won: d.won ?? false, lost: d.lost ?? false,
      carModel: d.carModel, carYear: d.carYear, carPrice: d.carPrice,
      carVin: d.carVin, carCondition: d.carCondition,
    })) }),
    prisma.company.createMany({ data: seed.companies.map((c) => ({
      name: c.name, industry: c.industry, contacts: c.contacts,
      revenue: c.revenue, status: c.status,
      website: c.website, phone: c.phone,
    })) }),
  ]);
}

// ── AI ACTIONS ───────────────────────────────────────────────────────────────

export async function dbAISummarize(
  leadId: string
): Promise<{ summary?: string; nextAction?: string } | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  const [activities, messages] = await Promise.all([
    prisma.activity.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const activityData = activities.map((a) => ({
    type: a.type, note: a.note, date: a.date,
  }));
  const messageData = messages.map((m) => ({
    channel: m.channel, direction: m.direction, subject: m.subject,
    body: m.body, sender: m.sender, date: m.date,
  }));

  const [summary, nextAction] = await Promise.all([
    aiSummarizeActivities(lead.name, lead.status, activityData, messageData),
    aiNextBestAction(lead.name, lead.status, activityData, undefined, messageData),
  ]);

  const updates: { summary?: string; nextAction?: string } = {};
  if (summary) updates.summary = summary;
  if (nextAction) updates.nextAction = nextAction;

  if (Object.keys(updates).length > 0) {
    await prisma.lead.update({ where: { id: leadId }, data: updates });
  }

  return updates;
}

export async function dbAIConversation(
  leadId: string,
  conversationText: string
): Promise<string | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  const convSummary = await aiSummarizeConversation(lead.name, conversationText);
  if (convSummary) {
    await prisma.lead.update({ where: { id: leadId }, data: { convSummary } });
  }
  return convSummary;
}

export async function dbAIFollowUp(
  leadId: string
): Promise<string | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  const [activities, messages] = await Promise.all([
    prisma.activity.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const activityData = activities.map((a) => ({
    type: a.type, note: a.note, date: a.date,
  }));
  const messageData = messages.map((m) => ({
    channel: m.channel, direction: m.direction, subject: m.subject,
    body: m.body, sender: m.sender, date: m.date,
  }));

  const followUpDraft = await aiFollowUpDraft(
    lead.name, lead.status, activityData, lead.summary ?? undefined, messageData
  );

  if (followUpDraft) {
    await prisma.lead.update({ where: { id: leadId }, data: { followUpDraft } });
  }
  return followUpDraft;
}
