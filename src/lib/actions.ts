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
  ownerId?: string | null; createdAt: Date; [k: string]: unknown;
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
  };
}

function mapTask(r: {
  id: string; title: string; leadName: string; due: string;
  priority: string; done: boolean; auto: boolean; ownerId?: string | null;
  [k: string]: unknown;
}): Task {
  return {
    id: r.id, title: r.title, leadName: r.leadName,
    due: r.due, priority: r.priority, done: r.done, auto: r.auto,
    ownerId: r.ownerId ?? undefined,
  };
}

function mapDeal(r: {
  id: string; name: string; contact: string; value: string; stage: string;
  close: string | null; leadId: string | null; leadName: string | null;
  owner: string | null; ownerId?: string | null; won: boolean; lost: boolean;
  createdAt: Date; updatedAt: Date; [k: string]: unknown;
}): Deal {
  return {
    id: r.id, name: r.name, contact: r.contact, value: r.value,
    stage: r.stage, close: r.close ?? "",
    leadId: r.leadId ?? undefined, leadName: r.leadName ?? undefined,
    owner: r.owner ?? undefined, ownerId: r.ownerId ?? undefined,
    won: r.won, lost: r.lost,
    createdDate: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
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
  id: string; leadId: string; dealId: string | null; channel: string;
  direction: string; subject: string | null; body: string;
  sender: string; recipient: string; date: string;
}): Message {
  return {
    id: r.id, leadId: r.leadId,
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
}): Company {
  return {
    id: r.id, name: r.name, industry: r.industry, contacts: r.contacts,
    revenue: r.revenue, status: r.status,
    website: r.website ?? undefined, phone: r.phone ?? undefined,
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
    },
  });
  return mapLead(row);
}

export async function dbDeleteLead(id: string): Promise<void> {
  await prisma.lead.delete({ where: { id } });
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
  const row = await prisma.deal.create({
    data: {
      name: data.name, contact: data.contact, value: data.value,
      stage: data.stage, close: data.close || null,
      leadId: data.leadId, leadName: data.leadName,
      owner: data.owner, ownerId: data.ownerId,
      won: data.won ?? false, lost: data.lost ?? false,
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
    },
  });
  return mapDeal(row);
}

export async function dbDeleteDeal(id: string): Promise<void> {
  await prisma.deal.delete({ where: { id } });
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
    })) }),
    prisma.task.createMany({ data: seed.tasks.map((t) => ({
      title: t.title, leadName: t.leadName, due: t.due,
      priority: t.priority, done: t.done, auto: t.auto, ownerId: t.ownerId,
    })) }),
    prisma.deal.createMany({ data: seed.deals.map((d) => ({
      name: d.name, contact: d.contact, value: d.value, stage: d.stage,
      close: d.close || null, leadName: d.leadName, owner: d.owner,
      ownerId: d.ownerId, won: d.won ?? false, lost: d.lost ?? false,
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
