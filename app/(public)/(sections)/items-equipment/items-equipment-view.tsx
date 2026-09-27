"use client";

import * as React from "react";
import { Archive, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import type {
  InventoryListItem,
  ItemCategory,
  ItemStatus,
} from "@/lib/repositories/inventory";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useHoverMenu } from "@/hooks/use-hover-menu";

// ---------------------------------------------------------------------------
// The public Items & Equipment catalog. The rows come from the server page
// (getInventoryList() in lib/repositories/inventory.ts, i.e. the
// inventory_items table); this component only owns the filters and the grid.
// Browse-only: no "Borrow" action, unlike the dashboard catalog
// (dashboard/borrower/catalog), since borrowing requires being signed in.
//
// Search, status and category filters run client-side over the fetched list
// (the catalog is small, and it keeps the filters instant). The page is
// force-dynamic, so a change an admin makes shows up on the next load.
//
// Item pictures: `imageUrl` is null until an admin uploads one (Admin → Items),
// so the card shows the icon placeholder. When it is set, the picture is
// shown instead. "No description available." is the PHP's fallback for a
// missing description (MIGRATION_LOGS.md Log 001 #14).
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ItemStatus, string> = {
  available: "Available",
  borrowed: "Borrowed",
  unavailable: "Unavailable",
};

const STATUS_BADGE_CLASSES: Record<ItemStatus, string> = {
  available: "bg-green-100 text-green-700 hover:bg-green-100",
  borrowed: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  unavailable: "bg-slate-200 text-slate-600 hover:bg-slate-200",
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  sports_dev_items_equipment: "SDO Items & Equipment",
  culture_arts_items_equipment: "UCAO Items & Equipment",
};

// Trigger-display labels, including the "all" option — passed explicitly
// as SelectValue's children so the trigger always shows the human-readable
// label instead of falling back to the raw snake_case value.
const STATUS_FILTER_LABELS: Record<ItemStatus | "all", string> = {
  all: "All Status",
  ...STATUS_LABELS,
};

const CATEGORY_FILTER_LABELS: Record<ItemCategory | "all", string> = {
  all: "All Categories",
  ...CATEGORY_LABELS,
};

export function ItemsEquipmentView({ items }: { items: InventoryListItem[] }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ItemStatus | "all">("all");
  const [category, setCategory] = React.useState<ItemCategory | "all">("all");
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [categoryOpen, setCategoryOpen] = React.useState(false);

  // True on devices that can actually hover with a real pointer (desktop),
  // false on touch devices — gates the hover-to-open behavior below so
  // mobile still requires a tap, since it has no hover state to open on.
  const isDesktopHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  // The dropdown menu (SelectContent) renders in a portal, so it isn't a
  // DOM child of the trigger wrapper below — moving the cursor from the
  // trigger into the menu still fires the wrapper's onMouseLeave, which
  // used to close the menu out from under the cursor. Closing on a short
  // delay (instead of instantly) gives the menu's own onMouseEnter a
  // chance to cancel that pending close before it fires.
  const statusHover = useHoverMenu(setStatusOpen, isDesktopHover);
  const categoryHover = useHoverMenu(setCategoryOpen, isDesktopHover);

  const filteredItems = items.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const matchesCategory = category === "all" || item.category === category;
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      item.name.toLowerCase().includes(term) ||
      (item.description ?? "").toLowerCase().includes(term);

    return matchesStatus && matchesCategory && matchesSearch;
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-5">
      <div className="mb-4">
        <h2 className="mb-1 text-2xl font-bold text-green-700">
          Available Items &amp; Equipment
        </h2>
        <p className="mb-0 text-muted-foreground">
          Browse the available items and equipment from the Sports
          Development Office and the University Culture and the Arts Office.
        </p>
      </div>

      {/* Filter & Search bar — same fields as catalog.php's filter-dropdown.js pair + search input.
          Sticky directly below the site header, using the --header-height
          CSS var set by SiteHeader's measured offsetHeight (see
          app/(public)/layout.tsx) instead of a guessed pixel value — the
          previous top-16 guess didn't match the header's real rendered
          height, leaving a gap the scrolling grid peeked through. The
          visual gap below the header is extra top padding on this same
          solid-bg element, not a transparent offset above it. Named
          "sticky-filter-bar" to match the class name index.php used for
          this same element. */}
      <div
        id="sticky-filter-bar"
        className="sticky z-40 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 pt-6 pb-3"
        style={{ top: "var(--header-height, 4rem)" }}
      >
        <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">
          <div
            ref={statusHover.setTriggerRef}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            onMouseEnter={statusHover.onMouseEnter}
            onMouseMove={statusHover.onMouseMove}
            onMouseLeave={statusHover.onMouseLeave}
          >
            <Select
              value={status}
              open={statusOpen}
              onOpenChange={setStatusOpen}
              onValueChange={(value) =>
                setStatus(value as ItemStatus | "all")
              }
            >
              <SelectTrigger className="w-full hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30">
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
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="borrowed">Borrowed</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            ref={categoryHover.setTriggerRef}
            className="min-w-0 flex-1 sm:w-60 sm:flex-none"
            onMouseEnter={categoryHover.onMouseEnter}
            onMouseMove={categoryHover.onMouseMove}
            onMouseLeave={categoryHover.onMouseLeave}
          >
            <Select
              value={category}
              open={categoryOpen}
              onOpenChange={setCategoryOpen}
              onValueChange={(value) =>
                setCategory(value as ItemCategory | "all")
              }
            >
              <SelectTrigger className="w-full hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30">
                <SelectValue placeholder="All Categories" className="truncate">
                  {CATEGORY_FILTER_LABELS[category]}
                </SelectValue>
              </SelectTrigger>
              {/* Bound to the trigger's own width (sm:w-60 above) — now that
                  the labels are short ("SDO Items & Equipment", "UCAO
                  Items & Equipment"), that width is enough to show each
                  option in full without clipping. */}
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
                <SelectItem value="sports_dev_items_equipment">
                  SDO Items &amp; Equipment
                </SelectItem>
                <SelectItem value="culture_arts_items_equipment">
                  UCAO Items &amp; Equipment
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative min-w-72 flex-1 md:flex-none">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30"
          />
        </div>
      </div>

      {/* Item grid */}
      {items.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="No items yet"
          description="No asset items currently found in the system database."
        />
      ) : filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="h-full rounded-2xl border-0! shadow-md"
            >
              <CardHeader className="flex flex-row justify-end pb-0">
                <Badge
                  className={cn(
                    "rounded-full font-semibold",
                    STATUS_BADGE_CLASSES[item.status]
                  )}
                >
                  {STATUS_LABELS[item.status]}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col items-center pt-2 text-center">
                <div className="mb-3 flex size-36 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Archive className="size-10 text-slate-400" />
                  )}
                </div>
                <h3 className="mb-2 font-semibold">{item.name}</h3>
                <p className="mb-0 text-sm text-muted-foreground">
                  {item.description || "No description available."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState variant="no-results" />
      )}
    </div>
  );
}