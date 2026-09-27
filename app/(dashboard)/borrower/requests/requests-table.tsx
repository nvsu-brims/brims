"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { formatDate } from "@/lib/dates";
import type { BorrowerBorrowRow } from "@/lib/repositories/borrowings";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import {
  cancelBorrowRequestAction,
  type CancelBorrowRequestActionResult,
} from "./actions";

// ---------------------------------------------------------------------------
// The Borrow Requests table. The rows come from the server page
// (getBorrowerHomeStats()['pendingRequests'] in lib/repositories/borrowings.ts,
// i.e. this borrower's pending borrow_records); this component owns the table
// and the Cancel confirm.
//
// This table only ever shows status "pending" — once a request is approved or
// rejected it moves to Borrowed Items or Borrow History instead — so `status`
// isn't a per-row variable field here, same as the PHP (`badge-status-pending`
// is hardcoded on every row in this loop, not read from a column).
//
// Cancel goes through the shared ConfirmDialog (the port of
// #cancelRequestModal: "Cancel Request" / "Cancel your pending request for
// \"{item}\"?") and then cancelBorrowRequestAction (./actions.ts). The action
// re-checks that the request is still pending, so a request an admin approved
// a moment ago shows the PHP's "could no longer be cancelled" message instead.
// The `borrow_cancelled` activity-log row is written by
// cancelBorrowRequestAction (./actions.ts).
// ---------------------------------------------------------------------------

type BorrowRequestRow = BorrowerBorrowRow;

export function RequestsTable({ requests }: { requests: BorrowRequestRow[] }) {
  const router = useRouter();
  // Row currently targeted by the Cancel confirm dialog — mirrors the PHP's
  // per-button data-request-id/data-item-name read into the shared modal's
  // message at click time.
  const [cancelTarget, setCancelTarget] =
    React.useState<BorrowRequestRow | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Run the Cancel action, toast its result, and refresh the table.
  function cancelRequest(requestId: number) {
    startTransition(async () => {
      const result: CancelBorrowRequestActionResult =
        await cancelBorrowRequestAction(requestId);
      if (result.ok) {
        toast.success("Request cancelled");
      } else {
        toast.error("Couldn't cancel request");
      }
      router.refresh();
    });
  }

  const columns: DataTableColumn<BorrowRequestRow>[] = [
    {
      key: "item",
      header: "Item",
      cell: (row) => row.itemName,
      title: (row) => row.itemName,
      className: "md:max-w-[220px] md:truncate",
    },
    {
      key: "status",
      header: "Status",
      cell: () => <StatusBadge status="pending" fixedWidth />,
    },
    {
      key: "requestedAt",
      header: "Requested Date",
      cell: (row) => formatDate(row.requestedAt),
    },
    {
      key: "expectedReturn",
      header: "Expected Return",
      cell: (row) => formatDate(row.expectedReturnDate),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          className="rounded-md! border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setCancelTarget(row)}
        >
          Cancel
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrow Requests
        </h3>
        <p className="mb-0 text-muted-foreground">
          Requests you&apos;ve submitted that are still awaiting approval.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={requests}
          getRowId={(row) => row.id}
          emptyMessage="You have no pending borrow requests."
        />
      </div>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel Request"
        description={
          cancelTarget
            ? `Cancel your pending request for "${cancelTarget.itemName}"?`
            : ""
        }
        confirmLabel="Cancel Request"
        variant="danger"
        onConfirm={() => {
          if (cancelTarget) cancelRequest(cancelTarget.id);
          setCancelTarget(null);
        }}
      />
    </div>
  );
}