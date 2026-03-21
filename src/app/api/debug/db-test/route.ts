import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  // Admin-only
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  if (!session?.value) return NextResponse.json({ error: "no session" }, { status: 401 });
  let role = "";
  try {
    const decoded = decodeURIComponent(session.value);
    role = JSON.parse(decoded).role;
  } catch {
    // Legacy cookie format (just "1") — allow through for diagnostic purposes
    // but we can't verify admin, so block it
    return NextResponse.json({ error: "not admin (cookie format: " + session.value.substring(0, 20) + ")" }, { status: 403 });
  }
  if (role !== "admin") return NextResponse.json({ error: "not admin", cookieRole: role }, { status: 403 });

  const results: Record<string, string> = {};

  // Test 1: Read
  try {
    const count = await prisma.lead.count();
    results.read = `OK (${count} leads)`;
  } catch (err: any) {
    results.read = `FAIL: ${err.message}`;
  }

  // Test 2: Write (Lead)
  try {
    const lead = await prisma.lead.create({
      data: { name: "__db_test__", email: "dbtest@test.com", phone: "000", status: "New", source: "Test", lastContact: "Today" },
    });
    results.writeLead = `OK (id: ${lead.id})`;
    await prisma.lead.delete({ where: { id: lead.id } });
    results.deleteLead = "OK";
  } catch (err: any) {
    results.writeLead = `FAIL: ${err.message}`;
  }

  // Test 3: Write (Part createMany)
  try {
    const r = await prisma.part.createMany({
      data: [{ sku: "__dbtest_001__", name: "DB Test Part" }],
      skipDuplicates: true,
    });
    results.writePart = `OK (created: ${r.count})`;
    await prisma.part.deleteMany({ where: { sku: "__dbtest_001__" } });
    results.deletePart = "OK";
  } catch (err: any) {
    results.writePart = `FAIL: ${err.message}`;
  }

  // Test 4: env vars
  results.hasDbUrl = process.env.DATABASE_URL ? `YES (${process.env.DATABASE_URL.substring(0, 50)}...)` : "NO";
  results.hasDirectUrl = process.env.DIRECT_DATABASE_URL ? "YES" : "NO";
  results.nodeEnv = process.env.NODE_ENV ?? "undefined";

  console.log("[DB-TEST]", JSON.stringify(results, null, 2));

  return NextResponse.json(results);
}
