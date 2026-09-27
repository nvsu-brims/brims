// Real path: lib/session-config.ts
//
// Shared session config: cookie name + signing secret, used by
// lib/session.ts, proxy.ts and app/api/unauthorized-access/route.ts.
//
// Edge-safe on purpose — imports nothing (no `next/headers`, no Node-only
// APIs), since proxy.ts may run in the Edge runtime. Keep it that way;
// anything needing `next/headers` belongs in lib/session.ts.
//
// Secret is validated on first use, not on import, so `next build` still
// works with no SESSION_SECRET set.

/** Name of the HttpOnly session cookie. */
export const SESSION_COOKIE = "brims_session";

/**
 * Path the session cookie is set on. A browser only removes a cookie when the
 * delete uses the same path it was set with, so createSession, clearSession
 * and proxy.ts all read this one value.
 */
export const SESSION_COOKIE_PATH = "/";

/** Minimum length for SESSION_SECRET, in characters. */
export const SESSION_SECRET_MIN_LENGTH = 32;

let cachedSecret: Uint8Array | null = null;

/**
 * The signing key for session and route-guard tokens. Throws when
 * SESSION_SECRET is missing, blank, or too short. Callers decide how to
 * fail: lib/session.ts lets it surface; proxy.ts catches it and fails closed.
 */
export function getSessionSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.trim() === "") {
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local (at least " +
        `${SESSION_SECRET_MIN_LENGTH} random characters) and restart the server.`
    );
  }
  if (raw.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(
      `SESSION_SECRET is too short (${raw.length} characters). Use at least ` +
        `${SESSION_SECRET_MIN_LENGTH} random characters.`
    );
  }

  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}