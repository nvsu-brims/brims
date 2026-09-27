"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import { formatDate } from "@/lib/dates";
import type { AdminBorrowRow } from "@/lib/repositories/borrowings";
import { markReturnedAction } from "./actions";

// ---------------------------------------------------------------------------
// Was admin-borrowed-items-page.tsx (a single client page over
// MOCK_BORROWED_ITEMS). Now the client half of a server page + client table
// split, same shape as admin/items/(page.tsx + items-table.tsx). Mark as
// Returned now calls the real Server Action in ./actions.ts instead of a TODO
// no-op. MOCK_BORROWED_ITEMS is gone.
//
// No filter bar here, matching the PHP's own comment: "Styled like Borrow
// Requests, not Borrow History — plain card + table, no filter dropdown, no
// date-range picker." Every row here is by definition borrowed/overdue —
// other statuses live in Borrower Requests or Borrower History.
// ---------------------------------------------------------------------------

interface BorrowedItemsTableProps {
  borrowedItems: AdminBorrowRow[];
}

export function BorrowedItemsTable({ borrowedItems }: BorrowedItemsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const [markReturnedTarget, setMarkReturnedTarget] =
    React.useState<AdminBorrowRow | null>(null);

  function handleConfirmReturn() {
    const target = markReturnedTarget;
    setMarkReturnedTarget(null);
    if (!target) return;

    startTransition(async () => {
      const result = await markReturnedAction(target.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as returned");
      router.refresh();
    });
  }

  const columns: DataTableColumn<AdminBorrowRow>[] = [
    {
      key: "borrower",
      header: "Borrower",
      cell: (row) => row.borrowerName,
    },
    {
      key: "idNumber",
      header: "ID Number",
      cell: (row) => row.borrowerIdNumber,
    },
    {
      key: "college",
      header: "College",
      cell: (row) => row.college ?? "—",
    },
    {
      key: "organization",
      header: "Organization",
      cell: (row) => row.organization ?? "—",
    },
    {
      key: "item",
      header: "Item",
      cell: (row) => row.itemName,
      title: (row) => row.itemName,
      className: "md:max-w-[200px] md:truncate",
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
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex justify-start">
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            className="rounded-md! bg-green-600 hover:bg-green-700"
            onClick={() => setMarkReturnedTarget(row)}
          >
            Mark as Returned
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrowed Items
        </h3>
        <p className="mb-0 text-muted-foreground">
          Items currently out — borrowed or overdue for return.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={borrowedItems}
          getRowId={(row) => row.id}
          emptyMessage="No items currently borrowed."
        />
      </div>

      <ConfirmDialog
        open={markReturnedTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMarkReturnedTarget(null);
        }}
        title="Mark as Returned"
        description={
          markReturnedTarget
            ? `Mark ${markReturnedTarget.borrowerName}'s "${markReturnedTarget.itemName}" as returned?`
            : ""
        }
        confirmLabel="Mark as Returned"
        variant="success"
        onConfirm={handleConfirmReturn}
      />
    </div>
  );
}