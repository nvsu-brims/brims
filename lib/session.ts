import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/prisma/db";
import type { Role, Office } from "@/lib/roles";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_PATH,
  getSessionSecret,
} from "@/lib/session-config";

// Custom JWT session (jose): signs/verifies a short-lived HttpOnly cookie
// carrying the user's profile fields, so pages don't need a lookup to render
// them.
//
// Revocation: the token carries `sessionVersion`, checked against
// users.session_version on every getSession() call. Bumping that column
// (bumpSessionVersion) invalidates every token issued before, on every
// device. getSession() also drops deactivated/unapproved accounts. proxy.ts
// only checks signature and expiry (no DB access), so a revoked cookie
// passes the proxy and is rejected by getSession() instead.
//
// SESSION_SECRET (min 32 chars) and the cookie name live in
// lib/session-config.ts, shared with proxy.ts and the unauthorized-access
// route.

const COOKIE = SESSION_COOKIE;
const ALG = "HS256";
const EXPIRES_IN = 60 * 60 * 24 * 7; // 7 days in seconds
// Session limits by role. These are policy values: change them here if the
// university sets different periods. The 7-day token lifetime above is the
// hard upper limit for every role.
//
// IDLE_LIMIT_MS: signed out after this long with no requests. Idle time is
// measured from the last recorded activity, or from sign-in if none is recorded.
// MAX_AGE_MS: signed out this long after sign-in, even if the user stays active.
const IDLE_LIMIT_MS = {
  admin: 12 * 60 * 60 * 1000, // 12 hours
  borrower: 24 * 60 * 60 * 1000, // 24 hours
} as const;
const MAX_AGE_MS = {
  admin: 24 * 60 * 60 * 1000, // 24 hours
  borrower: EXPIRES_IN * 1000, // 7 days (same as the token)
} as const;
// How often getSession() writes lastActiveAt. Writing on every request would
// add a database write to every page load.
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface SessionUser {
  userId: number; // real users.id
  idNumber: string;
  firstName: string;
  lastName: string;
  role: Role;
  office: Office | null;
  email: string | null;
  contactNumber: string | null;
  college: string | null;
  organization: string | null;
  createdAt: string; // ISO string, for "Member since"
  /** users.session_version when this token was issued. */
  sessionVersion: number;
}

/** Called after sign-in credentials verify. Signs and writes the HttpOnly cookie. */
export async function createSession(user: SessionUser): Promise<void> {
  const secret = getSessionSecret();

  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRES_IN}s`)
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SESSION_COOKIE_PATH,
    maxAge: EXPIRES_IN,
  });
}

/**
 * Reads and verifies the session cookie. Returns null if missing, expired,
 * tampered, revoked, or the account is deactivated/unapproved. Costs one
 * primary-key lookup per call, which is what makes revocation real.
 */
export async function getSession(): Promise<SessionUser | null> {
  // Outside the try: a missing/short SESSION_SECRET is a server
  // misconfiguration and must throw, not be swallowed as "signed out".
  const secret = getSessionSecret();

  let session: SessionUser;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret);
    session = payload as unknown as SessionUser;
  } catch {
    // Missing cookie store, expired, tampered, or signed with another secret.
    return null;
  }

  // A token missing a numeric userId or sessionVersion is treated as
  // revoked rather than defaulting either to 0, or it would keep working
  // for its full 7 days (and userId would reach the lookup below unchecked).
  if (
    typeof session.userId !== "number" ||
    typeof session.sessionVersion !== "number"
  ) {
    return null;
  }

  // The office must be present and valid: null (super admin), or one of the
  // two office admin values. A token with no office key is treated as
  // revoked, so a missing value can never be read as super admin.
  if (
    !("office" in session) ||
    (session.office !== null &&
      session.office !== "sports_dev" &&
      session.office !== "culture_arts")
  ) {
    return null;
  }

  // Outside the try/catch above: if the DB is down, the honest answer is an
  // error, not a silent "signed out" that looks like a mass sign-out.
  const current = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      sessionVersion: true,
      deletedAt: true,
      signUpStatus: true,
      lastActiveAt: true,
    },
  });

  if (!current) return null; // account no longer exists
  if (current.deletedAt) return null; // deactivated
  if (current.signUpStatus !== "approved") return null; // no longer approved
  if (current.sessionVersion !== session.sessionVersion) return null; // revoked

  // Idle timeout and maximum age, by role. Idle time uses the last recorded
  // activity; for an account with no record yet, the token's issue time.
  const now = Date.now();
  const issuedAt = (session as unknown as { iat?: unknown }).iat;
  const issuedAtMs = typeof issuedAt === "number" ? issuedAt * 1000 : 0;
  const lastActiveMs = current.lastActiveAt
    ? current.lastActiveAt.getTime()
    : issuedAtMs;

  const roleKey = session.role === "admin" ? "admin" : "borrower";
  if (now - lastActiveMs > IDLE_LIMIT_MS[roleKey]) return null; // idle too long
  if (now - issuedAtMs > MAX_AGE_MS[roleKey]) return null; // signed in too long ago

  // Record activity, at most every few minutes. A failed write must not
  // sign anyone out, so errors are ignored here.
  if (!current.lastActiveAt || now - lastActiveMs > ACTIVITY_WRITE_INTERVAL_MS) {
    await db.user
      .update({
        where: { id: session.userId },
        data: { lastActiveAt: new Date(now) },
      })
      .catch(() => {});
  }

  return session;
}

/**
 * Revokes every session for one account, on every device, by incrementing
 * users.session_version. Returns the new version so the caller can re-issue
 * the current user's cookie (see reissueSession). Used by: password change,
 * admin password reset, deactivation, sign-out.
 */
export async function bumpSessionVersion(userId: number): Promise<number> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return updated.sessionVersion;
}

/**
 * After bumpSessionVersion(), gives the current browser a new cookie with
 * the new version, so a self password change stays signed in here while
 * every other device is signed out. Not used for sign-out/deactivation/admin
 * reset.
 */
export async function reissueSession(
  user: SessionUser,
  sessionVersion: number
): Promise<void> {
  await createSession({ ...user, sessionVersion });
}

/**
 * Called on sign-out. Deletes the cookie using the same name/path
 * createSession set it with, so the browser removes it.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE, path: SESSION_COOKIE_PATH });
}