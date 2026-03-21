"use server";

import { prisma } from "@/lib/db";

// ── Types (matching AuthContext interface) ───────────────────────────────────

export type EmployeeRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  teamId?: string;
  teamName?: string;
  region?: string;
  managerId?: string;
  isActive: boolean;
};

export type TeamRecord = {
  id: string;
  name: string;
};

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapEmployee(r: {
  id: string; name: string; email: string; role: string;
  teamId: string | null; region: string | null; managerId: string | null;
  isActive: boolean;
  team?: { name: string } | null;
  [k: string]: unknown;
}): EmployeeRecord {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    teamId: r.teamId ?? undefined,
    teamName: r.team?.name ?? undefined,
    region: r.region ?? undefined,
    managerId: r.managerId ?? undefined,
    isActive: r.isActive,
  };
}

function mapTeam(r: { id: string; name: string; [k: string]: unknown }): TeamRecord {
  return { id: r.id, name: r.name };
}

// ── READ ALL (for AuthContext — returns all employees without passwords) ─────

export async function dbGetAllEmployees(): Promise<EmployeeRecord[]> {
  const rows = await prisma.employee.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapEmployee);
}

export async function dbGetAllTeams(): Promise<TeamRecord[]> {
  const rows = await prisma.employeeTeam.findMany({ orderBy: { name: "asc" } });
  return rows.map(mapTeam);
}

// ── LOGIN ────────────────────────────────────────────────────────────────────

export async function dbLoginEmployee(
  email: string,
  password: string,
): Promise<EmployeeRecord | null> {
  const row = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
    include: { team: { select: { name: true } } },
  });
  if (!row || row.password !== password) return null;
  if (!row.isActive) return null;
  return mapEmployee(row);
}

// ── SINGLE CRUD ──────────────────────────────────────────────────────────────

export async function dbCreateEmployee(data: {
  name: string;
  email: string;
  password: string;
  role: string;
  teamId?: string;
  region?: string;
  managerId?: string;
}): Promise<{ ok: boolean; employee?: EmployeeRecord; error?: string }> {
  // Check duplicate email
  const existing = await prisma.employee.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return { ok: false, error: "Email already exists" };

  const row = await prisma.employee.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      password: data.password,
      role: data.role,
      teamId: data.teamId || null,
      region: data.region || null,
      managerId: data.managerId || null,
    },
    include: { team: { select: { name: true } } },
  });
  return { ok: true, employee: mapEmployee(row) };
}

export async function dbUpdateEmployee(
  id: string,
  updates: {
    name?: string;
    email?: string;
    role?: string;
    teamId?: string | null;
    region?: string | null;
    managerId?: string | null;
    isActive?: boolean;
  },
): Promise<{ ok: boolean; employee?: EmployeeRecord; error?: string }> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Employee not found" };

  // Check email uniqueness if changing email
  if (updates.email && updates.email.toLowerCase() !== existing.email) {
    const dup = await prisma.employee.findUnique({ where: { email: updates.email.toLowerCase() } });
    if (dup) return { ok: false, error: "Email already exists" };
  }

  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.email !== undefined) data.email = updates.email.toLowerCase();
  if (updates.role !== undefined) data.role = updates.role;
  if (updates.teamId !== undefined) data.teamId = updates.teamId ?? null;
  if (updates.region !== undefined) data.region = updates.region ?? null;
  if (updates.managerId !== undefined) data.managerId = updates.managerId ?? null;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;

  const row = await prisma.employee.update({
    where: { id },
    data: data as any,
    include: { team: { select: { name: true } } },
  });
  return { ok: true, employee: mapEmployee(row) };
}

export async function dbDeleteEmployee(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.employee.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete employee" };
  }
}

export async function dbChangePassword(
  id: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) return { ok: false, error: "Not found" };
  if (emp.password !== oldPassword) return { ok: false, error: "Current password is incorrect" };
  if (newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters" };
  await prisma.employee.update({ where: { id }, data: { password: newPassword } });
  return { ok: true };
}

// ── BULK IMPORT ──────────────────────────────────────────────────────────────

export async function dbBulkCreateEmployees(
  records: {
    name: string;
    email: string;
    password?: string;
    role?: string;
    teamId?: string;
    region?: string;
    managerId?: string;
  }[],
): Promise<{ created: number; skipped: number; error?: string }> {
  const SUB_BATCH = 50;
  const MAX_RETRIES = 2;
  let totalCreated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < records.length; i += SUB_BATCH) {
    const chunk = records.slice(i, i + SUB_BATCH);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.employee.createMany({
          data: chunk.map((d) => ({
            name: d.name,
            email: d.email.toLowerCase(),
            password: d.password || "changeme123",
            role: d.role || "sales_rep",
            teamId: d.teamId || null,
            region: d.region || null,
            managerId: d.managerId || null,
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

// ── PAGINATED QUERY ──────────────────────────────────────────────────────────

export type EmployeesPageResult = {
  employees: EmployeeRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function dbGetEmployeesPaginated(opts: {
  page?: number;
  limit?: number;
  query?: string;
  role?: string;
  teamId?: string;
  region?: string;
  isActive?: "all" | "active" | "inactive";
  sortKey?: string;
  sortDir?: "asc" | "desc";
}): Promise<EmployeesPageResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (opts.query?.trim()) {
    const q = opts.query.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { region: { contains: q, mode: "insensitive" } },
    ];
  }

  if (opts.role && opts.role !== "all") where.role = opts.role;
  if (opts.teamId && opts.teamId !== "all") where.teamId = opts.teamId;
  if (opts.region && opts.region !== "all") where.region = opts.region;

  if (opts.isActive === "active") where.isActive = true;
  else if (opts.isActive === "inactive") where.isActive = false;

  const allowedSorts = ["name", "email", "role", "region", "createdAt"];
  const sortField = opts.sortKey && allowedSorts.includes(opts.sortKey) ? opts.sortKey : "createdAt";
  const sortDirection = opts.sortDir === "asc" ? "asc" : "desc";
  const orderBy = { [sortField]: sortDirection };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where: where as any,
      include: { team: { select: { name: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.employee.count({ where: where as any }),
  ]);

  return {
    employees: rows.map(mapEmployee),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function dbGetEmployeesFilterOptions(): Promise<{
  teams: TeamRecord[];
  roles: string[];
  regions: string[];
}> {
  const [teams, roleRows, regionRows] = await Promise.all([
    prisma.employeeTeam.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({ select: { role: true }, distinct: ["role"] }),
    prisma.employee.findMany({ where: { region: { not: null } }, select: { region: true }, distinct: ["region"] }),
  ]);
  return {
    teams: teams.map(mapTeam),
    roles: roleRows.map((r) => r.role).sort(),
    regions: regionRows.map((r) => r.region!).sort(),
  };
}

// ── TEAM CRUD ────────────────────────────────────────────────────────────────

export async function dbCreateTeam(name: string): Promise<{ ok: boolean; team?: TeamRecord; error?: string }> {
  if (!name.trim()) return { ok: false, error: "Team name is required" };
  try {
    const row = await prisma.employeeTeam.create({ data: { name: name.trim() } });
    return { ok: true, team: mapTeam(row) };
  } catch {
    return { ok: false, error: "Team name already exists" };
  }
}

export async function dbUpdateTeam(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!name.trim()) return { ok: false, error: "Team name is required" };
  try {
    await prisma.employeeTeam.update({ where: { id }, data: { name: name.trim() } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update team" };
  }
}

export async function dbDeleteTeam(id: string): Promise<{ ok: boolean; error?: string }> {
  // Unassign employees from this team first
  await prisma.employee.updateMany({ where: { teamId: id }, data: { teamId: null } });
  await prisma.employeeTeam.delete({ where: { id } });
  return { ok: true };
}
