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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** Terms and Conditions shown from the request form (Plan 2, section 4). Confirmed. */
const TERMS_VERSION = "1.0";
const TERMS_SECTIONS: { title: string; body: string }[] = [
  { title: "Eligibility", body: "Only approved borrowers may request items. You must sign in with your own account and must not share it." },
  { title: "Requests and approval", body: "A request is not confirmed until an admin approves it. Do not collect an item before approval is shown in the system." },
  { title: "Use of items", body: "Use each item only for the purpose you requested. Keep it in good condition and follow any instructions given with it." },
  { title: "Return", body: "Return each item on or before the return date you chose. You are responsible for it until it is returned and checked by an admin." },
  { title: "Damage and loss", body: "Report any damage or loss to the office that issued the item as soon as you notice it. You may be charged for repair or replacement." },
  { title: "Fines", body: "Late return, damage, or loss may result in fines, set by the university's policy. Fines are not calculated by this system." },
  { title: "Personal data", body: "Your information is handled as described in the Data Privacy Notice shown at sign-up." },
  { title: "Changes", body: "The University Sports & Development Office (SDO) and the University Culture and the Arts Office (UCAO) may update these terms. Continued use after an update means you accept the new terms." },
];

/** A list row plus whether THIS borrower already has a pending request on it. */
type CatalogItem = InventoryListItem & { hasPendingRequest: boolean };

const OUT_OF_STOCK_BADGE_CLASSES = "bg-amber-100 text-amber-700";

/** Badge text: "Available (n)" while units are free, "Out of stock" at zero. */
function availabilityLabel(item: CatalogItem): string {
  if (item.status === "available") {
    return item.availableQuantity > 0
      ? `Available (${item.availableQuantity})`
      : "Out of stock";
  }
  return STATUS_LABELS[item.status];
}

function availabilityBadgeClasses(item: CatalogItem): string {
  if (item.status === "available" && item.availableQuantity === 0) {
    return OUT_OF_STOCK_BADGE_CLASSES;
  }
  return STATUS_BADGE_CLASSES[item.status];
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  available: "Available",
  borrowed: "Borrowed",
  unavailable: "Unavailable",
  out_of_stock: "Out of stock",
};

const STATUS_BADGE_CLASSES: Record<ItemStatus, string> = {
  available: "bg-green-100 text-green-700 hover:bg-green-100",
  borrowed: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  unavailable: "bg-slate-200 text-slate-600 hover:bg-slate-200",
  out_of_stock: "bg-amber-100 text-amber-700 hover:bg-amber-100",
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
  // Plan 2: the Terms checkbox gates submission. Not stored anywhere.
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [requestQuantity, setRequestQuantity] = React.useState("1");
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [activeItem, setActiveItem] = React.useState<CatalogItem | null>(
    null
  );
  const [returnDate, setReturnDate] = React.useState("");
  const [pickUpDate, setPickUpDate] = React.useState("");

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
    setTermsAccepted(false);
    setRequestQuantity("1");
    setBorrowDialogOpen(true);
  }

  const requestQuantityNumber = Number(requestQuantity);
  const isRequestQuantityValid =
    Number.isInteger(requestQuantityNumber) &&
    requestQuantityNumber >= 1 &&
    requestQuantityNumber <= (activeItem?.availableQuantity ?? 0);

  const depositTotal =
    activeItem?.cashDeposit != null && isRequestQuantityValid
      ? activeItem.cashDeposit * requestQuantityNumber
      : null;
  const depositDisplay =
    activeItem?.cashDeposit == null
      ? "Deposit not set"
      : depositTotal == null
        ? "—"
        : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(depositTotal);

  const pickUpValue = pickUpDate || today;
  const isPickUpValid = pickUpValue >= today && (!returnDate || pickUpValue < returnDate);

  function handleSubmitBorrowRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem || isSubmitting) return;

    const itemId = activeItem.id;
    setDialogError(null);
    startTransition(async () => {
      const result = await submitBorrowRequestAction({
        itemId,
        expectedReturnDate: returnDate,
        pickUpDate: pickUpValue,
        acceptedTerms: termsAccepted,
        quantity: requestQuantityNumber,
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

  // Alphabetical, like the public Items & Equipment page.
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const filteredItems = sortedItems.filter((item) => {
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
          Items and equipment from SDO and UCAO.
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
                label: "USDO Equipment",
              },
              {
                value: "culture_arts_items_equipment",
                label: "UCAO Items",
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
              className="flex h-full flex-col rounded-2xl border-0! shadow-md"
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
                      availabilityBadgeClasses(item)
                    )}
                  >
                    {availabilityLabel(item)}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-center pt-2 text-center">
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
              <CardFooter className="mt-auto border-t-0 bg-transparent">
                {item.hasPendingRequest ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full rounded-lg border-0 bg-blue-100 font-semibold text-blue-700 disabled:opacity-100"
                  >
                    Request Pending
                  </Button>
                ) : (item.status === "available" && item.availableQuantity === 0) || item.status === "out_of_stock" ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full rounded-lg border-0 bg-amber-100 font-semibold text-amber-700 disabled:opacity-100"
                  >
                    Out of Stock
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
        size="lg"
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
              disabled={
              isSubmitting ||
              !termsAccepted ||
              !isRequestQuantityValid ||
              !isPickUpValid ||
              activeItem?.cashDeposit == null
            }
              className="rounded-md bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        }
      >
        <form id="borrow-request-form" onSubmit={handleSubmitBorrowRequest}>
          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Request Date" htmlFor="borrowRequestDate">
                <Input
                  id="borrowRequestDate"
                  value={requestDateDisplay}
                  readOnly
                  disabled
                />
              </FormField>

              <FormField label="Pick-up Date" htmlFor="borrowPickUpDate">
                <DatePicker
                  id="borrowPickUpDate"
                  required
                  min={today}
                  value={pickUpValue}
                  onChange={setPickUpDate}
                  className="w-full"
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

              <FormField label="Borrowed Item" htmlFor="borrowedItemName">
                <Input
                  id="borrowedItemName"
                  value={activeItem?.name ?? ""}
                  readOnly
                  disabled
                />
              </FormField>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="requestQuantity" className="text-sm font-medium">
                  Quantity
                </label>
                <span className="text-xs text-muted-foreground">
                  Available: {activeItem?.availableQuantity ?? 0}
                </span>
              </div>
                <Input
                  id="requestQuantity"
                  type="number"
                  min={1}
                  max={activeItem?.availableQuantity ?? 1}
                  step={1}
                  value={requestQuantity}
                  onChange={(event) => setRequestQuantity(event.target.value)}
                  className="bg-white"
                />
              </div>
              <FormField label="Cash Deposit" htmlFor="cashDepositTotal">
                <Input id="cashDepositTotal" value={depositDisplay} readOnly disabled />
              </FormField>
            </div>

            <div
              role="note"
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
            >
              Admin approval required. Cancelled if not picked up on the pick-up date.
              Late return, damage, or loss may incur fines. Deposits are paid in person and refunded on return.
            </div>

            <div className="mt-6 flex items-start gap-3">
              <Checkbox
                id="borrowTermsAccepted"
                checked={termsAccepted}
                onCheckedChange={(value) => setTermsAccepted(value === true)}
                className="mt-1 size-4 border-gray-400 data-[state=checked]:border-green-700 data-[state=checked]:bg-green-700 data-[state=checked]:text-white"
              />
              <Label
                htmlFor="borrowTermsAccepted"
                className="text-sm font-normal leading-snug"
              >
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="font-semibold text-green-700 underline underline-offset-4 hover:text-green-800"
                >
                  Terms and Conditions
                </button>
                .
              </Label>
            </div>
          </div>
        </form>
      </FormDialogShell>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="border-2 border-gray-300 bg-gray-50 p-0 text-green-900 sm:max-w-2xl">
          <DialogHeader className="border-b border-gray-300 px-8 py-5">
            <DialogTitle className="text-green-900">
              Terms and Conditions
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-8 py-5 text-sm leading-relaxed text-gray-700">
            {TERMS_SECTIONS.map((section, index) => (
              <p key={section.title} className="mb-0">
                <span className="font-semibold text-green-900">
                  {index + 1}. {section.title}.
                </span>{" "}
                {section.body}
              </p>
            ))}
          </div>
          <div className="border-t border-gray-300 px-8 py-4 text-sm text-gray-600">
            Last updated: Version {TERMS_VERSION}, November 7, 2026
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}