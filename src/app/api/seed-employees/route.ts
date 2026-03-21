import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/seed-employees — Seeds default employees + teams if none exist.
 * Safe to call multiple times (idempotent via skipDuplicates).
 */
export async function GET() {
  try {
    // Seed teams
    await prisma.employeeTeam.createMany({
      data: [
        { name: "Sales Team Alpha" },
        { name: "Sales Team Beta" },
      ],
      skipDuplicates: true,
    });

    const teamAlpha = await prisma.employeeTeam.findFirst({ where: { name: "Sales Team Alpha" } });

    // Seed employees
    const count = await prisma.employee.count();
    if (count === 0) {
      // Create admin first (no manager)
      const admin = await prisma.employee.create({
        data: {
          name: "Admin User",
          email: "admin@crm.com",
          password: "admin123",
          role: "admin",
        },
      });

      // Create manager
      const manager = await prisma.employee.create({
        data: {
          name: "Manager",
          email: "manager@crm.com",
          password: "manager123",
          role: "manager",
          teamId: teamAlpha?.id,
        },
      });

      // Create reps
      await prisma.employee.createMany({
        data: [
          {
            name: "Sales Rep",
            email: "sales@crm.com",
            password: "sales123",
            role: "sales_rep",
            managerId: manager.id,
            teamId: teamAlpha?.id,
          },
          {
            name: "Senior Rep",
            email: "senior@crm.com",
            password: "senior123",
            role: "senior_rep",
            managerId: manager.id,
            teamId: teamAlpha?.id,
          },
        ],
        skipDuplicates: true,
      });

      return NextResponse.json({
        seeded: true,
        adminId: admin.id,
        managerId: manager.id,
        message: "Default employees seeded successfully",
      });
    }

    return NextResponse.json({ seeded: false, message: `Already have ${count} employees`, count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
