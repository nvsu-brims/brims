import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import type { Office } from "@/lib/roles";

export interface AdminSession {
  userId: number;
  idNumber: string;
  office: Office | null;
}

/**
 * For admin server pages: returns the signed-in admin's session fields, or
 * redirects. Second line of defense after proxy.ts.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const user = await getSession();
  // A null session may be a revoked cookie proxy.ts still treats as valid —
  // go through /api/session-expired to clear it. A wrong-role session is
  // still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  return {
    userId: user.userId,
    idNumber: user.idNumber,
    office: user.office,
  };
}

export type RequireAdminActionResult =
  | { ok: true; caller: { id: number; office: Office | null } }
  | { ok: false; error: string };

/**
 * Same gate as requireAdmin(), for Server Actions: returns an error instead
 * of redirecting, since a Server Action can't redirect() on failure.
 * `unauthorizedMessage` lets each caller customize the wording.
 */
export async function requireAdminAction(
  unauthorizedMessage = "You are not allowed to perform this action."
): Promise<RequireAdminActionResult> {
  const user = await getSession();
  if (!user || user.role !== "admin") {
    return { ok: false, error: unauthorizedMessage };
  }
  return { ok: true, caller: { id: user.userId, office: user.office ?? null } };
}