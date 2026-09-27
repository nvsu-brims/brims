import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { getUserManagementList } from "@/lib/repositories/users";
import { UsersTable } from "./users-table";

// Port of admin_dashboard.php's userManagementSection / getUserManagementList().
// Reads users from the database on every request, so a change (a new
// sign-up approval, another admin's edit) shows up without a rebuild.
//
// Super-admin-only, like the PHP's `$adminOffice === null` gate: admin-layout
// hides the nav item for an SDO / UCAO admin and proxy.ts redirects them
// away from /admin/users, and the page and all four Server Actions
// (./actions.ts) check again.
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");
  if (!isSuperAdmin(user.office ?? null)) redirect("/admin");

  const users = await getUserManagementList();

  return <UsersTable users={users} currentUserId={user.userId} />;
}