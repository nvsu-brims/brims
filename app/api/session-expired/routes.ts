import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_COOKIE_PATH } from "@/lib/session-config";

// GET /api/session-expired
//
// Real path: app/api/session-expired/route.ts
//
// Why this exists (BUG-02): sessions can now be revoked server-side, but
// proxy.ts only checks the cookie's signature and expiry (it does no database
// access), so a revoked cookie still LOOKS signed in to it. Without this route
// that made a redirect loop:
//
//   /admin -> page: getSession() is null (revoked) -> redirect("/sign-in")
//          -> proxy: cookie looks valid on an entry page -> redirect("/admin")
//          -> and so on, until the browser gives up.
//
// The pages and require-* helpers now redirect here instead of straight to
// /sign-in when getSession() rejects them. This route deletes the dead cookie
// (same name and path createSession set it with, from lib/session-config.ts)
// and forwards to /sign-in. With the cookie gone the proxy sees an anonymous
// visitor on an entry page and lets it through, so the loop is broken.
//
// It does not verify anything and needs no session: clearing a cookie the
// browser already sent is harmless whoever asks, and a visitor with no cookie
// simply lands on /sign-in.
//
// It does not write an activity-log row. A revoked session is normal (the user
// signed out elsewhere, changed their password, or was deactivated), not a
// security event, and an unauthenticated route that writes to the database on
// every hit would be a log-flooding hole.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/sign-in?reason=signin-required", request.url)
  );
  response.cookies.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_PATH });
  // Never cache: the redirect's whole purpose is to change the cookie.
  response.headers.set("Cache-Control", "no-store");
  return response;
}