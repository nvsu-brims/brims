import { requireBorrowerId } from "@/lib/require-borrower";
import { getBorrowerHomeStats } from "@/lib/repositories/borrowings";
import { RequestsTable } from "./requests-table";

// Port of borrower_dashboard.php's borrowRequestsSection: the borrower's own
// requests that are still 'pending', newest requested first
// (getBorrowerHomeStats()['pendingRequests']). Once an admin approves or
// rejects a request it moves to Borrowed Items or Borrow History instead.
// Reads the database on every request; the Cancel button calls
// cancelBorrowRequestAction (./actions.ts).
export const dynamic = "force-dynamic";

export default async function BorrowerRequestsPage() {
  const borrowerId = await requireBorrowerId();
  const stats = await getBorrowerHomeStats(borrowerId);
  return <RequestsTable requests={stats.pendingRequests} />;
}