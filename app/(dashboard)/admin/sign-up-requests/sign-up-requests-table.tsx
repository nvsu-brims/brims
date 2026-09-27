"use client";

import * as React from "react";
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
import { notifyPendingCountsChanged } from "@/lib/pending-counts";
import type { SignUpRequest } from "@/lib/repositories/users";
import {
  approveSignUpAction,
  rejectSignUpAction,
  type ReviewResult,
} from "./actions";

// ---------------------------------------------------------------------------
// The Sign-Up Requests table. The rows come from the server page
// (getPendingSignUps()); Approve and Reject open the shared ConfirmDialog
// ("Approve Sign-Up" / "Reject Sign-Up", wording from the PHP) and then call
// the Server Actions, which re-check that the caller is a super admin.
//
// Pending-only by design, same as the PHP: a rejected sign-up isn't shown
// here, and if the borrower resubmits it flips back to "pending" and
// reappears through the same query. No filter bar, matching the PHP's plain
// card + table treatment (same as Borrower Requests / Borrowed Items).
//
// After an action succeeds the action revalidates this route, so the row
// disappears without a manual refresh.
// ---------------------------------------------------------------------------

export function SignUpRequestsTable({ rows }: { rows: SignUpRequest[] }) {
  // Row currently targeted by each confirm dialog.
  const [approveTarget, setApproveTarget] =
    React.useState<SignUpRequest | null>(null);
  const [rejectTarget, setRejectTarget] =
    React.useState<SignUpRequest | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function review(
    action: (id: number) => Promise<ReviewResult>,
    row: SignUpRequest,
    successMessage: string
  ) {
    startTransition(async () => {
      const result = await action(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      notifyPendingCountsChanged();
    });
  }

  const columns: DataTableColumn<SignUpRequest>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => `${row.firstName} ${row.lastName}`,
      title: (row) => `${row.firstName} ${row.lastName}`,
      className: "md:max-w-[180px] md:truncate",
    },
    {
      key: "idNumber",
      header: "ID Number",
      cell: (row) => row.idNumber,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => row.email ?? "—",
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
                onClick={() => setApproveTarget(row)}
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
                onClick={() => setRejectTarget(row)}
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
          Sign-Up Requests
        </h3>
        <p className="mb-0 text-muted-foreground">
          Review pending borrower sign-ups and approve or reject them.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          emptyMessage="No pending sign-up requests right now."
        />
      </div>

      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null);
        }}
        title="Approve Sign-Up"
        description={
          approveTarget
            ? `Approve ${approveTarget.firstName} ${approveTarget.lastName}'s sign-up? They will be able to sign in once approved.`
            : ""
        }
        confirmLabel="Approve"
        variant="success"
        onConfirm={() => {
          if (approveTarget) review(approveSignUpAction, approveTarget, "Sign-up approved");
          setApproveTarget(null);
        }}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        title="Reject Sign-Up"
        description={
          rejectTarget
            ? `Reject ${rejectTarget.firstName} ${rejectTarget.lastName}'s sign-up? They can resubmit the sign-up form afterward if they'd like to try again.`
            : ""
        }
        confirmLabel="Reject"
        variant="danger"
        onConfirm={() => {
          if (rejectTarget) review(rejectSignUpAction, rejectTarget, "Sign-up rejected");
          setRejectTarget(null);
        }}
      />
    </div>
  );
}