import { NextResponse, type NextRequest } from "next/server";

import { signOutAction } from "@/app/(public)/sign-out/actions";
import { getSession } from "@/lib/session";
import { SESSION_COOKIE, SESSION_COOKIE_PATH } from "@/lib/session-config";

// POST /api/back-to-home
//
// Real path: app/api/back-to-home/route.ts
//
// The target of the "Back to home" button on app/not-found.tsx (BUG-21). It
// always ends on the landing page ("/"), never on the last page the user was
// on, and it ends the session the same way the sign-out button does:
//
//   - Valid session: signOutAction() runs unchanged. It writes the `sign_out`
//     activity-log row, bumps users.session_version (so the token stops
//     working and every other device is signed out too), and clears the cookie.
//   - No session, or an expired / revoked one: only the cookie is cleared. No
//     activity-log row is written, on purpose. This route needs no login, and
//     an unauthenticated route that writes to the database on every hit would
//     be a log-flooding hole (same reasoning as /api/session-expired).
//
// Why a route and not a Server Action: a Server Action posts to the URL the
// user is on, and on a 404 page that URL matches no route by definition. A
// route handler always matches, and a plain HTML <form method="post"> needs no
// JavaScript, so the button works even if the page's JS never loaded.
//
// Why POST only: signing out here also revokes the account on every device, so
// a link or redirect on another site must not be able to trigger it. The
// session cookie is SameSite=lax, so browsers do not send it on a cross-site
// POST. The GET below does nothing except go to "/", so typing this URL into
// the address bar is not a dead end either.
//
// Nothing here can leave the user stuck: every failure is logged and the
// response is still "clear the cookie, go to /".
export async function POST(request: NextRequest) {
  let hasValidSession = false;
  try {
    hasValidSession = (await getSession()) !== null;
  } catch (error) {
    // Misconfigured SESSION_SECRET or the database is down. Nothing to revoke
    // without knowing the account, but the cookie is still cleared below.
    console.error("back-to-home: could not read the session:", error);
  }

  if (hasValidSession) {
    try {
      const result = await signOutAction();
      if (!result.ok) {
        // signOutAction() doesn't throw when clearSession() fails inside it
        // (it returns { ok: false } instead), so this check is the only way
        // this route can see that failure. The response.cookies.delete(...)
        // below still runs regardless and is the actual backstop that gets
        // the cookie gone client-side; this is just so the failure isn't
        // silently invisible here too (BUG-22).
        console.error(
          "back-to-home: signOutAction reported ok: false (session cookie may not have been cleared server-side; the route's own cookie delete below still runs)",
        );
      }
    } catch (error) {
      console.error("back-to-home: sign-out failed:", error);
    }
  }

  // 303 turns the form's POST into a GET of "/". With the cookie gone,
  // proxy.ts sees an anonymous visitor and serves the landing page.
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  // signOutAction already cleared it through next/headers. Doing it on the
  // response as well covers the cases where it didn't run or failed, and uses
  // the same name and path createSession set the cookie with.
  response.cookies.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_PATH });
  // Never cache: the redirect's whole purpose is to change the cookie.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}