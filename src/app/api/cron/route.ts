import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Dubai-time run schedule ──────────────────────────────────────────────────
// Maps Dubai local hours to automation run slots
const SCHEDULE: [number, number, RunSlot][] = [
  [9,  0,  "morning"],
  [10, 30, "mid-morning"],
  [12, 0,  "midday"],
  [13, 30, "early-afternoon"],
  [15, 30, "late-afternoon"],
  [17, 30, "eod"],
];

type RunSlot = "morning" | "mid-morning" | "midday" | "early-afternoon" | "late-afternoon" | "eod";

/** Get current Dubai time components */
function getDubaiNow(): { hour: number; minute: number; dow: number; iso: string } {
  const now = new Date();
  const dubai = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  return {
    hour: dubai.getHours(),
    minute: dubai.getMinutes(),
    dow: dubai.getDay(), // 0=Sun, 6=Sat
    iso: now.toISOString(),
  };
}

/** Find the matching run slot for the current Dubai time (±20 min window) */
function detectSlot(): RunSlot | null {
  const { hour, minute, dow } = getDubaiNow();
  if (dow === 0 || dow === 6) return null; // weekend

  const totalMin = hour * 60 + minute;

  for (const [h, m, slot] of SCHEDULE) {
    const slotMin = h * 60 + m;
    // ±20 min window around each slot
    if (totalMin >= slotMin - 5 && totalMin < slotMin + 20) {
      return slot;
    }
  }
  return null;
}

// ── Cron handler — called by Vercel Cron or manually ─────────────────────────
export async function GET(request: NextRequest) {
  // Auth: accept Vercel CRON_SECRET or AUTOMATION_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const autoKey = process.env.AUTOMATION_SECRET || "crm-auto-2024";
  const authHeader = request.headers.get("authorization");
  const autoHeader = request.headers.get("x-automation-key");

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAutoKey = autoHeader === autoKey;
  // Also allow manual trigger via query param (for initial testing)
  const forceSlot = request.nextUrl.searchParams.get("slot") as RunSlot | null;
  const forceKey = request.nextUrl.searchParams.get("key");
  const isForceAuth = forceKey === autoKey;

  if (!isVercelCron && !isAutoKey && !isForceAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dubai = getDubaiNow();
  const slot = forceSlot || detectSlot();

  if (!slot) {
    const reason = dubai.dow === 0 || dubai.dow === 6
      ? "Weekend — no automation runs"
      : `No matching slot at Dubai ${dubai.hour}:${String(dubai.minute).padStart(2, "0")}`;

    await auditLog({
      action: "cron.skipped",
      entity: "System",
      userName: "Cron",
      details: { reason, dubaiTime: `${dubai.hour}:${String(dubai.minute).padStart(2, "0")}`, utc: dubai.iso },
    });

    return NextResponse.json({ triggered: false, reason, dubaiTime: `${dubai.hour}:${String(dubai.minute).padStart(2, "0")}` });
  }

  // Call daily-ops via internal fetch
  const origin = request.nextUrl.origin;
  let result: Record<string, unknown>;
  let status = 200;

  try {
    const response = await fetch(`${origin}/api/automation/daily-ops`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-automation-key": autoKey,
      },
      body: JSON.stringify({ run: slot }),
    });

    status = response.status;
    result = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    await auditLog({
      action: "cron.error",
      entity: "System",
      userName: "Cron",
      details: { slot, error: msg, dubaiTime: `${dubai.hour}:${String(dubai.minute).padStart(2, "0")}` },
    });
    return NextResponse.json({ error: msg, slot }, { status: 500 });
  }

  // Log cron dispatch result
  await auditLog({
    action: "cron.dispatch",
    entity: "System",
    userName: "Cron",
    details: {
      slot,
      success: status === 200,
      httpStatus: status,
      dubaiTime: `${dubai.hour}:${String(dubai.minute).padStart(2, "0")}`,
      resultLog: (result as { log?: string[] }).log ?? [],
    },
  });

  return NextResponse.json({ triggered: true, slot, status, result });
}
