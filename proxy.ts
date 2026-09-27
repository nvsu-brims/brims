import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

import {
  getDashboardPath,
  SUPER_ADMIN_ONLY_PATHS,
  type Office,
  type Role,
} from "@/lib/roles";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_PATH,
  getSessionSecret,
} from "@/lib/session-config";

// ---------------------------------------------------------------------------
// Route guard (Next.js 16 "proxy" — the renamed middleware.ts). Lives at the
// project root, next to package.json (or in src/ if the project uses src/).
//
// Rules:
//   1. Anonymous visitor opens /admin/* or /borrower/*
//        -> logged as `unauthorized_page_access` (via /api/unauthorized-access),
//           then /sign-in?reason=signin-required  ("Please sign in to continue.")
//   2. Signed-in user opens a public entry page (/, /sign-in, /sign-up)
//        -> their own dashboard (/admin or /borrower)
//   3. Signed-in user opens the OTHER role's dashboard
//        -> logged (attributed to them), then their own dashboard
//   4. SDO / UCAO admin opens a super-admin-only page (SUPER_ADMIN_ONLY_PATHS)
//        -> logged (attributed to them), then /admin
//
// Everything else (/about, /faqs, /items-equipment, /api/*, static files) is
// left alone. /api/me and the other API routes already check the session
// themselves, and Server Actions re-check it too (requireAdminAction, etc.) —
// this file is the first line of defense, not the only one.
//
// Runs on every request that matches `config.matcher` below, so it only does
// a cookie read + one JWT signature check: no database access.
// ---------------------------------------------------------------------------

// Cookie name and secret come from lib/session-config.ts, the same module
// lib/session.ts uses, so the two can no longer drift apart.
const COOKIE = SESSION_COOKIE;

interface GuardSession {
  role: Role;
  office: Office | null;
}

// A missing or too-short SESSION_SECRET must not crash the proxy (that would
// break every guarded route with an opaque error), so it fails closed: every
// visitor is treated as signed out. It is logged once, not on every request.
let warnedAboutSecret = false;
function secretOrNull(): Uint8Array | null {
  try {
    return getSessionSecret();
  } catch (error) {
    if (!warnedAboutSecret) {
      warnedAboutSecret = true;
      console.error(
        "[proxy] Session checks are disabled and every visitor is treated as " +
          "signed out:",
        error instanceof Error ? error.message : error
      );
    }
    return null;
  }
}

async function readSession(request: NextRequest): Promise<GuardSession | null> {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;

  const secret = secretOrNull();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role;
    if (role !== "admin" && role !== "borrower") return null;

    return {
      role,
      office: (payload.office as Office | null | undefined) ?? null,
    };
  } catch {
    // Expired, tampered, or signed with a different secret.
    return null;
  }
}

/** True when `pathname` is `base` or anything below it ("/admin", "/admin/x"). */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

const GUARD_AUDIENCE = "unauthorized-access";

/**
 * Redirect through /api/unauthorized-access so the attempt is written to the
 * activity log. The path and kind are carried in a short-lived signed token
 * (see that route) so the log can't be filled with forged entries. If signing
 * fails (e.g. SESSION_SECRET missing) fall back to the plain redirect.
 */
async function loggedRedirect(
  request: NextRequest,
  kind: "signed_out" | "blocked",
  fallback: string
): Promise<NextResponse> {
  try {
    const secret = secretOrNull();
    if (!secret) return redirectTo(request, fallback);

    const token = await new SignJWT({ kind, path: request.nextUrl.pathname })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(GUARD_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(secret);
    return redirectTo(
      request,
      `/api/unauthorized-access?t=${encodeURIComponent(token)}`
    );
  } catch {
    return redirectTo(request, fallback);
  }
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  // Guard decisions depend on the cookie, so never let a browser or CDN cache
  // them (also keeps the back button honest after sign-out).
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  const inAdminArea = isUnder(pathname, "/admin");
  const inBorrowerArea = isUnder(pathname, "/borrower");
  const isEntryPage =
    pathname === "/" || isUnder(pathname, "/sign-in") || isUnder(pathname, "/sign-up");

  // --- Not signed in -------------------------------------------------------
  if (!session) {
    if (inAdminArea || inBorrowerArea) {
      // Also covers an expired / invalid cookie: readSession() returned null.
      // The visitor goes through /api/unauthorized-access, which writes an
      // `unauthorized_page_access` activity-log row and then forwards them to
      // /sign-in?reason=signin-required. (Logging lives in that Node route so
      // this file stays a cookie read + JWT check, with no database access.)
      const response = await loggedRedirect(
        request,
        "signed_out",
        "/sign-in?reason=signin-required"
      );
      if (request.cookies.has(COOKIE)) {
        // Same name and path clearSession() uses (lib/session-config.ts).
        response.cookies.delete({ name: COOKIE, path: SESSION_COOKIE_PATH });
      }
      return response;
    }
    return NextResponse.next();
  }

  // --- Signed in -----------------------------------------------------------
  const dashboard = getDashboardPath(session);

  // Landing page / sign-in / sign-up while already signed in.
  if (isEntryPage) {
    return redirectTo(request, dashboard);
  }

  // Wrong dashboard for this role.
  if (
    (session.role === "admin" && inBorrowerArea) ||
    (session.role === "borrower" && inAdminArea)
  ) {
    return loggedRedirect(request, "blocked", dashboard);
  }

  // Scoped (SDO / UCAO) admins can't open the super-admin-only pages.
  if (
    session.role === "admin" &&
    session.office !== null &&
    SUPER_ADMIN_ONLY_PATHS.some((path) => isUnder(pathname, path))
  ) {
    return loggedRedirect(request, "blocked", "/admin");
  }

  const response = NextResponse.next();
  if (inAdminArea || inBorrowerArea) {
    // Protected pages must not be served from the browser's back/forward cache
    // after sign-out.
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  // Only run where a decision is needed: the entry pages and both dashboards.
  // Skips /_next/*, /api/*, static files, and the other public pages.
  matcher: [
    "/",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/admin/:path*",
    "/borrower/:path*",
  ],
};