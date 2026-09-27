import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { getActivityLogs } from "@/lib/repositories/activity-logs";
import { LogsTable } from "./logs-table";

// Port of admin_dashboard.php's activityLogsSection / getActivityLogs($conn,
// $adminOffice). Reads the database on every request, so a new log row shows
// up without a rebuild.
//
// Open to all three admin types, scoped like the PHP: a super admin (office
// null) gets every row, an SDO or UCAO admin only the item_* / borrow_* rows
// for their own office (account_* and auth rows carry no office, so they are
// excluded for a scoped admin by the query itself). The office filter is
// applied here, in the query, so a scoped admin's browser never receives
// another office's rows or any account / auth rows.
//
// READ SIDE ONLY here: this page never writes. Activity logging is now live
// (wired in Batch 1/2's Server Actions — item add/edit/delete, mark returned,
// etc. each call logActivity()), so this page shows real rows once those
// actions have run, and "No activity logged yet." only until the first one.
export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  const office = user.office ?? null;
  const logs = await getActivityLogs(office);

  return <LogsTable logs={logs} isSuper={isSuperAdmin(office)} />;
}