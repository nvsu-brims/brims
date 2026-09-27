"use server";

import { bumpSessionVersion, clearSession, getSession } from "@/lib/session";
import { logActivity } from "@/lib/repositories/activity-logs";

export interface SignOutResult {
  ok: boolean;
  /** Where the client should navigate after a successful sign-out. */
  redirectTo: string;
}

// Returns { redirectTo } instead of calling redirect("/"): redirect() works
// by throwing NEXT_REDIRECT, which surfaces as a runtime error when a client
// event handler calls this action. The client navigates instead, the same
// way sign-in does (see public-sign-in-actions.ts).
//
// Guarantees:
//   - The cookie is always cleared, even if the session can't be read or the
//     audit log can't be written. Signing out must never be blocked by
//     bookkeeping.
//   - `ok` is false only when the cookie could not be cleared, so the client
//     can tell the user instead of navigating away still signed in.
//
// BUG-02: sign-out also revokes the token server-side. It bumps the account's
// session_version, so a copy of the cookie taken before sign-out stops working
// and every other device for this account is signed out too ("sign out
// everywhere"). The bump is best-effort: if the database is unavailable it is
// logged and the cookie is still cleared, so signing out is never blocked.
export async function signOutAction(): Promise<SignOutResult> {
  // getSession() throws if SESSION_SECRET is misconfigured, and returns null
  // for a missing, expired or tampered cookie. Tell those two apart in the log.
  let user = null;
  let sessionReadFailed = false;
  try {
    user = await getSession();
  } catch (error) {
    sessionReadFailed = true;
    console.error("signOutAction: could not read the session:", error);
  }

  // Best-effort audit row. A failure here is logged to the console and must
  // not stop the sign-out.
  try {
    if (user) {
      await logActivity({
        userId: user.userId,
        action: "sign_out",
        entityType: "auth",
        description: `Sign-out: ${user.role} account, ${user.idNumber}`,
        office: user.office,
      });
    } else if (!sessionReadFailed) {
      // The cookie was missing, expired or invalid, so there is no user to
      // attribute this to. Still record that a sign-out happened. It shows as
      // "System" with no office, so only the super admin sees it, the same as
      // other unattributed auth events.
      await logActivity({
        userId: null,
        action: "sign_out",
        entityType: "auth",
        description:
          "Sign-out from a session that had already expired or was no longer valid.",
      });
    }
  } catch (error) {
    console.error("signOutAction: could not write the sign-out log:", error);
  }

  // Revoke first, then clear. Only possible when there was a valid session to
  // identify the account; an expired or invalid cookie has nothing to revoke.
  if (user) {
    try {
      await bumpSessionVersion(user.userId);
    } catch (error) {
      console.error("signOutAction: could not revoke the session:", error);
    }
  }

  try {
    await clearSession();
  } catch (error) {
    console.error("signOutAction: could not clear the session cookie:", error);
    return { ok: false, redirectTo: "/" };
  }

  return { ok: true, redirectTo: "/" };
}