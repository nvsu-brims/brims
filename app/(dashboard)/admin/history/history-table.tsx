"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { DatePicker } from "@/components/shared/dashboard/date-picker";
import { formatDate, isoToManilaDate } from "@/lib/dates";
import { FILTER_BAR_CLASSES } from "@/components/shared/dashboard/form-field";
import type { AdminBorrowRow } from "@/lib/repositories/borrowings";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useHoverMenu } from "@/hooks/use-hover-menu";

// ---------------------------------------------------------------------------
// Was admin-history-page.tsx (a single client page over MOCK_HISTORY). Now
// the client half of a server page + client table split, same shape as
// admin/items/(page.tsx + items-table.tsx). MOCK_HISTORY is gone — `history`
// comes from getBorrowHistory(office) on the server.
//
// Read-only page: no Server Action, matching the admin dashboard's own
// borrowHistorySection (view + filter only, no per-row actions). Status
// dropdown + Approved Date From/To range still filter client-side against
// the real fetched rows — same trivial client logic as before, just against
// real data instead of a placeholder array.
// ---------------------------------------------------------------------------

type AdminHistoryStatus = "rejected" | "returned" | "cancelled";

const STATUS_LABELS: Record<AdminHistoryStatus, string> = {
  rejected: "Rejected",
  returned: "Returned",
  cancelled: "Cancelled",
};

const STATUS_FILTER_LABELS: Record<AdminHistoryStatus | "all", string> = {
  all: "All Status",
  ...STATUS_LABELS,
};

interface HistoryTableProps {
  history: AdminBorrowRow[];
}

export function HistoryTable({ history }: HistoryTableProps) {
  const [status, setStatus] = React.useState<AdminHistoryStatus | "all">("all");
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const filteredHistory = history.filter((row) => {
    const matchesStatus = status === "all" || row.status === status;
    const approvedDate = row.approvedAt ? isoToManilaDate(row.approvedAt) : null;
    const matchesFrom = !dateFrom || (approvedDate && approvedDate >= dateFrom);
    const matchesTo = !dateTo || (approvedDate && approvedDate <= dateTo);
    return matchesStatus && matchesFrom && matchesTo;
  });

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
      key: "item",
      header: "Item",
      cell: (row) => row.itemName,
      title: (row) => row.itemName,
      className: "md:max-w-[220px] md:truncate",
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
      cell: (row) => row.approvedByName ?? "—",
    },
  ];

  // True on devices that can actually hover with a real pointer (desktop),
  // false on touch devices — gates the hover-to-open behavior below so
  // mobile still requires a tap, since it has no hover state to open on.
  // Same pattern as the borrower catalog page's filter dropdowns.
  const isDesktopHover = useMediaQuery("(hover: hover) and (pointer: fine)");


  const statusHover = useHoverMenu(setStatusOpen, isDesktopHover);

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrower History
        </h3>
        <p className="mb-0 text-muted-foreground">
          Every past request — rejected, returned, or cancelled.
        </p>
      </div>

      {/* Filter bar: Status dropdown + Approved Date range — same pattern
          as admin_dashboard.php's borrowHistorySection. Sticky directly
          below the mobile dashboard header, using the
          --dashboard-header-height CSS var set by DashboardHeader's
          measured offsetHeight (see header.tsx) — same approach as the
          public Items & Equipment page's --header-height, defaulting to
          0px so nothing shifts on desktop where that header is
          md:hidden. */}
      <div
        id="sticky-filter-bar"
        className="sticky z-40 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 pt-6 pb-3 md:-mx-6 md:px-6"
        style={{ top: "var(--dashboard-header-height, 0px)" }}
      >
        {/*
          Mobile (below sm): this page only ever has one filter, so it takes
          the full row (grid-cols-1) — matches the same mobile grouping rule
          FilterBar uses for its "search" variant. At sm+ this reverts to
          the original flex-wrap behavior. See UI-UX Log for the mockups.
        */}
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-none sm:flex-wrap sm:gap-2">
          <div
            ref={statusHover.setTriggerRef}
            className="min-w-0 sm:w-44 sm:flex-none"
            onMouseEnter={statusHover.onMouseEnter}
            onMouseMove={statusHover.onMouseMove}
            onMouseLeave={statusHover.onMouseLeave}
          >
            <Select
              value={status}
              open={statusOpen}
              onOpenChange={setStatusOpen}
              onValueChange={(value) =>
                setStatus(value as AdminHistoryStatus | "all")
              }
            >
              <SelectTrigger className={cn("w-full bg-white", FILTER_BAR_CLASSES)}>
                <SelectValue placeholder="All Status">
                  {STATUS_FILTER_LABELS[status]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                ref={statusHover.setContentRef}
                position="popper"
                sideOffset={0}
                className="w-full"
                style={{ width: "var(--anchor-width)" }}
                onMouseEnter={statusHover.onMouseEnter}
                onMouseMove={statusHover.onMouseMove}
                onMouseLeave={statusHover.onMouseLeave}
              >
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/*
          Mobile (below sm): From and To sit side by side, equal width, each
          with its label stacked above the input — see UI-UX Log mockup. At
          sm+ this reverts to the original flex row, each field sized by its
          own DatePicker width.
        */}
        <div className="grid w-full grid-cols-2 items-start gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div className="min-w-0 sm:flex sm:min-w-0 sm:items-center sm:gap-1.5">
            <Label htmlFor="historyDateFrom" className="mb-1.5 block text-sm text-muted-foreground sm:mb-0">
              From
            </Label>
            <DatePicker
              id="historyDateFrom"
              value={dateFrom}
              onChange={setDateFrom}
              className="w-full sm:w-40"
            />
          </div>
          <div className="min-w-0 sm:flex sm:min-w-0 sm:items-center sm:gap-1.5">
            <Label htmlFor="historyDateTo" className="mb-1.5 block text-sm text-muted-foreground sm:mb-0">
              To
            </Label>
            <DatePicker
              id="historyDateTo"
              value={dateTo}
              onChange={setDateTo}
              min={dateFrom || undefined}
              className="w-full sm:w-40"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={filteredHistory}
          getRowId={(row) => row.id}
          emptyMessage="No borrows found."
        />
      </div>
    </div>
  );
}