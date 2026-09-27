import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPendingBorrowRequests } from "@/lib/repositories/borrowings";
import { RequestsTable } from "./requests-table";

// Port of admin_dashboard.php's borrowRequestsSection /
// getPendingBorrowRequests($conn, $adminOffice). Reads the database on every
// request, so a new borrow request or another admin's action shows up
// without a rebuild.
//
// Open to all three admin types, but scoped like the PHP: a super admin
// (office null) gets every office's pending requests, an SDO or UCAO admin
// only their own. The office filter is applied here, in the query, so a
// scoped admin's browser never receives another office's rows. The Server
// Actions (./actions.ts) check the same scope again.
export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  const office = user.office ?? null;
  const requests = await getPendingBorrowRequests(office);

  return <RequestsTable requests={requests} />;
}