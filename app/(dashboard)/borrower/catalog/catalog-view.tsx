"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialogShell } from "@/components/shared/dashboard/form-dialog";
import { FilterBar } from "@/components/shared/dashboard/filter-bar";
import { FormField } from "@/components/shared/dashboard/form-field";
import { DatePicker } from "@/components/shared/dashboard/date-picker";
import type {
  InventoryListItem,
  ItemCategory,
  ItemStatus,
} from "@/lib/repositories/inventory";
import { submitBorrowRequestAction } from "./actions";
import { addDaysIso, formatDate, todayIso } from "@/lib/dates";

// ---------------------------------------------------------------------------
// The borrower-dashboard Items catalog. The rows come from the server page
// (getInventoryList(null, "newest") and getUserPendingItemIds() in
// lib/repositories/inventory.ts, i.e. the inventory_items table, plus this
// borrower's pending requests); this component only owns the filters, the grid
// and the borrow dialog.
//
// This page is the borrower-dashboard twin of the public
// app/(public)/items-equipment page: same filter/search bar, same card
// grid/status badge/empty-state pattern. The one addition here is the Borrow
// Item button + request modal, ported from borrower_dashboard.php's
// .borrow-item-btn click handler and #borrowConfirmModal. Built on the shared
// FormDialogShell (components/shared/dashboard/form-dialog.tsx) and FormField
// (components/shared/dashboard/form-field.tsx), the same components the admin
// dashboard's Add/Edit Item/User forms use.
//
// Per-item borrow gating ports the PHP's three-way button/badge switch
// exactly:
//   - hasPendingRequest (this borrower already has a pending request on
//     this item) -> badge "Pending" / button "Request Pending" (disabled)
//   - status === "available" -> normal badge / active "Borrow Item" button
//   - otherwise (borrowed / unavailable) -> normal badge / "Not Available"
//     (disabled)
// hasPendingRequest is per-borrower (mirrors $userPendingItemIds), so it
// overrides the button/badge but never the underlying status filter value:
// other borrowers still see the item's real status.
//
// "Submit Request" calls submitBorrowRequestAction (./actions.ts), which ports
// handleSubmitBorrowRequest(): the return date must be a real date after
// today, the item must still be `available`, and the borrower must not already
// have a pending request on it. On success the dialog closes, a success
// toast fires and the page refreshes, so the card flips to "Request
// Pending" (hasPendingRequest is a real query). A failure keeps the dialog
// open with the message inside it. The `borrow_requested` activity-log row
// is written by submitBorrowRequestAction (./actions.ts); the admin-side
// approve / reject runs against the real database (see
// lib/repositories/borrowings.ts).
// ---------------------------------------------------------------------------

/** A list row plus whether THIS borrower already has a pending request on it. */
type CatalogItem = InventoryListItem & { hasPendingRequest: boolean };

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

const PENDING_BADGE_CLASSES =
  "bg-blue-100 text-blue-700 hover:bg-blue-100";

export function CatalogView({ items }: { items: CatalogItem[] }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ItemStatus | "all">("all");
  const [category, setCategory] = React.useState<ItemCategory | "all">("all");

  const router = useRouter();
  const [isSubmitting, startTransition] = React.useTransition();
  // Result of the last submit: success is a toast (see
  // handleSubmitBorrowRequest), failure stays inline inside the still-open
  // dialog since the borrower's attention — and the field to fix — is there.
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Borrow request modal state — mirrors #borrowConfirmModal.
  const [borrowDialogOpen, setBorrowDialogOpen] = React.useState(false);
  const [activeItem, setActiveItem] = React.useState<CatalogItem | null>(
    null
  );
  const [returnDate, setReturnDate] = React.useState("");

  // "Today" is Manila's calendar day (lib/dates.ts), the same day the server
  // uses to reject a return date that is not after today, so the earliest date
  // the picker offers is always one the server accepts, whatever zone the
  // browser is in. The offsets are added to the date string, not to a Date.
  const today = React.useMemo(() => todayIso(), []);
  const requestDateDisplay = React.useMemo(() => formatDate(today), [today]);
  const minReturnDate = React.useMemo(() => addDaysIso(today, 1), [today]);
  const defaultReturnDate = React.useMemo(() => addDaysIso(today, 7), [today]);

  function openBorrowDialog(item: CatalogItem) {
    setActiveItem(item);
    setReturnDate(defaultReturnDate);
    setDialogError(null);
    setBorrowDialogOpen(true);
  }

  function handleSubmitBorrowRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem || isSubmitting) return;

    const itemId = activeItem.id;
    setDialogError(null);
    startTransition(async () => {
      const result = await submitBorrowRequestAction({
        itemId,
        expectedReturnDate: returnDate,
      });
      if (result.ok) {
        setBorrowDialogOpen(false);
        toast.success("Request submitted");
      } else {
        setDialogError(result.error);
      }
      // Success: the card flips to "Request Pending". Failure: the item may
      // have just been taken or removed, so show its real status.
      router.refresh();
    });
  }

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
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Borrow Items
        </h3>
        <p className="mb-0 text-muted-foreground">
          Available items and equipment from SDO and UCAO.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            value: status,
            onValueChange: (value) => setStatus(value as ItemStatus | "all"),
            options: [
              { value: "all", label: "All Status" },
              { value: "available", label: "Available" },
              { value: "borrowed", label: "Borrowed" },
              { value: "unavailable", label: "Unavailable" },
            ],
            placeholder: "All Status",
            widthClassName: "sm:w-40",
          },
          {
            value: category,
            onValueChange: (value) =>
              setCategory(value as ItemCategory | "all"),
            options: [
              { value: "all", label: "All Categories" },
              {
                value: "sports_dev_items_equipment",
                label: "SDO Items & Equipment",
              },
              {
                value: "culture_arts_items_equipment",
                label: "UCAO Items & Equipment",
              },
            ],
            placeholder: "All Categories",
            widthClassName: "sm:w-60",
            valueClassName: "truncate",
          },
        ]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search items...",
        }}
      />

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
                {item.hasPendingRequest ? (
                  <Badge
                    className={cn(
                      "rounded-full font-semibold",
                      PENDING_BADGE_CLASSES
                    )}
                  >
                    Pending
                  </Badge>
                ) : (
                  <Badge
                    className={cn(
                      "rounded-full font-semibold",
                      STATUS_BADGE_CLASSES[item.status]
                    )}
                  >
                    {STATUS_LABELS[item.status]}
                  </Badge>
                )}
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
              <CardFooter className="border-t-0 bg-transparent">
                {item.hasPendingRequest ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full rounded-lg border-0 bg-blue-100 font-semibold text-blue-700 disabled:opacity-100"
                  >
                    Request Pending
                  </Button>
                ) : item.status === "available" ? (
                  <Button
                    onClick={() => openBorrowDialog(item)}
                    className="w-full rounded-lg bg-green-600 font-semibold hover:bg-green-700"
                  >
                    Borrow Item
                    <BookOpen className="ml-1 size-4" />
                  </Button>
                ) : item.status === "borrowed" ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full rounded-lg border-0 bg-amber-100 font-semibold text-amber-700 disabled:opacity-100"
                  >
                    Borrowed
                  </Button>
                ) : (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full rounded-lg border-0 bg-slate-200 font-semibold text-slate-600 disabled:opacity-100"
                  >
                    Not Available
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState variant="no-results" />
      )}

      {/* Borrow request modal — ports borrower_dashboard.php's
          #borrowConfirmModal. Request Date is shown read-only for context
          (requested_at is always stamped by the database, never sent
          from here); Return Date is the one field
          the borrower actually fills in, bounded to start tomorrow and
          defaulted a week out. */}
      <FormDialogShell
        open={borrowDialogOpen}
        onOpenChange={(open) => {
          setBorrowDialogOpen(open);
          if (!open) setDialogError(null);
        }}
        title="Borrow Request Form"
        description={`Request to borrow "${activeItem?.name}"`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              disabled={isSubmitting}
              onClick={() => setBorrowDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="borrow-request-form"
              disabled={isSubmitting}
              className="rounded-md bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        }
      >
        <form id="borrow-request-form" onSubmit={handleSubmitBorrowRequest}>
          <div className="space-y-4 px-5 py-4">
            <FormField label="Request Date" htmlFor="borrowRequestDate">
              <Input
                id="borrowRequestDate"
                value={requestDateDisplay}
                readOnly
                disabled
              />
            </FormField>

            <FormField label="Return Date" htmlFor="borrowReturnDate">
              <DatePicker
                id="borrowReturnDate"
                required
                min={minReturnDate}
                value={returnDate}
                onChange={setReturnDate}
                className="w-full"
              />
            </FormField>

            {dialogError && (
              <p
                role="alert"
                className="mb-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {dialogError}
              </p>
            )}

            <p className="mb-0 text-sm text-muted-foreground">
              An admin will need to approve this before you can pick up
              the item.
            </p>
          </div>
        </form>
      </FormDialogShell>
    </div>
  );
}