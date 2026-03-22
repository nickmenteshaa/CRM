import { NextRequest, NextResponse } from "next/server";
import { getDirectPrisma } from "@/lib/db-direct";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type EmployeeRecord = {
  name: string;
  email: string;
  password?: string;
  role?: string;
  teamId?: string;
  region?: string;
  managerId?: string;
};

export async function POST(request: NextRequest) {
  const t0 = performance.now();

  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionData: { role?: string };
  try {
    const decoded = decodeURIComponent(session.value);
    sessionData = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (sessionData.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let records: EmployeeRecord[];
  try {
    const body = await request.json();
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log(`[IMPORT-API] Employees: received ${records.length} records`);

  const prisma = getDirectPrisma();
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    const result = await prisma.employee.createMany({
      data: records.map((d) => ({
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

    totalCreated = result.count;
    totalSkipped = records.length - result.count;
    console.log(`[IMPORT-API] Employees: created=${totalCreated}, skipped=${totalSkipped}`);

    const elapsed = Math.round(performance.now() - t0);
    return NextResponse.json({ created: totalCreated, skipped: totalSkipped, timeMs: elapsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    return NextResponse.json({ created: totalCreated, skipped: totalSkipped, error: msg }, { status: 500 });
  }
}
