"use client";

import { formatDate } from "@/lib/dates";
import { OFFICE_LABELS, type Office } from "@/lib/roles";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";

// ---------------------------------------------------------------------------
// The Borrowed Items table. The rows come from the server page
// (getBorrowerHomeStats()['borrowedItems'] in lib/repositories/borrowings.ts,
// i.e. this borrower's 'borrowed' / 'overdue' borrow_records). Columns port the
// PHP's #borrowedItemsTable exactly: Item, Office, Status, Requested, Due Date.
//
// Status badge color is per-row (ports `badge-status-<?php echo
// $borrowedStatusColor ?>`, which reads the row's actual `status`). Borrowed
// Items only ever shows "borrowed" or "overdue" rows (approved-and-picked-up
// items not yet returned); other statuses live in Borrow History.
//
// The Office column shows the full office name (OFFICE_LABELS), like the PHP's
// OFFICE_DISPLAY_LABELS. No Actions column, matching the PHP's
// borrowedItemsSection (no per-row buttons).
// ---------------------------------------------------------------------------

interface BorrowedItemRow {
  id: number;
  itemName: string;
  office: Office;
  status: "borrowed" | "overdue";
  /** ISO timestamp. */
  requestedAt: string;
  /** ISO timestamp set by the admin on approval, or null. */
  dueAt: string | null;
}

const columns: DataTableColumn<BorrowedItemRow>[] = [
  {
    key: "item",
    header: "Item",
    cell: (row) => row.itemName,
    title: (row) => row.itemName,
    className: "md:max-w-[220px] md:truncate",
  },
  {
    key: "office",
    header: "Office",
    cell: (row) => OFFICE_LABELS[row.office] ?? "—",
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} fixedWidth />,
  },
  {
    key: "requestedAt",
    header: "Requested",
    cell: (row) => formatDate(row.requestedAt),
  },
  {
    key: "dueAt",
    header: "Due Date",
    cell: (row) => formatDate(row.dueAt),
  },
];

export function BorrowedItemsTable({ items }: { items: BorrowedItemRow[] }) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrowed Items
        </h3>
        <p className="mb-0 text-muted-foreground">
          Items you currently have out — not yet returned. Soonest due (or
          most overdue) first.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(row) => row.id}
          emptyMessage="You have no items currently borrowed."
        />
      </div>
    </div>
  );
}