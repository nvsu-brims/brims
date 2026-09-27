import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import {
  getActivityLogs,
  getAdminHomeStats,
} from "@/lib/repositories/activity-logs";
import { getPendingBorrowRequests } from "@/lib/repositories/borrowings";
import { getPendingSignUps } from "@/lib/repositories/users";
import { HomeView } from "./home-view";

// Port of admin_dashboard.php's homeSection: getHomeStats($conn, $adminOffice),
// getActivityLogs($conn, $adminOffice, 6) and, for the super admin only,
// getPendingSignUps($conn). Reads the database on every request, so a stat or
// a list changes without a rebuild.
//
// Open to all three admin types, scoped like the PHP. Every number and list is
// scoped by the SESSION's office here, in the queries, so a scoped admin's
// browser never receives another office's data:
//   - stats: getAdminHomeStats(office) counts only that office's items,
//     overdue and pending borrow records; the super admin (null) sees totals.
//   - Recent Activity: the 6 newest rows for that office (a scoped admin gets
//     only item_* / borrow_* rows of their own office; the super admin gets
//     every row).
//   - Pending Approvals (sign-ups): SUPER ADMIN ONLY, so for a scoped admin the
//     query never runs (the PHP's `$homePendingSignUpsResult = null`), and the
//     "Pending Approvals" stat card is not shown.
//   - Pending Requests (borrow requests): the scoped admin's list, added at the
//     project owner's request (MIGRATION_LOGS.md FE-37); the super admin sees
//     the sign-ups list instead, so this query does not run for them.
//
// Recent Activity reads the real activity_logs table but nothing writes it yet
// (activity logging is excluded at the project owner's request), so it shows
// "No activity logged yet." until something does.
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  const office = user.office ?? null;
  const superAdmin = isSuperAdmin(office);

  const [stats, recentActivity, signUps, requests] = await Promise.all([
    getAdminHomeStats(office),
    getActivityLogs(office, 6),
    superAdmin ? getPendingSignUps() : Promise.resolve([]),
    superAdmin ? Promise.resolve([]) : getPendingBorrowRequests(office),
  ]);

  return (
    <HomeView
      office={office}
      stats={{
        totalItems: stats.totalItems,
        overdueBorrowers: stats.overdueBorrowers,
        pendingRequests: stats.pendingRequests,
        pendingSignUps: signUps.length,
      }}
      recentActivity={recentActivity.map((log) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        createdAt: log.createdAt,
      }))}
      pendingSignUps={signUps.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        idNumber: row.idNumber,
      }))}
      pendingRequests={requests.map((row) => ({
        id: row.id,
        borrowerName: row.borrowerName,
        idNumber: row.borrowerIdNumber,
        itemName: row.itemName,
      }))}
    />
  );
}