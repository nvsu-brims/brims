/* eslint-disable react-hooks/refs */
// react-hooks/refs false positive: useHoverMenu returns useCallback ref
// callbacks and event handlers — not .current reads — so these are safe to
// use in JSX. The rule's static analysis cannot see through the hook boundary.
"use client";

import { cn } from "@/lib/utils";
import { FILTER_BAR_CLASSES } from "@/components/shared/dashboard/form-field";
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
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { DatePicker } from "@/components/shared/dashboard/date-picker";
import { formatDateTime, isoToManilaDate } from "@/lib/dates";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useHoverMenu } from "@/hooks/use-hover-menu";

// ---------------------------------------------------------------------------
// Activity Logs table — the client half of admin/logs/. The server page
// (./page.tsx) reads getActivityLogs(office) and passes the rows in; this file
// keeps only the interactive part: the Category dropdown, the From / To date
// range and the DataTable. Ported from admin_dashboard.php's
// activityLogsSection.
//
// Category values (item / borrow / account / auth) mirror
// $activityCategoryMap, which maps `entity_type` to a category. The mapping is
// done server-side in the repository, so each row already carries `category`.
//
// Office scoping (BUG-30, fixed): a scoped SDO / UCAO admin's own auth
// rows (sign-in, sign-out, unauthorized-page-access) DO carry that admin's
// office — logActivity() sets it from the signed-in user for those three
// actions — so getActivityLogs(office) already returns them scoped to that
// admin. Only account_* rows (sign-up review, user management) carry no
// office at all, so "Account Actions" stays super-admin-only; "Security &
// Auth" is shown to every admin, scoped to their own history by the same
// office filter as everything else on this page. The intro sentence
// reflects this: a scoped admin sees "your own sign-ins and access", the
// super admin additionally sees "account management, and everyone's auth
// events" since only the super admin's office is null, matching every
// borrower's and the super admin's own auth rows too.
//
// Filtering stays client-side against the fetched rows, unchanged from the
// mock-data version.
// ---------------------------------------------------------------------------

type LogCategory = "item" | "borrow" | "account" | "auth";

export interface ActivityLogRow {
  id: number;
  action: string;
  category: LogCategory;
  actorName: string;
  details: string;
  createdAt: string;
}

const CATEGORY_LABELS: Record<LogCategory, string> = {
  item: "Item Actions",
  borrow: "Borrow Actions",
  account: "Account Actions",
  auth: "Security & Auth",
};

const CATEGORY_FILTER_LABELS: Record<LogCategory | "all", string> = {
  all: "All Categories",
  ...CATEGORY_LABELS,
};

export function LogsTable({
  logs,
  isSuper,
}: {
  logs: ActivityLogRow[];
  /** True for the super admin only (`$adminOffice === null`). */
  isSuper: boolean;
}) {
  const [category, setCategory] = React.useState<LogCategory | "all">("all");
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const filteredLogs = logs.filter((log) => {
    const matchesCategory = category === "all" || log.category === category;
    const logDate = isoToManilaDate(log.createdAt);
    const matchesFrom = !dateFrom || logDate >= dateFrom;
    const matchesTo = !dateTo || logDate <= dateTo;
    return matchesCategory && matchesFrom && matchesTo;
  });

  const columns: DataTableColumn<ActivityLogRow>[] = [
    {
      key: "action",
      header: "Action",
      cell: (row) => row.action,
    },
    {
      key: "actor",
      header: "Actor",
      cell: (row) => row.actorName,
    },
    {
      key: "details",
      header: "Details",
      // Mobile: uses the same row layout as every other column
      // (`flex items-center justify-between` from the base TableCell —
      // label left, value right, no override here). The value can be
      // long, so it needs to wrap onto multiple lines on the right
      // instead of forcing the row (and the whole mobile card) into
      // horizontal overflow.
      //
      // A flex item's default `min-width` is `auto`, which means "never
      // shrink below your content's unwrapped intrinsic width" — so
      // without `min-w-0`, a long unbroken line of Details text stretches
      // the span, the td, and the whole card past the viewport instead of
      // wrapping. `min-w-0` (on both the span and the cell) is what lets
      // the browser actually shrink the box so the text has room to
      // wrap. `flex-1` makes the span always claim the row's remaining
      // width after the label — without it, a short Details value only
      // takes its own content width and a long one only shrinks under
      // overflow pressure, so wrapping/alignment looked inconsistent row
      // to row. `text-right` keeps the (now consistently-sized) wrapped
      // lines right-aligned, matching every other column's value;
      // `line-clamp-3` caps it at 3 lines so one row's long details can't
      // balloon the card.
      cell: (row) => (
        <span className="line-clamp-3 w-full min-w-0 flex-1 text-right wrap-break-word md:line-clamp-none md:w-auto md:min-w-0 md:flex-none md:text-left">
          {row.details}
        </span>
      ),
      // Desktop: was md:truncate (single line, clipped with "…"). Long
      // details (e.g. "Unauthenticated visitor tried to open /admin/logs
      // directly witho…") were getting cut off mid-sentence. `!` forces
      // these to win over shadcn's TableCell base styles (which truncate
      // by default via whitespace-nowrap/overflow-hidden/text-ellipsis) so
      // the text actually wraps instead of silently staying clipped.
      className:
        "min-w-0! md:max-w-[320px] md:overflow-visible! md:text-clip! md:whitespace-normal! md:wrap-break-word!",
    },
    {
      key: "timestamp",
      header: "Timestamp",
      cell: (row) => formatDateTime(row.createdAt),
    },
  ];

  // True on devices that can actually hover with a real pointer (desktop),
  // false on touch devices — gates the hover-to-open behavior below so
  // mobile still requires a tap, since it has no hover state to open on.
  // Same pattern as the borrower catalog page's filter dropdowns.
  const isDesktopHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  // The dropdown menu (SelectContent) renders in a portal, so it isn't a
  // DOM child of the trigger wrapper below — moving the cursor from the
  // trigger into the menu still fires the wrapper's onMouseLeave, which
  // used to close the menu out from under the cursor. Closing on a short
  // delay (instead of instantly) gives the menu's own onMouseEnter a
  // chance to cancel that pending close before it fires.

  const categoryHover = useHoverMenu(setCategoryOpen, isDesktopHover);

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Activity Logs
        </h3>
        <p className="mb-0 text-muted-foreground">
          Every logged action across the system — item changes, borrow
          decisions, your own sign-ins and access
          {isSuper ? ", account management, and everyone's auth events" : ""}.
        </p>
      </div>

      {/* Filter bar: Category dropdown + Date range — same pattern as
          Borrower History's filter bar, ported from
          admin_dashboard.php's activityLogsSection. Sticky directly below
          the mobile dashboard header, using the --dashboard-header-height
          CSS var set by DashboardHeader's measured offsetHeight (see
          header.tsx) — same approach as the public Items & Equipment
          page's --header-height, defaulting to 0px so nothing shifts on
          desktop where that header is md:hidden. */}
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
            ref={categoryHover.setTriggerRef}
            className="min-w-0 sm:w-48 sm:flex-none"
            onMouseEnter={categoryHover.onMouseEnter}
            onMouseMove={categoryHover.onMouseMove}
            onMouseLeave={categoryHover.onMouseLeave}
          >
            <Select
              value={category}
              open={categoryOpen}
              onOpenChange={setCategoryOpen}
              onValueChange={(value) =>
                setCategory(value as LogCategory | "all")
              }
            >
              <SelectTrigger className={cn("w-full bg-white", FILTER_BAR_CLASSES)}>
                <SelectValue placeholder="All Categories">
                  {CATEGORY_FILTER_LABELS[category]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                ref={categoryHover.setContentRef}
                position="popper"
                sideOffset={0}
                className="w-full"
                style={{ width: "var(--anchor-width)" }}
                onMouseEnter={categoryHover.onMouseEnter}
                onMouseMove={categoryHover.onMouseMove}
                onMouseLeave={categoryHover.onMouseLeave}
              >
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="item">Item Actions</SelectItem>
                <SelectItem value="borrow">Borrow Actions</SelectItem>
                <SelectItem value="auth">Security &amp; Auth</SelectItem>
                {isSuper && (
                  <SelectItem value="account">Account Actions</SelectItem>
                )}
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
            <Label htmlFor="logsDateFrom" className="mb-1.5 block text-sm text-muted-foreground sm:mb-0">
              From
            </Label>
            <DatePicker
              id="logsDateFrom"
              value={dateFrom}
              onChange={setDateFrom}
              className="w-full sm:w-40"
            />
          </div>
          <div className="min-w-0 sm:flex sm:min-w-0 sm:items-center sm:gap-1.5">
            <Label htmlFor="logsDateTo" className="mb-1.5 block text-sm text-muted-foreground sm:mb-0">
              To
            </Label>
            <DatePicker
              id="logsDateTo"
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
          rows={filteredLogs}
          getRowId={(row) => row.id}
          emptyMessage="No activity logged yet."
        />
      </div>
    </div>
  );
}