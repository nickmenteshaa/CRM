"use server";

import { prisma } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────────

export type EmailRecord = {
  id: string;
  messageId: string | null;
  folder: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  cc: string | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  date: string; // ISO
  isRead: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  employeeId: string;
  leadId: string | null;
  companyId: string | null;
  dealId: string | null;
  createdAt: string;
};

function mapEmail(r: {
  id: string;
  messageId: string | null;
  folder: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  cc: string | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  employeeId: string;
  leadId: string | null;
  companyId: string | null;
  dealId: string | null;
  createdAt: Date;
}): EmailRecord {
  return {
    id: r.id,
    messageId: r.messageId,
    folder: r.folder,
    fromAddress: r.fromAddress,
    fromName: r.fromName,
    toAddress: r.toAddress,
    cc: r.cc,
    subject: r.subject,
    bodyText: r.bodyText,
    bodyHtml: r.bodyHtml,
    date: r.date.toISOString(),
    isRead: r.isRead,
    isStarred: r.isStarred,
    hasAttachment: r.hasAttachment,
    employeeId: r.employeeId,
    leadId: r.leadId,
    companyId: r.companyId,
    dealId: r.dealId,
    createdAt: r.createdAt.toISOString(),
  };
}

// ── Paginated list ──────────────────────────────────────────────────────────

export type EmailsPageResult = {
  emails: EmailRecord[];
  total: number;
  page: number;
  totalPages: number;
};

export async function dbGetEmails(opts: {
  employeeId: string;
  folder?: string;
  page?: number;
  limit?: number;
  query?: string;
}): Promise<EmailsPageResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { employeeId: opts.employeeId };
  if (opts.folder) where.folder = opts.folder;
  if (opts.query?.trim()) {
    const q = opts.query.trim();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { fromName: { contains: q, mode: "insensitive" } },
      { toAddress: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.email.count({ where }),
  ]);

  return {
    emails: rows.map(mapEmail),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ── Single email ────────────────────────────────────────────────────────────

export async function dbGetEmailById(id: string): Promise<EmailRecord | null> {
  const row = await prisma.email.findUnique({ where: { id } });
  return row ? mapEmail(row) : null;
}

// ── Mark read/unread ────────────────────────────────────────────────────────

export async function dbMarkEmailRead(id: string, isRead: boolean = true): Promise<void> {
  await prisma.email.update({ where: { id }, data: { isRead } });
}

// ── Toggle star ─────────────────────────────────────────────────────────────

export async function dbToggleEmailStar(id: string): Promise<boolean> {
  const email = await prisma.email.findUnique({ where: { id }, select: { isStarred: true } });
  if (!email) return false;
  const next = !email.isStarred;
  await prisma.email.update({ where: { id }, data: { isStarred: next } });
  return next;
}

// ── Link to CRM entity ─────────────────────────────────────────────────────

export async function dbLinkEmail(
  id: string,
  links: { leadId?: string | null; companyId?: string | null; dealId?: string | null },
): Promise<void> {
  await prisma.email.update({
    where: { id },
    data: {
      leadId: links.leadId !== undefined ? links.leadId : undefined,
      companyId: links.companyId !== undefined ? links.companyId : undefined,
      dealId: links.dealId !== undefined ? links.dealId : undefined,
    },
  });
}

// ── Save synced email (dedup by messageId) ──────────────────────────────────

export async function dbSaveEmail(data: {
  messageId: string;
  folder: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
  cc?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  date: Date;
  hasAttachment?: boolean;
  employeeId: string;
  isRead?: boolean;
}): Promise<{ created: boolean }> {
  // Check if already exists
  if (data.messageId) {
    const existing = await prisma.email.findUnique({ where: { messageId: data.messageId } });
    if (existing) return { created: false };
  }

  await prisma.email.create({
    data: {
      messageId: data.messageId || null,
      folder: data.folder,
      fromAddress: data.fromAddress,
      fromName: data.fromName || null,
      toAddress: data.toAddress,
      cc: data.cc || null,
      subject: data.subject,
      bodyText: data.bodyText || null,
      bodyHtml: data.bodyHtml || null,
      date: data.date,
      hasAttachment: data.hasAttachment ?? false,
      employeeId: data.employeeId,
      isRead: data.isRead ?? false,
    },
  });

  return { created: true };
}

// ── Bulk save (for sync) ────────────────────────────────────────────────────

export async function dbBulkSaveEmails(
  emails: Parameters<typeof dbSaveEmail>[0][],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  // Get existing messageIds in one query
  const messageIds = emails.map((e) => e.messageId).filter(Boolean) as string[];
  const existing = messageIds.length > 0
    ? new Set(
        (await prisma.email.findMany({
          where: { messageId: { in: messageIds } },
          select: { messageId: true },
        })).map((r) => r.messageId),
      )
    : new Set<string | null>();

  // Filter to new emails only
  const newEmails = emails.filter((e) => !e.messageId || !existing.has(e.messageId));

  if (newEmails.length > 0) {
    await prisma.email.createMany({
      data: newEmails.map((e) => ({
        messageId: e.messageId || null,
        folder: e.folder,
        fromAddress: e.fromAddress,
        fromName: e.fromName || null,
        toAddress: e.toAddress,
        cc: e.cc || null,
        subject: e.subject,
        bodyText: e.bodyText || null,
        bodyHtml: e.bodyHtml || null,
        date: e.date,
        hasAttachment: e.hasAttachment ?? false,
        employeeId: e.employeeId,
        isRead: e.isRead ?? false,
      })),
      skipDuplicates: true,
    });
    created = newEmails.length;
  }

  skipped = emails.length - created;
  return { created, skipped };
}

// ── Unread count ────────────────────────────────────────────────────────────

export async function dbGetUnreadCount(employeeId: string): Promise<number> {
  return prisma.email.count({
    where: { employeeId, folder: "INBOX", isRead: false },
  });
}

// ── Delete ──────────────────────────────────────────────────────────────────

export async function dbDeleteEmail(id: string): Promise<void> {
  await prisma.email.delete({ where: { id } });
}
