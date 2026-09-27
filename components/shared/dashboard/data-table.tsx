"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Reusable table shell for the dashboard — ports `.table-modern` /
// `.badge-status-*` from global.css exactly (colors, spacing, borders,
// mobile card-stack behavior), rather than approximating. Backs all 10
// tables across admin_dashboard.php (Inventory Management, Borrower
// Requests, Borrowed Items, Borrower History, Activity Logs, User
// Management, Sign-Up Requests) and borrower_dashboard.php (Borrow
// Requests, Borrowed Items, Borrow History).
//
// Built on shadcn's Table/TableHeader/TableRow/TableHead/TableCell
// primitives (for consistency with the rest of the component system)
// rather than plain <table>/<thead>/<tr> — but since this needs an exact,
// very specific visual design (custom border color, custom padding, the
// mobile card-stack, etc.) that doesn't match shadcn's own default table
// styling, every relevant property below is forced with `!` so the output
// is correct regardless of what the base component's defaults happen to
// be. This file doesn't have visibility into components/ui/table.tsx's
// actual classes, so "forced + verify visually once running" is the safe
// assumption — same approach already used for Card's border, Sheet's
// width, and AlertDialog's border earlier in this project.
//
// Desktop (>=768px): plain table, uppercase gray header row, no vertical
// rules, a 1px top border between rows (`#eef1f5`), soft hover tint
// (`#f8faf9`) — exactly `.table-modern`'s desktop rules.
//
// Mobile (<768px): header row hidden, each row becomes a bordered, rounded
// card; each cell shows its column label via a
// `before:content-[attr(data-label)]` pseudo-element — the SAME technique
// global.css uses (`content: attr(data-label)`), not a re-implementation,
// so a column's `mobileLabel` (or `header`, if omitted) is guaranteed to
// match what the column actually displays.
//
// Border placement differs by breakpoint (ported exactly from
// global.css's two separate rules for this):
//   - Desktop: only the FIRST ROW's cells have no top border (nothing
//     above the top of the table).
//   - Mobile: every row's FIRST CELL has no top border (reads like a card
//     title), every other cell in every row (including the first row) has
//     one. This is computed by row/column index below rather than via
//     `:first-child`, since combining the two breakpoint rules through
//     CSS pseudo-selectors alone would need cascade tricks that are easy
//     to get subtly wrong — indexing is unambiguous.
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  /** Unique key for this column (also used as the React key). */
  key: string;
  /** Desktop header text AND the default mobile stacked-card label. */
  header: string;
  /** Overrides `header` as the mobile label, if it needs to differ. */
  mobileLabel?: string;
  cell: (row: T) => React.ReactNode;
  /** Native `title` attribute for the cell — e.g. the full item name on a
   *  desktop-truncated column, matching the PHP's `title="..."` on
   *  `.text-truncate` cells. */
  title?: (row: T) => string | undefined;
  align?: "left" | "right";
  /** Applied to the `<th>` and every `<td>` in this column. Use this for
   *  a desktop-only truncate column, e.g. `"md:max-w-[220px] md:truncate"`
   *  — mobile intentionally shows the full value (ported from global.css's
   *  `.table-modern tbody td.text-truncate` mobile override, which undoes
   *  truncation in the card view). */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  emptyMessage?: string;
  /** Optional row-select checkbox column, like Inventory Management's
   *  select-all + per-row checkboxes. Omit for the other 9 tables, which
   *  don't have this. */
  selection?: {
    selectedIds: Set<string | number>;
    onToggleRow: (id: string | number) => void;
    onToggleAll: (checked: boolean) => void;
  };
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  emptyMessage = "No records found.",
  selection,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const allSelected =
    !!selection && rows.length > 0 && selection.selectedIds.size === rows.length;

  return (
    <div className="overflow-x-auto">
      <Table className="w-full table-fixed! md:table-auto! border-separate! border-spacing-0!">
        <TableHeader className="hidden md:table-header-group!">
          <TableRow className="border-b-0! hover:bg-transparent!">
            {selection && (
              <TableHead className="h-auto! w-17.5 px-4! py-4! text-left align-middle!">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={(e) => selection.onToggleAll(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
                  />
                  <span className="text-xs font-bold text-gray-500">
                    ({selection.selectedIds.size})
                  </span>
                </div>
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "h-auto! px-4! py-4! text-left align-middle! text-[0.78rem] font-bold tracking-wide text-gray-500 uppercase",
                  col.align === "right" && "text-right",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row, rowIndex) => {
            const rowId = getRowId(row);
            const isFirstRow = rowIndex === 0;

            return (
              <TableRow
                key={rowId}
                className={cn(
                  // Mobile: bordered, rounded card, stacked with a gap.
                  "mb-3! block! rounded-xl! border! border-[#eef1f5]! px-4! py-1! last:mb-0!",
                  // Desktop: plain row, no card chrome, soft hover tint,
                  // no shadcn default bottom border (we use a top border
                  // on cells instead, per global.css's actual rule).
                  "md:mb-0! md:table-row! md:rounded-none! md:border-0! md:px-0! md:py-0! md:transition-colors! hover:bg-transparent! md:hover:bg-[#f8faf9]!"
                )}
              >
                {selection && (
                  <TableCell
                    data-label="Select"
                    className={cn(
                      "flex items-center justify-between gap-4 py-[0.6rem]! before:content-[attr(data-label)] before:shrink-0 before:text-xs before:font-bold before:tracking-wide before:text-gray-500 before:uppercase md:table-cell! md:w-17.5 md:px-4! md:py-[1.1rem]! md:before:content-none",
                      "border-t! border-[#eef1f5]! first:border-t-0!",
                      isFirstRow ? "md:border-t-0!" : "md:border-t!"
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selection.selectedIds.has(rowId)}
                      onChange={() => selection.onToggleRow(rowId)}
                      className="size-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
                    />
                  </TableCell>
                )}

                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    data-label={col.mobileLabel ?? col.header}
                    title={col.title?.(row)}
                    className={cn(
                      "flex items-center justify-between gap-4 py-[0.6rem]! text-sm font-normal text-[#212529] before:content-[attr(data-label)] before:shrink-0 before:text-xs before:font-bold before:tracking-wide before:text-gray-500 before:uppercase",
                      "md:table-cell! md:px-4! md:py-[1.1rem]! md:before:content-none",
                      "border-t! border-[#eef1f5]! first:border-t-0!",
                      isFirstRow ? "md:border-t-0!" : "md:border-t!",
                      col.align === "right" && "md:text-right",
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — ports `.badge-status-*` exactly (light bg + matching
// saturated text, not a solid dark fill). Used in 7 of the 10 tables'
// Status column. Exact hex values from global.css, not Tailwind's closest
// named shade, so the color actually matches the original design.
// ---------------------------------------------------------------------------

export type BadgeStatus =
  | "available"
  | "unavailable"
  | "borrowed"
  | "returned"
  | "rejected"
  | "overdue"
  | "pending"
  | "approved"
  | "cancelled";

const STATUS_STYLES: Record<BadgeStatus, { bg: string; text: string }> = {
  available: { bg: "#d1fae5", text: "#065f46" },
  unavailable: { bg: "#fee2e2", text: "#991b1b" },
  borrowed: { bg: "#e0e7ff", text: "#4338ca" },
  returned: { bg: "#d1fae5", text: "#065f46" },
  rejected: { bg: "#ffe4e6", text: "#be123c" },
  overdue: { bg: "#ffedd5", text: "#9a3412" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  approved: { bg: "#dbeafe", text: "#1e40af" },
  cancelled: { bg: "#f3f4f6", text: "#4b5563" },
};

interface StatusBadgeProps {
  status: BadgeStatus;
  /** Display label — defaults to the status capitalized, e.g. "Available",
   *  matching the PHP's `ucfirst($row['status'])`. */
  label?: string;
  /** Fixed 100px width so badges line up evenly down a column regardless
   *  of word length — ports `.badge-status-fixed`. */
  fixedWidth?: boolean;
}

export function StatusBadge({ status, label, fixedWidth }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  const text = label ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      style={{ backgroundColor: style.bg, color: style.text }}
      className={cn(
        "inline-block rounded-full px-3 py-1 text-xs",
        fixedWidth && "w-25 text-center"
      )}
    >
      {text}
    </span>
  );
}