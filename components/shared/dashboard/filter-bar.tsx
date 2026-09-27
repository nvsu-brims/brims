"use client";

// Real path: components/shared/dashboard/filter-bar.tsx

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FILTER_BAR_CLASSES } from "@/components/shared/dashboard/form-field";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useHoverMenu } from "@/hooks/use-hover-menu";

// ---------------------------------------------------------------------------
// Shared filter/search bar for the dashboard tables that use the "search"
// variant: admin-items-table.tsx, admin-users-table.tsx,
// borrower-catalog-view.tsx. (The "date-range" variant —
// admin-history-table.tsx, admin-logs-table.tsx — has its own DatePicker
// From/To fields and stays inlined in those files rather than going through
// this component; see UI-UX Log 2026-09-25.)
//
// Owns only the filter dropdown(s) + the search input, both sticky below
// the dashboard header (--dashboard-header-height, see header.tsx). Any
// page-specific buttons (Add Item, Add User, bulk Delete, ...) are passed
// in as `actions` and rendered after the search input — FilterBar never
// takes named props for a specific button, since that would make a generic
// UI shell know about domain actions and need a new prop for every future
// button. Each page keeps full ownership of its own button state/logic;
// see UI-UX Log 2026-09-25 for the reasoning.
//
// The hover-open handling (useHoverMenu + useMediaQuery) is the same
// pattern every filter dropdown in the app already used before this
// component existed — centralized here so it isn't hand-copied per page.
//
// Mobile layout (below sm): filters, search and actions regroup into
// distinct rows depending on filter count and action count (1 vs 2 filters;
// 0, 1, or 2+ actions) — see FilterBarProps.actions and the render below for
// the exact grouping, and UI-UX Log 2026-09-25 for the row-by-row mockups.
// `actions` is an array (not a bare ReactNode/fragment) specifically so this
// component can size that grouping off the real action count.
// ---------------------------------------------------------------------------

export interface FilterBarOption {
  value: string;
  label: string;
}

export interface FilterBarFilter {
  /** Currently selected value, including the "all" sentinel if used. */
  value: string;
  onValueChange: (value: string) => void;
  options: FilterBarOption[];
  /** Shown as the SelectValue placeholder (usually "All ..."). */
  placeholder: string;
  /**
   * Responsive width applied to the wrapper around this filter's Select,
   * e.g. "sm:w-40". The Select itself stays w-full inside that wrapper, so
   * this is the one thing that varies per filter/per page (matches each
   * consumer's existing widths: sm:w-40/44/48/60/64).
   */
  widthClassName: string;
  /**
   * Extra className for the SelectValue itself. Only borrower-catalog-view's
   * Category filter uses this today (`"truncate"`, for the longer "SDO
   * Items & Equipment" / "UCAO Items & Equipment" labels) — optional so
   * every other filter can omit it.
   */
  valueClassName?: string;
}

export interface FilterBarProps {
  /** One entry per dropdown. 1 filter (e.g. Users) or 2 (Items/Catalog). */
  filters: FilterBarFilter[];
  search: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  /**
   * Page-specific buttons rendered after the search input (Add Item, Add
   * User, Delete (N), ...). Omit for pages where search sits alone
   * (borrower-catalog-view.tsx today).
   *
   * An array, not a single ReactNode/fragment, because the mobile layout
   * (see the render below) groups search + actions differently depending on
   * how many actions there are (0 / 1 / 2+), and `React.Children.count`
   * can't see through a `<>...</>` fragment passed as one prop value — it
   * always reports 1 regardless of how many elements are inside it. An
   * array is the only way for FilterBar to know the real count without an
   * extra prop that could drift out of sync with the actual buttons passed.
   */
  actions?: React.ReactNode[];
}

export function FilterBar({ filters, search, actions = [] }: FilterBarProps) {
  // True on devices that can actually hover with a real pointer (desktop),
  // false on touch devices — gates the hover-to-open behavior so mobile
  // still requires a tap, since it has no hover state to open on. Same
  // pattern every filter dropdown in the app used before this component
  // existed.
  const isDesktopHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  // One open-state + hover-handler pair per filter, in the same order as
  // `filters`. Hooks are called unconditionally here (not inside the .map
  // below) so the count of hook calls never depends on `filters.length`,
  // which can otherwise change across renders and violate the rules of
  // hooks. FilterBar only ever needs to support the shapes already in use
  // (0 filters for date-range pages that don't use this component, 1 for
  // Users, 2 for Items/Catalog), so a fixed small pool of slots is enough;
  // add another slot here if a future page needs a 3rd filter.
  const [open0, setOpen0] = React.useState(false);
  const [open1, setOpen1] = React.useState(false);
  const opens = [open0, open1];
  const setOpens = [setOpen0, setOpen1];
  const hover0 = useHoverMenu(setOpen0, isDesktopHover);
  const hover1 = useHoverMenu(setOpen1, isDesktopHover);
  const hovers = [hover0, hover1];

  if (filters.length > opens.length) {
    // Loud in dev rather than silently dropping a filter — this is a
    // sign FilterBar needs another slot added above, not a runtime
    // condition any page should hit in normal use.
    console.error(
      `FilterBar: ${filters.length} filters passed, but only ${opens.length} are supported. Add another open-state slot in filter-bar.tsx.`
    );
  }

  return (
    <div
      id="sticky-filter-bar"
      className="sticky z-40 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 pt-6 pb-3 md:-mx-6 md:px-6"
      style={{ top: "var(--dashboard-header-height, 0px)" }}
    >
      {/*
        Mobile (below sm): filters lay out in their own grid row, one column
        per filter (1 filter -> full width, 2 filters -> side by side, each
        taking half the row) — see UI-UX Log for the ASCII mockups this
        matches. At sm+ this reverts to the original flex-wrap behavior,
        each filter sized by its own widthClassName.
      */}
      <div
        className={cn(
          "grid w-full gap-2 sm:flex sm:w-auto sm:flex-none sm:flex-wrap sm:gap-2",
          filters.length === 2 ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {filters.map((filter, index) => (
          <div
            key={index}
            ref={hovers[index]?.setTriggerRef}
            className={cn("min-w-0 sm:flex-none", filter.widthClassName)}
            onMouseEnter={hovers[index]?.onMouseEnter}
            onMouseMove={hovers[index]?.onMouseMove}
            onMouseLeave={hovers[index]?.onMouseLeave}
          >
            <Select
              value={filter.value}
              open={opens[index]}
              onOpenChange={setOpens[index]}
              onValueChange={filter.onValueChange}
            >
              <SelectTrigger className={cn("w-full bg-white", FILTER_BAR_CLASSES)}>
                <SelectValue
                  placeholder={filter.placeholder}
                  className={filter.valueClassName}
                >
                  {filter.options.find((o) => o.value === filter.value)
                    ?.label ?? filter.placeholder}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                ref={hovers[index]?.setContentRef}
                position="popper"
                sideOffset={0}
                className="w-full"
                style={{ width: "var(--anchor-width)" }}
                onMouseEnter={hovers[index]?.onMouseEnter}
                onMouseMove={hovers[index]?.onMouseMove}
                onMouseLeave={hovers[index]?.onMouseLeave}
              >
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/*
        Mobile (below sm): search + actions group differently depending on
        how many actions there are, matching the UI-UX Log mockups —
        - 0 actions: search alone, full width (unchanged from before).
        - 1 action: search and the action share one row (search flexes,
          the action stays its own width).
        - 2+ actions: search takes its own full-width row, then the actions
          get a second row below, split evenly across columns.
        At sm+ this reverts to the original single-row flex behavior.
      */}
      {actions.length >= 2 ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:flex-1 md:w-72 md:flex-none">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              className={cn("bg-white pl-9", FILTER_BAR_CLASSES)}
            />
          </div>

          <div
            className={cn(
              "grid gap-2 sm:flex sm:items-center sm:gap-2",
              actions.length === 2 ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            {actions.map((action, index) => (
              <div key={index} className="*:w-full sm:w-auto sm:*:w-auto">
                {action}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-2 md:flex-none">
          <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              className={cn("bg-white pl-9", FILTER_BAR_CLASSES)}
            />
          </div>

          {actions}
        </div>
      )}
    </div>
  );
}