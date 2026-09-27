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

  // Outside the try/catch above: if the DB is down, the honest answer is an
  // error, not a silent "signed out" that looks like a mass sign-out.
  const current = await db.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true, deletedAt: true, signUpStatus: true },
  });

  if (!current) return null; // account no longer exists
  if (current.deletedAt) return null; // deactivated
  if (current.signUpStatus !== "approved") return null; // no longer approved
  if (current.sessionVersion !== session.sessionVersion) return null; // revoked

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