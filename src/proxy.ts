import { NextRequest, NextResponse } from "next/server";
import { checkIpAccess, getClientIp, isIpRestrictionEnabled } from "@/lib/ip-guard";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  // ── IP restriction check (runs before auth) ─────────────────────────
  if (isIpRestrictionEnabled()) {
    const ipCheck = checkIpAccess(request);
    if (!ipCheck.allowed) {
      const clientIp = getClientIp(request);
      console.warn(`[IP-GUARD] Blocked: ${clientIp} → ${pathname} | ${ipCheck.reason}`);

      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Access denied", reason: "IP not authorized" },
          { status: 403 },
        );
      }

      return new NextResponse(
        `<!DOCTYPE html><html><body style="background:#0B0F14;color:#F9FAFB;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
          <div style="text-align:center">
            <h1 style="font-size:2rem;margin-bottom:0.5rem">Access Denied</h1>
            <p style="color:#9CA3AF">Your IP address is not authorized.</p>
            <p style="color:#6B7280;font-size:0.75rem;margin-top:1rem">IP: ${clientIp}</p>
          </div>
        </body></html>`,
        { status: 403, headers: { "Content-Type": "text/html" } },
      );
    }
  }

  // ── Allow login page and public API routes without session ──────────
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/seed-employees") ||
    pathname.startsWith("/api/automation") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // ── Session check ───────────────────────────────────────────────────
  const session = request.cookies.get("crm_session");
  if (!session?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Role-based route protection ─────────────────────────────────────
  try {
    const decoded = decodeURIComponent(session.value);
    const sessionData = JSON.parse(decoded);
    const role = sessionData?.role;

    // Admin-only routes
    const adminOnlyPaths = ["/settings", "/audit", "/api/import"];
    const isAdminRoute = adminOnlyPaths.some((p) => pathname.startsWith(p));

    if (isAdminRoute && role !== "admin" && role !== "manager") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden — admin/manager only" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch {
    // Invalid session cookie — clear it and redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const resp = NextResponse.redirect(loginUrl);
    resp.cookies.delete("crm_session");
    return resp;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
