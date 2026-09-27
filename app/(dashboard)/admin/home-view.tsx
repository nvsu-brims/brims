"use client";

import {
  Boxes,
  Check,
  ClipboardCheck,
  ClockAlert,
  Hourglass,
  UserCheck,
  X,
} from "lucide-react";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getAdminLabel, isSuperAdmin } from "@/lib/roles";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import { formatDateTime } from "@/lib/dates";
import type { Office } from "@/lib/roles";
import {
  approveSignUpAction,
  rejectSignUpAction,
} from "./sign-up-requests/actions";
import { approveRequestAction } from "./requests/actions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Admin Home view — the client half of admin/page.tsx. The server page reads
// everything from the database (getAdminHomeStats, getActivityLogs,
// getPendingSignUps, getPendingBorrowRequests) and passes it in; this file
// keeps only the interactive parts (the confirm dialogs and the Approve /
// Reject buttons). Ported from admin_dashboard.php's homeSection.
//
// The page changes with the admin type (the PHP's `$adminOffice === null`
// branching, $homeStatCardColClass):
//
//   - Super admin (office null): 4 stat cards (Total Items & Equipment /
//     Overdue Borrowers / Pending Borrowers Request / Pending Approvals),
//     then Recent Activity next to a Pending Approvals list of SIGN-UPS
//     ("View All" -> Sign-Up Requests).
//   - SDO / UCAO admin (office set): 3 stat cards (no Pending Approvals),
//     then Recent Activity next to a Pending Requests list of BORROW
//     REQUESTS ("View All" -> Borrower Requests).
//
// The scoped admin's Pending Requests list is NOT in the PHP (it shows them
// only the stat card); it is added at the project owner's request (FE-37).
// Every number and list is already scoped to the admin's office by the server
// page's queries, so nothing here filters by office.
//
// The Welcome greeting reads the session: the admin type label ("Super Admin",
// "SDO Admin", "UCAO Admin"). That is a deliberate change from the PHP, which
// greeted the admin by full name.
//
// Approve / Reject on the two lists (FE-38, closed):
//   - Pending Approvals (sign-ups): Approve and Reject open the same
//     ConfirmDialogs, with the same wording, as the Sign-Up Requests page, and
//     call the same Server Actions (super admin only).
//   - Pending Requests (borrow requests): Approve opens the same ConfirmDialog
//     as the Borrower Requests page and calls approveRequestAction. Reject is
//     NOT duplicated here: it needs the 7-reason dialog that lives in
//     admin/requests/requests-table.tsx, so its icon links to that page
//     instead of copying ~100 lines that would have to be kept in sync.
// ---------------------------------------------------------------------------

export interface AdminHomeStatsView {
  totalItems: number;
  overdueBorrowers: number;
  pendingRequests: number;
  /** Super admin only; 0 (and not shown) for a scoped admin. */
  pendingSignUps: number;
}

export interface RecentActivityRow {
  id: number;
  /** Human label, e.g. "Borrow Approved". */
  action: string;
  details: string;
  createdAt: string;
}

export interface PendingSignUpRow {
  id: number;
  firstName: string;
  lastName: string;
  idNumber: string;
}

export interface PendingRequestRow {
  id: number;
  borrowerName: string;
  idNumber: string;
  itemName: string;
}

export function HomeView({
  stats,
  recentActivity,
  pendingSignUps,
  pendingRequests,
  office,
}: {
  stats: AdminHomeStatsView;
  recentActivity: RecentActivityRow[];
  pendingSignUps: PendingSignUpRow[];
  pendingRequests: PendingRequestRow[];
  office: Office | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // Row currently targeted by each confirm dialog.
  const [approveSignUpTarget, setApproveSignUpTarget] =
    React.useState<PendingSignUpRow | null>(null);
  const [rejectSignUpTarget, setRejectSignUpTarget] =
    React.useState<PendingSignUpRow | null>(null);
  const [approveRequestTarget, setApproveRequestTarget] =
    React.useState<PendingRequestRow | null>(null);

  // Runs a Server Action, toasts the result, and refreshes the server data
  // so the row and every stat card update.
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
    });
  }

  // office comes from the server page via props — no client-side session fetch needed.
  const adminLabel = getAdminLabel(office);
  const superAdmin = isSuperAdmin(office);

  const statCardColClass = superAdmin ? "md:grid-cols-4" : "md:grid-cols-3";

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Welcome, {adminLabel}
        </h3>
        <p className="mb-0 text-muted-foreground">
          This is your admin dashboard. Monitor inventory and borrow
          activity at a glance.
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${statCardColClass}`}>
        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total Items &amp; Equipment
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-800">
              <Boxes className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {stats.totalItems}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Items currently in the inventory.
            </p>
          </CardFooter>
        </Card>

        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Overdue Borrowers
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
              <ClockAlert className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {stats.overdueBorrowers}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Borrowers past their due date.
            </p>
          </CardFooter>
        </Card>

        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pending Borrowers Request
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Hourglass className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {stats.pendingRequests}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Requests waiting for approval.
            </p>
          </CardFooter>
        </Card>

        {superAdmin && (
          <Card className="rounded-2xl border-0! shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Pending Signup Approvals
              </p>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-800">
                <UserCheck className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="mb-0 text-3xl font-bold">
                {stats.pendingSignUps}
              </h3>
            </CardContent>
            <CardFooter className="border-t-0 bg-white">
              <p className="mb-0 text-sm text-muted-foreground">
                Accounts waiting for approval.
              </p>
            </CardFooter>
          </Card>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-0! shadow-sm">
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-teal-700" />
                <h3 className="mb-0 font-semibold">Recent Activity</h3>
              </div>
              <Button
                asChild
                size="sm"
                className="rounded-md! bg-green-600 px-3 font-semibold hover:bg-green-700"
              >
                <Link href="/admin/logs">View All</Link>
              </Button>
            </div>
            {recentActivity.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {recentActivity.map((log, i) => (
                  <li
                    key={log.id}
                    className={
                      "flex items-center justify-between gap-3 py-2 text-sm" +
                      (i > 0 ? " border-t border-slate-100" : "")
                    }
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{log.action}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {log.details}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDateTime(log.createdAt, "—")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 text-sm text-muted-foreground">
                No activity logged yet.
              </p>
            )}
          </CardContent>
        </Card>

        {superAdmin ? (
          <Card className="rounded-2xl border-0! shadow-sm">
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-4 text-fuchsia-800" />
                  <h3 className="mb-0 font-semibold">Pending Signup Approvals</h3>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="rounded-md! bg-green-600 px-3 font-semibold hover:bg-green-700"
                >
                  <Link href="/admin/sign-up-requests">View All</Link>
                </Button>
              </div>
              {pendingSignUps.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {pendingSignUps.slice(0, 6).map((row, i) => (
                    <li
                      key={row.id}
                      className={
                        "flex items-center justify-between gap-3 py-2 text-sm" +
                        (i > 0 ? " border-t border-slate-100" : "")
                      }
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">
                          {row.firstName} {row.lastName}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.idNumber}
                        </span>
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                              disabled={isPending}
                              onClick={() => setApproveSignUpTarget(row)}
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
                              className="rounded-lg border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={isPending}
                              onClick={() => setRejectSignUpTarget(row)}
                            >
                              <X className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Reject</TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 text-sm text-muted-foreground">
                  No accounts waiting for approval.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-0! shadow-sm">
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hourglass className="size-4 text-indigo-700" />
                  <h3 className="mb-0 font-semibold">Pending Borrow Requests</h3>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="rounded-md! bg-green-600 px-3 font-semibold hover:bg-green-700"
                >
                  <Link href="/admin/requests">View All</Link>
                </Button>
              </div>
              {pendingRequests.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {pendingRequests.slice(0, 6).map((row, i) => (
                    <li
                      key={row.id}
                      className={
                        "flex items-center justify-between gap-3 py-2 text-sm" +
                        (i > 0 ? " border-t border-slate-100" : "")
                      }
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{row.borrowerName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.itemName}
                        </span>
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                              disabled={isPending}
                              onClick={() => setApproveRequestTarget(row)}
                            >
                              <Check className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Approve</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              asChild
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Link href="/admin/requests">
                                <X className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Reject (opens Borrower Requests)</TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 text-sm text-muted-foreground">
                  No requests waiting for approval.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={approveSignUpTarget !== null}
        onOpenChange={(open) => {
          if (!open) setApproveSignUpTarget(null);
        }}
        title="Approve Sign-Up"
        description={
          approveSignUpTarget
            ? `Approve ${approveSignUpTarget.firstName} ${approveSignUpTarget.lastName}'s sign-up? They will be able to sign in once approved.`
            : ""
        }
        confirmLabel="Approve"
        variant="success"
        onConfirm={() => {
          const target = approveSignUpTarget;
          setApproveSignUpTarget(null);
          if (!target) return;
          run(() => approveSignUpAction(target.id), "Sign-up approved");
        }}
      />

      <ConfirmDialog
        open={rejectSignUpTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectSignUpTarget(null);
        }}
        title="Reject Sign-Up"
        description={
          rejectSignUpTarget
            ? `Reject ${rejectSignUpTarget.firstName} ${rejectSignUpTarget.lastName}'s sign-up? They can resubmit the sign-up form afterward if they'd like to try again.`
            : ""
        }
        confirmLabel="Reject"
        variant="danger"
        onConfirm={() => {
          const target = rejectSignUpTarget;
          setRejectSignUpTarget(null);
          if (!target) return;
          run(() => rejectSignUpAction(target.id), "Sign-up rejected");
        }}
      />

      <ConfirmDialog
        open={approveRequestTarget !== null}
        onOpenChange={(open) => {
          if (!open) setApproveRequestTarget(null);
        }}
        title="Approve Borrow Request"
        description={
          approveRequestTarget
            ? `Approve ${approveRequestTarget.borrowerName}'s request for "${approveRequestTarget.itemName}"?`
            : ""
        }
        confirmLabel="Approve"
        variant="success"
        onConfirm={() => {
          const target = approveRequestTarget;
          setApproveRequestTarget(null);
          if (!target) return;
          run(() => approveRequestAction(target.id), "Request approved");
        }}
      />
    </div>
  );
}