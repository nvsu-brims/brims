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
import { FilterBar } from "@/components/shared/dashboard/filter-bar";
import {
  FormField,
  FIELD_FOCUS_RING_CLASSES,
} from "@/components/shared/dashboard/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { AdminBorrowRow } from "@/lib/repositories/borrowings";
import { markReturnedAction, markPickedUpAction } from "./actions";

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

const CONDITION_LABELS: Record<"good" | "damaged" | "lost", string> = {
  good: "Good",
  damaged: "Damaged",
  lost: "Lost",
};

export function BorrowedItemsTable({ borrowedItems }: BorrowedItemsTableProps) {
  const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");
  const [search, setSearch] = React.useState("");
  // Name search and newest-to-oldest sort (default). Filters the rows shown.
  const visibleRows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = borrowedItems.filter((row) =>
      (row.borrowerName).toLowerCase().includes(term)
    );
    return [...matched].sort((a, b) => {
      const diff =
        new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [borrowedItems, search, sortOrder]);
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const [markReturnedTarget, setMarkReturnedTarget] =
    React.useState<AdminBorrowRow | null>(null);
  // One condition per borrowed unit (Plan 1, D6). Starts as Good for each unit.
  const [unitConditions, setUnitConditions] = React.useState<
    ("good" | "damaged" | "lost")[]
  >([]);
  React.useEffect(() => {
    setUnitConditions(
      Array.from({ length: markReturnedTarget?.quantity ?? 0 }, () => "good" as const)
    );
  }, [markReturnedTarget]);

  function handleConfirmReturn() {
    const target = markReturnedTarget;
    setMarkReturnedTarget(null);
    if (!target) return;

    startTransition(async () => {
      const result = await markReturnedAction(target.id, unitConditions);
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
      cell: (row) => (
        <div className="min-w-0">
          <p className="wrap-break-word font-medium">{row.borrowerName}</p>
          <p className="wrap-break-word text-xs text-muted-foreground">
            {row.borrowerIdNumber} · {row.college ?? "—"} · {row.organization ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item",
      cell: (row) => row.itemName,
      title: (row) => row.itemName,
      className: "wrap-break-word whitespace-normal",
    },
    {
      key: "quantity",
      header: "Quantity",
      cell: (row) => row.quantity,
    },
    {
      key: "depositTotal",
      header: "Cash Deposit",
      cell: (row) =>
        row.depositTotal == null
          ? "—"
          : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(row.depositTotal),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.status === "awaiting_pickup" ? (
          <StatusBadge status="awaiting_pickup" label="Awaiting pick-up" fixedWidth />
        ) : (
          <StatusBadge status={row.status} fixedWidth />
        ),
    },
    {
      key: "pickUpDate",
      header: "Pick-up Date",
      cell: (row) => (row.pickUpDate ? formatDate(row.pickUpDate) : "—"),
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
        <div className="flex justify-start gap-2">
          {row.status === "awaiting_pickup" ? (
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              className="rounded-md! bg-blue-600 hover:bg-blue-700"
              onClick={() =>
                startTransition(async () => {
                  const result = await markPickedUpAction(row.id);
                  if (!result.ok) toast.error(result.error);
                  else toast.success("Marked as picked up");
                })
              }
            >
              Picked Up
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              className="rounded-md! bg-green-600 hover:bg-green-700"
              onClick={() => setMarkReturnedTarget(row)}
            >
              Returned
            </Button>
          )}
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

      <FilterBar
        filters={[
          {
            value: sortOrder,
            onValueChange: (value) => setSortOrder(value as "newest" | "oldest"),
            options: [
              { value: "newest", label: "Newest to oldest" },
              { value: "oldest", label: "Oldest to newest" },
            ],
            placeholder: "Newest to oldest",
            widthClassName: "sm:w-48",
          },
        ]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search by borrower name...",
        }}
      />

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={visibleRows}
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
      >
        {markReturnedTarget && markReturnedTarget.quantity > 0 ? (
          <div className="space-y-3 text-sm">
            {unitConditions.map((condition, index) => (
              <FormField
                key={index}
                label={
                  unitConditions.length > 1
                    ? `Unit ${index + 1} Item Condition`
                    : "Item Condition"
                }
              >
                <Select
                  value={condition}
                  onValueChange={(value) => {
                    const next = (value as "good" | "damaged" | "lost") ?? condition;
                    setUnitConditions((previous) =>
                      previous.map((c, i) => (i === index ? next : c))
                    );
                  }}
                >
                  <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                    <SelectValue>{CONDITION_LABELS[condition]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="w-full"
                    style={{ width: "var(--anchor-width)" }}
                  >
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            ))}
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}