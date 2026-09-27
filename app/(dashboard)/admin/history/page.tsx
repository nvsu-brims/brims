import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getBorrowHistory } from "@/lib/repositories/borrowings";
import { HistoryTable } from "./history-table";

// Port of admin_dashboard.php's borrowHistorySection / getBorrowHistory($conn,
// $adminOffice). Reads the database on every request. Read-only page — no
// Server Action needed, unlike Requests/Borrowed Items.
//
// Open to all three admin types, scoped like the PHP: a super admin (office
// null) gets every office's history, an SDO or UCAO admin only their own.
export const dynamic = "force-dynamic";

export default async function AdminHistoryPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  const office = user.office ?? null;
  const history = await getBorrowHistory(office);

  return <HistoryTable history={history} />;
}