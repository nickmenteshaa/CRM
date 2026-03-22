"use server";

import { prisma } from "@/lib/db";

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  details?: string;
  createdAt: string;
};

/** Append an immutable audit log entry */
export async function auditLog(entry: {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        userId: entry.userId,
        userName: entry.userName,
        details: entry.details ? JSON.stringify(entry.details) : undefined,
      },
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write:", err);
  }
}

/** Get paginated audit log entries */
export async function getAuditLog(opts?: {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  userId?: string;
}): Promise<{ entries: AuditEntry[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (opts?.entity) where.entity = opts.entity;
  if (opts?.action) where.action = { contains: opts.action };
  if (opts?.userId) where.userId = opts.userId;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? undefined,
      userId: r.userId ?? undefined,
      userName: r.userName ?? undefined,
      details: r.details ?? undefined,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/** Get daily activity counts for charts */
export async function getAuditDailyCounts(days: number = 30): Promise<{ date: string; count: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw<{ date: string; count: number }[]>`
    SELECT DATE("createdAt")::text as date, COUNT(*)::int as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${since}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  return rows;
}

/** Get action summary counts */
export async function getAuditSummary(): Promise<{ action: string; count: number }[]> {
  const rows = await prisma.auditLog.groupBy({
    by: ["action"],
    _count: true,
    orderBy: { _count: { action: "desc" } },
    take: 20,
  });

  return rows.map((r) => ({ action: r.action, count: r._count }));
}
