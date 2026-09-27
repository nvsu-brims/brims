"use client";

import { formatDate } from "@/lib/dates";
import type { BorrowerBorrowRow } from "@/lib/repositories/borrowings";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";

// ---------------------------------------------------------------------------
// The Borrow History table. The rows come from the server page
// (getBorrowerHomeStats()['borrowHistory'] in lib/repositories/borrowings.ts,
// i.e. this borrower's non-pending borrow_records). Columns port the PHP's
// #borrowHistoryTable exactly: Item, Status, Due Date, Approval Date,
// Approved By.
//
// Unlike Requests/Borrowed Items, History shows every past status that can
// actually be written: rejected, borrowed, overdue, returned, cancelled.
// (BUG-14: "approved" was previously listed here too, but approveBorrowRequest()
// sets the status straight to 'borrowed' with no separate "approved, not yet
// picked up" state, so a row can never actually be 'approved'. BUG-13:
// "overdue" CAN appear now — a 'borrowed' row past its due day is read as
// overdue by getBorrowerHomeStats(), and the daily job stores it.)
//
// A rejected row also shows its reason (borrow_records.remarks) beneath the
// item name, so a borrower can see why a request was turned down instead of
// only seeing "Rejected" with no explanation (also BUG-14).
//
// NOT BUILT YET: the PHP's borrowHistorySection also has a filter bar (Status
// dropdown + Approved Date "From"/"To" range) above the table. That is UI
// only, so it is left for a later pass (see COMPLETED_TASKS.md, Not Yet
// Built).
// ---------------------------------------------------------------------------

type BorrowHistoryRow = BorrowerBorrowRow;

const columns: DataTableColumn<BorrowHistoryRow>[] = [
  {
    key: "item",
    header: "Item",
    cell: (row) => (
      <div>
        <div className="md:truncate">{row.itemName}</div>
        {row.status === "rejected" && row.remarks ? (
          <div className="mt-0.5 text-xs text-muted-foreground md:truncate">
            {row.remarks}
          </div>
        ) : null}
      </div>
    ),
    title: (row) => row.itemName,
    className: "md:max-w-[220px]",
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} fixedWidth />,
  },
  {
    key: "dueAt",
    header: "Due Date",
    cell: (row) => formatDate(row.dueAt),
  },
  {
    key: "approvedAt",
    header: "Approval Date",
    cell: (row) => formatDate(row.approvedAt),
  },
  {
    key: "approvedBy",
    header: "Approved By",
    cell: (row) => row.approvedByName ?? "N/A",
  },
];

export function HistoryTable({ rows }: { rows: BorrowHistoryRow[] }) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrow History
        </h3>
        <p className="mb-0 text-muted-foreground">
          Every past request — rejected, borrowed, returned, or cancelled.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          emptyMessage="No borrow history yet."
        />
      </div>
    </div>
  );
}