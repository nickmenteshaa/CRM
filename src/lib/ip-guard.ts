/**
 * IP-based access control utility.
 *
 * Env vars:
 *   IP_RESTRICTION_ENABLED=true|false (default: false)
 *   IP_RESTRICTION_MODE=site|admin-only (default: admin-only)
 *   ALLOWED_IPS=1.2.3.4,5.6.7.8,10.0.0.0/24 (comma-separated IPs or CIDR ranges)
 *
 * "site" mode: blocks all pages for non-allowed IPs
 * "admin-only" mode: blocks only sensitive routes/actions for non-allowed IPs
 */

import { NextRequest } from "next/server";

/** Parse CIDR notation: "10.0.0.0/24" → { base, mask } */
function parseCIDR(cidr: string): { base: number; mask: number } | null {
  const parts = cidr.split("/");
  if (parts.length !== 2) return null;
  const ip = ipToNumber(parts[0]);
  if (ip === null) return null;
  const bits = parseInt(parts[1], 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (ip & mask) >>> 0, mask };
}

/** Convert dotted IP to 32-bit number */
function ipToNumber(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

/** Check if an IP matches an allowlist entry (exact or CIDR) */
function ipMatches(clientIp: string, entry: string): boolean {
  const trimmed = entry.trim();
  if (trimmed.includes("/")) {
    const cidr = parseCIDR(trimmed);
    const ip = ipToNumber(clientIp);
    if (!cidr || ip === null) return false;
    return ((ip & cidr.mask) >>> 0) === cidr.base;
  }
  return clientIp.trim() === trimmed;
}

/** Get the real client IP from a request, respecting proxy headers safely */
export function getClientIp(request: NextRequest): string {
  // Vercel sets this reliably — it's the actual connecting IP
  const vercelIp = request.headers.get("x-real-ip");
  if (vercelIp) return vercelIp.trim();

  // Fallback: x-forwarded-for (first entry is the client)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  // Last resort
  return "unknown";
}

/** Check if IP restriction is enabled */
export function isIpRestrictionEnabled(): boolean {
  return process.env.IP_RESTRICTION_ENABLED === "true";
}

/** Get restriction mode */
export function getRestrictionMode(): "site" | "admin-only" {
  return process.env.IP_RESTRICTION_MODE === "site" ? "site" : "admin-only";
}

/** Check if an IP is in the allowlist */
export function isIpAllowed(clientIp: string): boolean {
  if (!isIpRestrictionEnabled()) return true;

  const allowedRaw = process.env.ALLOWED_IPS || "";
  if (!allowedRaw.trim()) return true; // no list = allow all

  const entries = allowedRaw.split(",").filter(Boolean);
  return entries.some((entry) => ipMatches(clientIp, entry));
}

/** Sensitive path patterns that require IP check in admin-only mode */
const SENSITIVE_PATHS = [
  "/settings",
  "/api/import",
  "/api/seed",
  "/audit",
];
// NOTE: /api/automation is intentionally NOT in this list.
// It has its own auth via x-automation-key header — IP-blocking it
// prevents Vercel Cron and external schedulers from reaching it.

/** Check if a path is sensitive */
export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PATHS.some((p) => pathname.startsWith(p));
}

/** Full IP access check: returns { allowed, reason } */
export function checkIpAccess(request: NextRequest): { allowed: boolean; reason?: string } {
  if (!isIpRestrictionEnabled()) return { allowed: true };

  const clientIp = getClientIp(request);
  const mode = getRestrictionMode();
  const pathname = request.nextUrl.pathname;

  // In site mode, check everything
  if (mode === "site") {
    if (!isIpAllowed(clientIp)) {
      return { allowed: false, reason: `IP ${clientIp} not in allowlist (site mode)` };
    }
    return { allowed: true };
  }

  // In admin-only mode, only check sensitive paths
  if (isSensitivePath(pathname)) {
    if (!isIpAllowed(clientIp)) {
      return { allowed: false, reason: `IP ${clientIp} not in allowlist for ${pathname}` };
    }
  }

  return { allowed: true };
}
