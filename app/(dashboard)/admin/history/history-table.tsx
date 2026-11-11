/* eslint-disable react-hooks/refs */
// react-hooks/refs false positive: useHoverMenu returns useCallback ref
// callbacks and event handlers — not .current reads — so these are safe to
// use in JSX. The rule's static analysis cannot see through the hook boundary.
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
import { FormDialogShell } from "@/components/shared/dashboard/form-dialog";
import { formatDate, isoToManilaDate } from "@/lib/dates";
import {
  FormField,
  FIELD_FOCUS_RING_CLASSES,
  FILTER_BAR_CLASSES,
} from "@/components/shared/dashboard/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { periodRange, type PeriodSpec } from "@/lib/reports/borrow-history-period";
import { buildBorrowHistoryPdf } from "@/lib/reports/borrow-history-pdf";
import { exportBorrowHistoryAction } from "./actions";
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
  const [search, setSearch] = React.useState("");
  const [exportOpen, setExportOpen] = React.useState(false);

  const filteredHistory = history.filter((row) => {
    const matchesStatus = status === "all" || row.status === status;
    const approvedDate = row.approvedAt ? isoToManilaDate(row.approvedAt) : null;
    const matchesFrom = !dateFrom || (approvedDate && approvedDate >= dateFrom);
    const matchesTo = !dateTo || (approvedDate && approvedDate <= dateTo);
    const matchesSearch =
      !search.trim() ||
      row.borrowerName.toLowerCase().includes(search.trim().toLowerCase());
    return matchesStatus && matchesFrom && matchesTo && matchesSearch;
  });

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
      className: "wrap-break-word whitespace-normal md:max-w-[240px]",
      cell: (row) => (
        <div className="min-w-0">
          <p className="wrap-break-word font-medium">{row.itemName}</p>
          <p className="text-xs text-muted-foreground">
            Qty {row.quantity} ·{" "}
            {row.depositTotal == null
              ? "No deposit"
              : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(row.depositTotal)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} fixedWidth />,
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
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-none sm:flex-wrap sm:items-center sm:gap-2">
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

        {/*
          Mobile (below sm): From and To sit side by side, equal width, each
          with its label stacked above the input — see UI-UX Log mockup. At
          sm+ this reverts to the original flex row, each field sized by its
          own DatePicker width.
        */}
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
        <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto sm:flex-none">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name..."
              className={cn("w-full bg-white", FILTER_BAR_CLASSES)}
            />
          </div>
          <Button
            type="button"
            onClick={() => setExportOpen(true)}
            className="shrink-0 bg-green-700 text-gray-50 hover:bg-green-800"
          >
            Export
          </Button>
        </div>
      </div>

      <BorrowHistoryExportDialog open={exportOpen} onOpenChange={setExportOpen} />

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

// ---------------------------------------------------------------------------
// Export dialog (Plan 5): period controls, preview, and PDF download.
// ---------------------------------------------------------------------------

const PERIOD_LABELS: Record<PeriodSpec["type"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Today's date in Manila as "YYYY-MM-DD". */
function todayManilaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function BorrowHistoryExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = todayManilaIso();
  const currentYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const [type, setType] = React.useState<PeriodSpec["type"]>("monthly");
  const [date, setDate] = React.useState(today);
  const [year, setYear] = React.useState(currentYear);
  const [month, setMonth] = React.useState(Number(today.slice(5, 7)));
  const [error, setError] = React.useState<string | null>(null);
  const [isExporting, startTransition] = React.useTransition();

  // A discriminated object per period, so each branch matches PeriodSpec.
  const spec: PeriodSpec =
    type === "daily"
      ? { type: "daily", date }
      : type === "weekly"
        ? { type: "weekly", date }
        : type === "monthly"
          ? { type: "monthly", year, month }
          : { type: "yearly", year };

  let preview = "";
  let previewIsError = false;
  try {
    preview = periodRange(spec).coverText;
  } catch (caught) {
    preview = caught instanceof Error ? caught.message : "Choose a valid period.";
    previewIsError = true;
  }

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportBorrowHistoryAction(spec);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const doc = buildBorrowHistoryPdf({
        rows: result.rows,
        range: result.range,
        scope: result.scope,
        generatedAt: result.generatedAt,
      });
      doc.save(result.range.fileName);
      onOpenChange(false);
    });
  }

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Export Borrow History"
      description="Choose a period. The PDF covers every borrow requested in that period."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || previewIsError}
            className="bg-green-700 text-gray-50 hover:bg-green-800"
          >
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <FormField label="Period" htmlFor="exportPeriod">
          <Select value={type} onValueChange={(value) => setType(value as PeriodSpec["type"])}>
            <SelectTrigger id="exportPeriod" className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
              <SelectValue>{PERIOD_LABELS[type]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {type === "daily" || type === "weekly" ? (
          <FormField
            label={type === "daily" ? "Day" : "Any day in the week"}
            htmlFor="exportDate"
          >
            <DatePicker id="exportDate" value={date} onChange={setDate} className="w-full" />
          </FormField>
        ) : null}

        {type === "monthly" ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Month" htmlFor="exportMonth">
              <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                <SelectTrigger id="exportMonth" className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                  <SelectValue>{MONTH_NAMES[month - 1]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, index) => (
                    <SelectItem key={name} value={String(index + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Year" htmlFor="exportYearMonthly">
              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger id="exportYearMonthly" className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                  <SelectValue>{String(year)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        ) : null}

        {type === "yearly" ? (
          <FormField label="Year" htmlFor="exportYearYearly">
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger id="exportYearYearly" className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                <SelectValue>{String(year)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}

        <p className={cn("text-sm", previewIsError ? "text-red-600" : "text-muted-foreground")}>
          {preview}
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </FormDialogShell>
  );
}