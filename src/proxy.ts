import { NextRequest, NextResponse } from "next/server";
import { checkIpAccess, getClientIp, isIpRestrictionEnabled } from "@/lib/ip-guard";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals through always
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // ── IP restriction check (runs before auth) ─────────────────────────
  if (isIpRestrictionEnabled()) {
    const ipCheck = checkIpAccess(request);
    if (!ipCheck.allowed) {
      const clientIp = getClientIp(request);
      console.warn(`[IP-GUARD] Blocked: ${clientIp} → ${pathname} | ${ipCheck.reason}`);

      // For API routes, return JSON error
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Access denied", reason: "IP not authorized" },
          { status: 403 },
        );
      }

      // For pages, return HTML error
      return new NextResponse(
        `<!DOCTYPE html><html><body style="background:#0B0F14;color:#F9FAFB;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
          <div style="text-align:center">
            <h1 style="font-size:2rem;margin-bottom:0.5rem">Access Denied</h1>
            <p style="color:#9CA3AF">Your IP address is not authorized to access this resource.</p>
            <p style="color:#6B7280;font-size:0.75rem;margin-top:1rem">IP: ${clientIp}</p>
          </div>
        </body></html>`,
        { status: 403, headers: { "Content-Type": "text/html" } },
      );
    }
  }

  // ── Allow login page and automation API without session ──────────────
  if (pathname.startsWith("/login") || pathname.startsWith("/api/seed-employees") || pathname.startsWith("/api/automation")) {
    return NextResponse.next();
  }

  // ── Session check ───────────────────────────────────────────────────
  const session = request.cookies.get("crm_session");
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
