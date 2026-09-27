import { requireBorrowerId } from "@/lib/require-borrower";
import { getBorrowerHomeStats } from "@/lib/repositories/borrowings";
import { HistoryTable } from "./history-table";

// Port of borrower_dashboard.php's borrowHistorySection: every one of this
// borrower's requests that is NOT pending — rejected, borrowed, overdue,
// returned, cancelled — newest requested first
// (getBorrowerHomeStats()['borrowHistory']). Reads the database on every
// request.
export const dynamic = "force-dynamic";

export default async function BorrowHistoryPage() {
  const borrowerId = await requireBorrowerId();
  const stats = await getBorrowerHomeStats(borrowerId);
  return <HistoryTable rows={stats.borrowHistory} />;
}