import { NextRequest, NextResponse } from "next/server";

// Protect every route except /login and Next.js internals
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and Next.js internal routes through
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/api/seed-employees")) {
    return NextResponse.next();
  }

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
