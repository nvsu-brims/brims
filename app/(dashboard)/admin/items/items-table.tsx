"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, Image as ImageIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import { FormDialogShell } from "@/components/shared/dashboard/form-dialog";
import { FilterBar } from "@/components/shared/dashboard/filter-bar";
import {
  FormField,
  FIELD_FOCUS_RING_CLASSES,
} from "@/components/shared/dashboard/form-field";
import { cn } from "@/lib/utils";
import type { Office } from "@/lib/roles";
import type {
  InventoryListItem,
  ItemCategory,
  ItemStatus,
} from "@/lib/repositories/inventory";
import {
  addItemAction,
  deleteItemAction,
  deleteItemsAction,
  editItemAction,
  type ItemActionResult,
} from "./actions";

const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// The admin Items table. The rows come from the server page
// (getInventoryList($conn, 'name', $adminOffice) ported to
// lib/repositories/inventory.ts); Add, Edit and Delete call the Server Actions
// in ./actions, which re-check that the caller is an admin and, for an SDO or
// UCAO admin, that the item is in their office. After an action succeeds it
// revalidates the routes, and router.refresh() re-renders this table from the
// database.
//
// Same shared DataTable shell as the borrower dashboard's tables
// (catalog/requests/borrowed-items/history) - see
// components/shared/dashboard/data-table.tsx.
//
// Bulk select ports the PHP's #selectAllItems + row-checkbox + toolbar
// Delete button pattern via DataTable's `selection` prop. The toolbar Delete
// button is disabled until at least one row is selected, matching the PHP's
// #toolbarDeleteBtn disabled-by-default state.
//
// Office column and the Office field in Add Item are admin-office-conditional,
// as in the PHP (`$adminOffice === null`): only a super admin sees the column
// (a scoped admin only ever sees their own office's items), and a scoped
// admin's Add Item is fixed to their own office.
//
// Add Item and Edit Item are both inlined in this file (their own form state,
// fields, and submit handling), built on the shared FormDialogShell
// (components/shared/dashboard/form-dialog.tsx) for just the dialog chrome.
// Add Item is the port of #addItemModal (Name, Category, Office, Status,
// Picture, Description); Edit Item is the port of #editNameModal, a
// deliberately reduced 3-field form (Name/Status/Picture), pre-filled from the
// clicked row. Row Delete and the bulk toolbar Delete route through the shared
// ConfirmDialog.
//
// Item PICTURES: the forms send the picked file to the Server Actions in
// FormData. The server validates it (10MB max, real PNG/JPEG), uploads it to
// the public `item-images` Supabase Storage bucket and saves the URL in
// `imageUrl`. The 10MB check here is only a UX nicety to fail fast.
// Activity-log rows for item changes are written by addItemAction /
// editItemAction in actions.ts (via lib/repositories/activity-logs.ts).
// ---------------------------------------------------------------------------

type ItemOffice = Office;

const STATUS_LABELS: Record<ItemStatus, string> = {
  available: "Available",
  borrowed: "Borrowed",
  unavailable: "Unavailable",
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  sports_dev_items_equipment: "SDO Items & Equipment",
  culture_arts_items_equipment: "UCAO Items & Equipment",
};

const OFFICE_LABELS: Record<ItemOffice, string> = {
  sports_dev: "Sports Development Office",
  culture_arts: "University Culture & the Arts Office",
};

/** The UI category an item in this office gets (mirrors the repository). */
function categoryForOffice(office: ItemOffice): ItemCategory {
  return office === "sports_dev"
    ? "sports_dev_items_equipment"
    : "culture_arts_items_equipment";
}

// Add Item's default field values, reset into on every open.
const ADD_ITEM_EMPTY = {
  name: "",
  office: "sports_dev" as ItemOffice,
  status: "available" as ItemStatus,
  description: "",
};

export function ItemsTable({
  items,
  scopedOffice,
}: {
  items: InventoryListItem[];
  /** The signed-in admin's office; null = super admin (every office). */
  scopedOffice: Office | null;
}) {
  const router = useRouter();
  const showOffice = scopedOffice === null;
  const [isPending, startTransition] = React.useTransition();
  // Inline error for the Add/Edit dialogs specifically — those stay open
  // on failure so the user can fix the form and resubmit, so their error
  // needs to render inside the still-open dialog, not just as a toast
  // that can appear behind/outside it. Delete/Bulk Delete close their
  // confirm dialog immediately regardless of outcome, so a toast alone
  // is enough for those.
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Run a Server Action, toast its result, and refresh the table. Pass
  // `showInDialog: true` for an action whose dialog stays open on
  // failure (Add/Edit) so the error also renders inline there.
  function run(
    action: () => Promise<ItemActionResult>,
    successMessage: string,
    onSuccess?: () => void,
    options?: { showInDialog?: boolean }
  ) {
    if (options?.showInDialog) setDialogError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        if (options?.showInDialog) setDialogError(result.error);
        router.refresh();
        return;
      }
      toast.success(successMessage);
      onSuccess?.();
      router.refresh();
    });
  }

  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ItemStatus | "all">("all");
  const [category, setCategory] = React.useState<ItemCategory | "all">("all");
  const [pickedIds, setSelectedIds] = React.useState<Set<string | number>>(
    new Set()
  );
  // Row currently targeted by the single-item Delete confirm dialog.
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryListItem | null>(null);
  // Whether the toolbar "Delete (N)" confirm dialog (bulk delete) is open —
  // ports admin_dashboard.php's bulkDeleteForm submit handler / shared
  // actionConfirmModal ("Delete Selected Items" / "Delete N item(s)? This
  // can't be undone.").
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);

  // ---- Add Item form state (inlined, was AddItemDialog) ----
  const [addItemOpen, setAddItemOpen] = React.useState(false);
  const [addName, setAddName] = React.useState(ADD_ITEM_EMPTY.name);
  const [addOffice, setAddOffice] = React.useState<ItemOffice>(
    scopedOffice ?? ADD_ITEM_EMPTY.office,
  );
  const [addStatus, setAddStatus] = React.useState<ItemStatus>(
    ADD_ITEM_EMPTY.status,
  );
  const [addDescription, setAddDescription] = React.useState(
    ADD_ITEM_EMPTY.description,
  );
  const [addPicture, setAddPicture] = React.useState<File | null>(null);
  const [addPreviewUrl, setAddPreviewUrl] = React.useState<string | null>(
    null,
  );
  const addFileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset Add Item's form every time it opens fresh — mirrors the PHP's
  // modal starting blank on each "Add Item" click (unlike Edit Item,
  // which pre-fills). Done in the click handler rather than an effect, so
  // the reset runs once, in response to the click, with no extra render.
  function openAddItem() {
    setAddName(ADD_ITEM_EMPTY.name);
    setAddOffice(scopedOffice ?? ADD_ITEM_EMPTY.office);
    setAddStatus(ADD_ITEM_EMPTY.status);
    setAddDescription(ADD_ITEM_EMPTY.description);
    setAddPicture(null);
    setAddPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (addFileInputRef.current) addFileInputRef.current.value = "";
    setDialogError(null);
    setAddItemOpen(true);
  }

  React.useEffect(() => {
    return () => {
      if (addPreviewUrl) URL.revokeObjectURL(addPreviewUrl);
    };
  }, [addPreviewUrl]);

  const handleAddPictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAddPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setAddPicture(file);
  };

  const handleRemoveAddPicture = () => {
    setAddPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAddPicture(null);
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  };

  const isAddValid = addName.trim().length > 0;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddValid) return;
    // The category is derived from the office in the repository. The picture
    // (optional) travels in the FormData and is re-validated server-side.
    if (addPicture && addPicture.size > MAX_PICTURE_BYTES) {
      setDialogError("The picture must be 10MB or smaller.");
      return;
    }
    const formData = new FormData();
    formData.set("name", addName);
    formData.set("description", addDescription);
    formData.set("office", addOffice);
    formData.set("status", addStatus);
    if (addPicture) formData.set("picture", addPicture);
    run(
      () => addItemAction(formData),
      "Item added",
      () => setAddItemOpen(false),
      { showInDialog: true }
    );
  };

  // ---- Edit Item form state (inlined, was EditItemDialog) ----
  const [editTarget, setEditTarget] = React.useState<InventoryListItem | null>(
    null,
  );
  const [editName, setEditName] = React.useState("");
  const [editStatus, setEditStatus] = React.useState<ItemStatus>("available");
  const [editPicture, setEditPicture] = React.useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = React.useState<string | null>(
    null,
  );
  const editFileInputRef = React.useRef<HTMLInputElement>(null);

  // Populate from the target row every time Edit Item opens on a new row —
  // mirrors the PHP's edit-name-btn click handler reading
  // dataset.name/status/image into the modal's fields. Done in the click
  // handler rather than an effect (no extra render).
  function openEditItem(row: InventoryListItem) {
    setEditName(row.name);
    setEditStatus(row.status);
    setEditPicture(null);
    setEditPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return row.imageUrl ?? null;
    });
    if (editFileInputRef.current) editFileInputRef.current.value = "";
    setDialogError(null);
    setEditTarget(row);
  }

  React.useEffect(() => {
    return () => {
      if (editPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(editPreviewUrl);
    };
  }, [editPreviewUrl]);

  const handleEditPictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setEditPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : (editTarget?.imageUrl ?? null);
    });
    setEditPicture(file);
  };

  const isEditValid = editName.trim().length > 0;

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditValid || !editTarget) return;
    const id = editTarget.id;
    // The picture is sent only when a NEW file was picked; otherwise the
    // server keeps the current one.
    if (editPicture && editPicture.size > MAX_PICTURE_BYTES) {
      setDialogError("The picture must be 10MB or smaller.");
      return;
    }
    const formData = new FormData();
    formData.set("id", String(id));
    formData.set("name", editName);
    formData.set("status", editStatus);
    if (editPicture) formData.set("picture", editPicture);
    run(
      () => editItemAction(formData),
      "Item updated",
      () => setEditTarget(null),
      { showInDialog: true }
    );
  };

  // Selected ids, minus any whose rows are gone (deleted here or by another
  // admin), so "Delete (N)" never counts rows that no longer exist. Derived
  // during render instead of pruned in an effect, so it is never out of date.
  const selectedIds = React.useMemo(() => {
    const live = new Set(items.map((i) => i.id));
    return new Set([...pickedIds].filter((id) => live.has(Number(id))));
  }, [pickedIds, items]);

  const filteredItems = items.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const matchesCategory = category === "all" || item.category === category;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || item.name.toLowerCase().includes(term);
    return matchesStatus && matchesCategory && matchesSearch;
  });

  function toggleRow(id: string | number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(
      checked ? new Set(filteredItems.map((i) => i.id)) : new Set()
    );
  }

  const columns: DataTableColumn<InventoryListItem>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => row.name,
      title: (row) => row.name,
      className: "md:max-w-[220px] md:truncate",
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => CATEGORY_LABELS[row.category],
    },
    ...(showOffice
      ? [
          {
            key: "office",
            header: "Office",
            cell: (row: InventoryListItem) => OFFICE_LABELS[row.office],
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} fixedWidth />,
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
                variant="outline"
                size="sm"
                className="rounded-md! border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={() => openEditItem(row)}
              >
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md! border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Inventory Management
        </h3>
        <p className="mb-0 text-muted-foreground">
          View items, add new ones, rename or change the status of an item,
          or remove items from the inventory.
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
            widthClassName: "sm:w-64",
          },
        ]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search items...",
        }}
        actions={[
          <Button
            key="add-item"
            type="button"
            className="shrink-0 rounded-md! bg-green-600 font-semibold hover:bg-green-700"
            onClick={openAddItem}
          >
            <Plus className="size-4" />
            Add Item
          </Button>,
          <Button
            key="bulk-delete"
            type="button"
            variant="outline"
            disabled={selectedIds.size === 0}
            className="w-27.5 shrink-0 rounded-md! border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>,
        ]}
      />

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={filteredItems}
          getRowId={(row) => row.id}
          emptyMessage="No items found."
          selection={{
            selectedIds,
            onToggleRow: toggleRow,
            onToggleAll: toggleAll,
          }}
        />
      </div>

      {/* Add Item — shadcn/ui port of admin_dashboard.php's #addItemModal. */}
      <FormDialogShell
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        title="Add New Asset Item"
        description="Fill in the details below to add a new item to the inventory."
        icon={<Box className="size-5" />}
        size="lg"
        footer={
          <div className="px-5 py-4">
            <Button
              type="submit"
              form="add-item-form"
              disabled={!isAddValid || isPending}
              className="w-full rounded-md! bg-green-600 font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Box className="size-4" />
              Add Item to Inventory
            </Button>
          </div>
        }
      >
        <form id="add-item-form" onSubmit={handleAddSubmit}>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            {dialogError && (
              <p
                role="alert"
                className="mb-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {dialogError}
              </p>
            )}

            <FormField label="Item Name" htmlFor="itemName">
              <Input
                id="itemName"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Enter item name"
                className={FIELD_FOCUS_RING_CLASSES}
                required
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Category is not chosen separately: it follows the office
                  (SDO office -> "SDO Items & Equipment", UCAO office ->
                  "UCAO Items & Equipment"; see lib/repositories/inventory.ts),
                  so it is shown read-only instead of as a control that
                  would not change what is saved. */}
              <FormField label="Category">
                <Input
                  value={CATEGORY_LABELS[categoryForOffice(addOffice)]}
                  readOnly
                  tabIndex={-1}
                  className="cursor-default bg-slate-50 text-muted-foreground focus-visible:ring-0"
                />
              </FormField>

              {showOffice && (
                <FormField label="Office">
                  <Select
                    value={addOffice}
                    onValueChange={(value) =>
                      setAddOffice((value as ItemOffice) ?? addOffice)
                    }
                  >
                    <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                      <SelectValue>{OFFICE_LABELS[addOffice]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="w-full"
                      style={{ width: "var(--anchor-width)" }}
                    >
                      <SelectItem value="sports_dev">
                        Sports Development Office
                      </SelectItem>
                      <SelectItem value="culture_arts">
                        University Culture &amp; the Arts Office
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Status">
                <Select
                  value={addStatus}
                  onValueChange={(value) =>
                    setAddStatus((value as ItemStatus) ?? addStatus)
                  }
                >
                  <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                    <SelectValue>{STATUS_LABELS[addStatus]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="w-full"
                    style={{ width: "var(--anchor-width)" }}
                  >
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="borrowed">Borrowed</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Item Picture" htmlFor="itemPicture">
                <Input
                  ref={addFileInputRef}
                  id="itemPicture"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleAddPictureChange}
                  className={FIELD_FOCUS_RING_CLASSES}
                />
                {addPreviewUrl && (
                  <div className="relative mt-2 w-25">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={addPreviewUrl}
                      alt="Preview"
                      className="rounded-lg border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveAddPicture}
                      aria-label="Remove picture"
                      className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-red-600 text-gray-50 hover:bg-red-700"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
                {!addPreviewUrl && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="size-3.5" /> PNG or JPEG
                  </p>
                )}
              </FormField>
            </div>

            <FormField label="Item Description" htmlFor="description">
              <Textarea
                id="description"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Enter item description"
                rows={3}
                className={FIELD_FOCUS_RING_CLASSES}
              />
            </FormField>
          </div>
        </form>
      </FormDialogShell>

      {/* Edit Item — shadcn/ui port of admin_dashboard.php's
          #editNameModal (a deliberately reduced 3-field form: Name,
          Status, Picture only — Category/Office aren't editable here). */}
      <FormDialogShell
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        title="Edit Item"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-item-form"
              disabled={!isEditValid || isPending}
              className="rounded-md! bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <form id="edit-item-form" onSubmit={handleEditSubmit}>
          <div className="space-y-4 px-5 py-4">
            {dialogError && (
              <p
                role="alert"
                className="mb-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {dialogError}
              </p>
            )}

            <FormField label="Item Name" htmlFor="editNameInput">
              <Input
                id="editNameInput"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={FIELD_FOCUS_RING_CLASSES}
                required
              />
            </FormField>

            <FormField label="Status">
              <Select
                value={editStatus}
                onValueChange={(value) =>
                  setEditStatus((value as ItemStatus) ?? editStatus)
                }
              >
                <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                  <SelectValue>{STATUS_LABELS[editStatus]}</SelectValue>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  className="w-full"
                  style={{ width: "var(--anchor-width)" }}
                >
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="borrowed">Borrowed</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Item Picture" htmlFor="editPictureInput">
              {editPreviewUrl && (
                <div className="mb-2 w-25">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={editPreviewUrl}
                    alt="Current picture"
                    className="rounded-lg border border-slate-200 object-cover"
                  />
                </div>
              )}
              <Input
                ref={editFileInputRef}
                id="editPictureInput"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleEditPictureChange}
                className={FIELD_FOCUS_RING_CLASSES}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the current picture.
              </p>
            </FormField>
          </div>
        </form>
      </FormDialogShell>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Item"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            const id = deleteTarget.id;
            run(() => deleteItemAction(id), "Item deleted");
          }
          setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete Selected Items"
        description={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "item" : "items"}? This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const ids = Array.from(selectedIds).map(Number);
          run(
            () => deleteItemsAction(ids),
            ids.length === 1 ? "Item deleted" : "Items deleted",
            () => setSelectedIds(new Set())
          );
          setBulkDeleteOpen(false);
        }}
      />
    </div>
  );
}