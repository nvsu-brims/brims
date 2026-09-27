"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import { cn } from "@/lib/utils";
import { FILTER_BAR_CLASSES } from "@/components/shared/dashboard/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates";
import { notifyPendingCountsChanged } from "@/lib/pending-counts";
import type { AdminBorrowRow } from "@/lib/repositories/borrowings";
import { approveRequestAction, rejectRequestAction } from "./actions";
import { REJECT_REASONS } from "@/lib/reject-reasons";

// Client half of a server page + client table split (same shape as
// admin/items). Approve opens the shared ConfirmDialog; Reject opens the
// same dialog with a custom form body (reason dropdown + conditional note).

interface RequestsTableProps {
  requests: AdminBorrowRow[];
}

interface ActionTarget {
  id: number;
  borrowerName: string;
  itemName: string;
}

export function RequestsTable({ requests }: RequestsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const [approveTarget, setApproveTarget] = React.useState<ActionTarget | null>(
    null
  );

  const [rejectTarget, setRejectTarget] = React.useState<ActionTarget | null>(
    null
  );
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectNote, setRejectNote] = React.useState("");
  const [reasonError, setReasonError] = React.useState(false);
  const isOtherReason = rejectReason === "Other";

  const closeRejectDialog = () => {
    setRejectTarget(null);
    setRejectReason("");
    setRejectNote("");
    setReasonError(false);
  };

  function run(
    task: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string
  ) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
      notifyPendingCountsChanged();
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
      key: "requestedAt",
      header: "Requested",
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
        <div className="flex justify-start gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                className="rounded-md! bg-green-600 hover:bg-green-700"
                onClick={() =>
                  setApproveTarget({
                    id: row.id,
                    borrowerName: row.borrowerName,
                    itemName: row.itemName,
                  })
                }
              >
                <Check className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Approve</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="rounded-md! border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() =>
                  setRejectTarget({
                    id: row.id,
                    borrowerName: row.borrowerName,
                    itemName: row.itemName,
                  })
                }
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Reject</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrower Requests
        </h3>
        <p className="mb-0 text-muted-foreground">
          Review pending borrow requests and approve or reject them.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={requests}
          getRowId={(row) => row.id}
          emptyMessage="No pending borrow requests right now."
        />
      </div>

      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null);
        }}
        title="Approve Borrow Request"
        description={
          approveTarget
            ? `Approve ${approveTarget.borrowerName}'s request for "${approveTarget.itemName}"?`
            : ""
        }
        confirmLabel="Approve"
        variant="success"
        onConfirm={() => {
          const target = approveTarget;
          setApproveTarget(null);
          if (!target) return;
          run(() => approveRequestAction(target.id), "Request approved");
        }}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeRejectDialog();
        }}
        title="Reject Request"
        confirmLabel="Reject Request"
        variant="danger"
        confirmDisabled={isOtherReason && !rejectNote.trim()}
        onConfirm={() => {
          if (!rejectReason) {
            setReasonError(true);
            return;
          }
          const target = rejectTarget;
          const reason = rejectReason;
          const note = rejectNote;
          closeRejectDialog();
          if (!target) return;
          run(() =>
            rejectRequestAction({ id: target.id, reason, note }),
            "Request rejected"
          );
        }}
      >
        <p className="text-sm text-slate-600">
          {rejectTarget ? `Rejecting ${rejectTarget.borrowerName}'s request.` : ""}
        </p>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Item</Label>
          <Input className="rounded-sm!" value={rejectTarget?.itemName ?? ""} disabled readOnly />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Reason</Label>
          <Select
            value={rejectReason}
            onValueChange={(value) => {
              setRejectReason(value ?? "");
              setReasonError(false);
            }}
          >
            <SelectTrigger
              className={
                reasonError
                  ? "w-full rounded-md! border-red-400 bg-white ring-2 ring-red-400/30"
                  : cn("w-full bg-white", FILTER_BAR_CLASSES)
              }
            >
              <SelectValue placeholder="Select a reason..." />
            </SelectTrigger>
            <SelectContent
              position="popper"
              sideOffset={4}
              className="w-full"
              style={{ width: "var(--anchor-width)" }}
            >
              {REJECT_REASONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">
            Additional note {isOtherReason ? "(required for Other)" : "(optional)"}
          </Label>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder="Let the borrower know why this was rejected..."
            required={isOtherReason}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}