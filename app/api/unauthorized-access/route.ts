import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { logActivity } from "@/lib/repositories/activity-logs";
import { getSession } from "@/lib/session";
import { getSessionSecret } from "@/lib/session-config";
import { getDashboardPath } from "@/lib/roles";

// GET /api/unauthorized-access?t=<signed token>
//
// Real path: app/api/unauthorized-access/route.ts
//
// proxy.ts sends a visitor here (instead of straight to /sign-in or their
// dashboard) when they type a URL they are not allowed to open. This route
// writes an `unauthorized_page_access` row to activity_logs, then forwards
// them on. Two cases, told apart by the token's `kind`:
//
//   "signed_out" — anonymous visitor opened /admin/* or /borrower/*.
//       Row has userId = null (shown as "System"), office = null (super admin
//       only). Forwarded to /sign-in?reason=signin-required.
//   "blocked"    — a SIGNED-IN user opened a page outside their access (the
//       other role's dashboard, or a super-admin-only page as a scoped admin).
//       Row is attributed to that user (id + office from their session), so
//       the office's admins see it too. Forwarded to their own dashboard.
//
// Why a route and not logging inside proxy.ts: the proxy is the hot path for
// every guarded request and should stay a cookie read + JWT check, with no
// database access. Prisma also can't be assumed to work inside it.
//
// Anti-forgery (BUG-06): the path and kind travel in a short-lived JWT signed
// by proxy.ts with SESSION_SECRET, not as a plain query string. Anyone can
// still call this URL, but only a redirect that really came from the proxy
// carries a valid token, so nobody can write made-up text into the audit log
// by crafting a URL. A per-IP limit stops one client flooding the log.

const AUDIENCE = "unauthorized-access";
// The signing secret comes from lib/session-config.ts (shared with proxy.ts).

// Best-effort per-IP limit, in memory (per server instance).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    // Keep the map from growing forever.
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return (ip || "unknown").slice(0, 64);
}

/** Keep the logged path printable and bounded. The token already proves the
 * proxy produced it, so it isn't restricted to known routes: odd URLs such as
 * /admin/items.json are logged too. */
function cleanPath(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  return text.replace(/[^\x20-\x7E]/g, "?").slice(0, 200) || "(unknown path)";
}

function redirect(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const signInUrl = "/sign-in?reason=signin-required";
  const token = request.nextUrl.searchParams.get("t");

  let kind: "signed_out" | "blocked" | null = null;
  let path = "";
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSessionSecret(), {
        audience: AUDIENCE,
      });
      if (payload.kind === "signed_out" || payload.kind === "blocked") {
        kind = payload.kind;
        path = cleanPath(payload.path);
      }
    } catch {
      // Missing, expired, or not signed by proxy.ts: nothing is logged.
    }
  }

  const ip = clientIp(request);
  const shouldLog = kind !== null && !rateLimited(ip);

  if (kind === "blocked") {
    const user = await getSession();
    // BUG-02: the proxy saw a signed-in-looking cookie (that is why this is
    // "blocked" and not "signed_out"), but getSession() rejects it, so it is a
    // revoked session. Clear it on the way, or the proxy would keep treating
    // the visitor as signed in.
    if (!user) return redirect(request, "/api/session-expired");

    if (shouldLog) {
      await logActivity({
        userId: user.userId,
        action: "unauthorized_page_access",
        entityType: "auth",
        description: `${user.role} account ${user.idNumber} tried to open ${path}, which is outside their access (IP ${ip}).`,
        office: user.office ?? null,
      });
    }
    return redirect(
      request,
      getDashboardPath({ role: user.role, office: user.office ?? null })
    );
  }

  if (kind === "signed_out" && shouldLog) {
    await logActivity({
      userId: null,
      action: "unauthorized_page_access",
      entityType: "auth",
      description: `Unauthenticated visitor tried to open ${path} directly without signing in (IP ${ip}).`,
    });
  }

  return redirect(request, signInUrl);
}