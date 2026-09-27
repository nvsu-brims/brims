import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { getPendingSignUps } from "@/lib/repositories/users";
import { SignUpRequestsTable } from "./sign-up-requests-table";

// Port of admin_dashboard.php's signUpRequestsSection / getPendingSignUps().
// Reads the pending sign-ups from the database on every request, so a new
// sign-up shows up without a rebuild.
//
// Super-admin-only, like the PHP's `$adminOffice === null` gate: admin-layout
// hides the nav item and proxy.ts redirects SDO / UCAO admins, and the page
// and both Server Actions check again.
export const dynamic = "force-dynamic";

export default async function AdminSignUpRequestsPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");
  if (!isSuperAdmin(user.office ?? null)) redirect("/admin");

  const rows = await getPendingSignUps();
  return <SignUpRequestsTable rows={rows} />;
}