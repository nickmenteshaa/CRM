import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/actions-audit";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("crm_session");

    if (session?.value) {
      try {
        const decoded = decodeURIComponent(session.value);
        const user = JSON.parse(decoded);
        const ip = request.headers.get("x-real-ip")
          ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? "unknown";

        await auditLog({
          action: "auth.logout",
          entity: "Employee",
          entityId: user.id,
          userId: user.id,
          userName: user.name,
          details: { email: user.email, ip },
        });
      } catch { /* best effort */ }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
