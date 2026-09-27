import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";

/**
 * For borrower server pages: returns the signed-in borrower's users.id, or
 * redirects. Second line of defense after proxy.ts.
 */
export async function requireBorrowerId(): Promise<number> {
  const user = await getSession();
  // A null session may be a revoked cookie proxy.ts still treats as valid —
  // go through /api/session-expired to clear it. A wrong-role session is
  // still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "borrower") redirect("/sign-in");
  return user.userId;
}