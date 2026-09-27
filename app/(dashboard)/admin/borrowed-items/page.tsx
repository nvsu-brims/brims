import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getBorrowedItems } from "@/lib/repositories/borrowings";
import { BorrowedItemsTable } from "./borrowed-items-table";

// Port of admin_dashboard.php's borrowedItemsSection / getBorrowedItems($conn,
// $adminOffice). Reads the database on every request.
//
// Open to all three admin types, scoped like the PHP: a super admin (office
// null) gets every office's borrowed/overdue items, an SDO or UCAO admin only
// their own. The Server Action (./actions.ts) checks the same scope again.
export const dynamic = "force-dynamic";

export default async function AdminBorrowedItemsPage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "admin") redirect("/sign-in");

  const office = user.office ?? null;
  const borrowedItems = await getBorrowedItems(office);

  return <BorrowedItemsTable borrowedItems={borrowedItems} />;
}