import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getLastPasswordChangeAt } from "@/lib/repositories/activity-logs";

// GET /api/me
//
// Returns the session user's fields as JSON for client components (layouts,
// profile dialog) that can't call getSession() directly because they run
// in the browser.
//
// Also returns `lastPasswordChangeAt` (ISO string, or null if the password has
// never changed) for the profile dialog's "Last password change" footer. It
// isn't in the JWT (that is only written at sign-in), so it is read from the
// activity log on each call.
//
// Returns 401 with { user: null } if there is no valid session — the layout
// falls back to its placeholder profile, same as before. The route guard
// (proxy.ts) should already redirect unauthenticated users before they reach
// any layout that calls this, so 401 here is a belt-and-suspenders fallback.
export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const lastPasswordChangeAt = await getLastPasswordChangeAt(user.userId);

  // sessionVersion is the server-side revocation marker (BUG-02). The browser
  // has no use for it, so it is not sent.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sessionVersion: _sessionVersion, ...publicUser } = user;

  return NextResponse.json({ user: publicUser, lastPasswordChangeAt });
}