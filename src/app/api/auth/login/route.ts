import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/actions-audit";

// ── In-memory login attempt tracker ─────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getAttemptKey(email: string, ip: string) {
  return `${email.toLowerCase()}|${ip}`;
}

function isBlocked(key: string): { blocked: boolean; remainingSeconds: number } {
  const entry = loginAttempts.get(key);
  if (!entry) return { blocked: false, remainingSeconds: 0 };
  if (entry.count >= MAX_ATTEMPTS && Date.now() < entry.blockedUntil) {
    return {
      blocked: true,
      remainingSeconds: Math.ceil((entry.blockedUntil - Date.now()) / 1000),
    };
  }
  if (Date.now() >= entry.blockedUntil) {
    loginAttempts.delete(key);
  }
  return { blocked: false, remainingSeconds: 0 };
}

function recordFailedAttempt(key: string) {
  const entry = loginAttempts.get(key) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
  loginAttempts.set(key, entry);
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Get client IP
    const ip = request.headers.get("x-real-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";

    const key = getAttemptKey(email, ip);

    // Check if blocked
    const blockStatus = isBlocked(key);
    if (blockStatus.blocked) {
      await auditLog({
        action: "auth.login_blocked",
        entity: "Employee",
        details: { email, ip, remainingSeconds: blockStatus.remainingSeconds },
      });
      return NextResponse.json(
        {
          error: `Too many failed attempts. Try again in ${Math.ceil(blockStatus.remainingSeconds / 60)} minutes.`,
          blocked: true,
          remainingSeconds: blockStatus.remainingSeconds,
        },
        { status: 429 },
      );
    }

    // Find employee
    const emp = await prisma.employee.findUnique({
      where: { email: email.toLowerCase() },
      include: { team: { select: { name: true } } },
    });

    if (!emp || emp.password !== password) {
      recordFailedAttempt(key);
      const entry = loginAttempts.get(key);
      const remaining = MAX_ATTEMPTS - (entry?.count ?? 0);

      await auditLog({
        action: "auth.login_failed",
        entity: "Employee",
        details: { email, ip, attemptsRemaining: remaining },
      });

      return NextResponse.json(
        {
          error: remaining > 0
            ? `Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
            : "Account locked for 15 minutes due to too many failed attempts.",
          attemptsRemaining: remaining,
        },
        { status: 401 },
      );
    }

    if (!emp.isActive) {
      await auditLog({
        action: "auth.login_inactive",
        entity: "Employee",
        entityId: emp.id,
        userName: emp.name,
        details: { email, ip },
      });
      return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
    }

    // Success — clear attempts
    clearAttempts(key);

    await auditLog({
      action: "auth.login_success",
      entity: "Employee",
      entityId: emp.id,
      userId: emp.id,
      userName: emp.name,
      details: { email, ip, role: emp.role },
    });

    const user = {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      managerId: emp.managerId,
      teamId: emp.teamId,
    };

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
