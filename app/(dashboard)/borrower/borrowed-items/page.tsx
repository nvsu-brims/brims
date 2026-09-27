import { requireBorrowerId } from "@/lib/require-borrower";
import { getBorrowerHomeStats } from "@/lib/repositories/borrowings";
import { BorrowedItemsTable } from "./borrowed-items-table";

// Port of borrower_dashboard.php's borrowedItemsSection: what this borrower
// currently has out (status 'borrowed' or 'overdue'), soonest due (or most
// overdue) first — getBorrowerHomeStats()['borrowedItems']. Read-only, no
// action column, like the PHP. Reads the database on every request.
export const dynamic = "force-dynamic";

export default async function BorrowedItemsPage() {
  const borrowerId = await requireBorrowerId();
  const stats = await getBorrowerHomeStats(borrowerId);
  const borrowedItems = stats.borrowedItems;

  return (
    <BorrowedItemsTable
      items={borrowedItems.flatMap((row) =>
        // The query only returns these two statuses; the guard narrows the type.
        row.status === "borrowed" || row.status === "overdue"
          ? [
              {
                id: row.id,
                itemName: row.itemName,
                office: row.itemOffice,
                status: row.status,
                requestedAt: row.requestedAt,
                dueAt: row.dueAt,
              },
            ]
          : []
      )}
    />
  );
}