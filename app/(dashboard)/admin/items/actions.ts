"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdminAction } from "@/lib/require-admin";
import type { Office } from "@/lib/roles";
import {
  createItem,
  deleteItem,
  getItemEditAccess,
  updateItem,
  type ItemStatus,
} from "@/lib/repositories/inventory";
import { logActivity } from "@/lib/repositories/activity-logs";
import { autoRejectPendingRequestsForItem } from "@/lib/repositories/borrowings";
import { notifyRequestsAutoRejected } from "@/lib/email/notify";
import {
  deleteItemImageByUrl,
  uploadItemImage,
  validateItemImage,
} from "@/lib/storage/item-images";

export type ItemActionResult = { ok: true } | { ok: false; error: string };

// Add and Edit take FormData (not a plain object) because they may carry a
// picture File. Fields:
//   add:  name, description, office, status, picture?
//   edit: id, name, status, picture?
// The picture is validated server-side (10MB max, real PNG/JPEG by magic
// bytes) before anything is written. Failure policy is HARD-FAIL: if the
// picture is invalid or the upload fails, the whole add/edit fails and
// nothing is left half-saved (a just-created row is rolled back).

const ITEM_STATUSES: ItemStatus[] = ["available", "borrowed", "unavailable"];
const OFFICES: Office[] = ["sports_dev", "culture_arts"];

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readPicture(formData: FormData): File | null {
  const value = formData.get("picture");
  return value instanceof File && value.size > 0 ? value : null;
}

function revalidateItemPaths() {
  revalidatePath("/admin/items");
  revalidatePath("/");
  revalidatePath("/items-equipment");
}

export async function addItemAction(formData: FormData): Promise<ItemActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const name = readString(formData, "name").trim();
  const description = readString(formData, "description").trim();
  const office = readString(formData, "office") as Office;
  const status = readString(formData, "status") as ItemStatus;
  const picture = readPicture(formData);

  if (!name) return { ok: false, error: "Item name is required." };
  if (!OFFICES.includes(office)) return { ok: false, error: "Invalid office." };
  if (!ITEM_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };

  // A scoped admin can only add items to their own office.
  if (caller.office && office !== caller.office) {
    return { ok: false, error: "You can only add items to your own office." };
  }

  // Validate BEFORE creating the row, so a bad file never leaves anything behind.
  const image = picture ? await validateItemImage(picture) : null;
  if (image && !image.ok) return { ok: false, error: image.error };

  const id = await createItem({
    name,
    description: description || null,
    office,
    status,
    imageUrl: null,
  });

  if (image?.ok) {
    // The filename needs the item id, so the row is created first, then the
    // picture is uploaded and its public URL written back.
    const uploaded = await uploadItemImage(id, image);
    if (!uploaded.ok) {
      await deleteItem(id, caller.office); // hard-fail: roll the row back
      return uploaded;
    }
    const saved = await updateItem(
      id,
      { name, status, imageUrl: uploaded.url },
      caller.office
    );
    if (!saved.ok) {
      await deleteItemImageByUrl(uploaded.url);
      await deleteItem(id, caller.office);
      return { ok: false, error: "Could not save the picture. Please try again." };
    }
  }

  await logActivity({
    userId: caller.id,
    action: "item_added",
    entityType: "item",
    entityId: id,
    description: `Added item "${name}".`,
    // The new item's office, so its office admins see the row.
    office,
  });

  revalidateItemPaths();
  return { ok: true };
}

export async function editItemAction(formData: FormData): Promise<ItemActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const id = Number(readString(formData, "id"));
  const name = readString(formData, "name").trim();
  const status = readString(formData, "status") as ItemStatus;
  const picture = readPicture(formData);

  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Item not found." };
  if (!name) return { ok: false, error: "Item name is required." };
  if (!ITEM_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };

  const logCrossOfficeBlock = (itemName: string) =>
    logActivity({
      userId: caller.id,
      action: "cross_office_action_blocked",
      entityType: "item",
      entityId: id,
      description: `Blocked edit attempt on "${itemName}" — different office.`,
      office: caller.office,
    });

  // Replacing the picture: validate, confirm the caller may touch this item
  // (so nothing is uploaded for another office's item), then upload.
  let newImageUrl: string | undefined;
  if (picture) {
    const image = await validateItemImage(picture);
    if (!image.ok) return { ok: false, error: image.error };

    const access = await getItemEditAccess(id, caller.office);
    if (!access.ok) {
      if (access.crossOfficeBlock) await logCrossOfficeBlock(access.crossOfficeBlock.itemName);
      return { ok: false, error: "Item not found." };
    }

    // Order: upload new file -> update DB -> delete old file. A failed
    // upload never touches the DB, so the item never gets a broken image.
    const uploaded = await uploadItemImage(id, image);
    if (!uploaded.ok) return uploaded;
    newImageUrl = uploaded.url;
  }

  const result = await updateItem(
    id,
    { name, status, ...(newImageUrl ? { imageUrl: newImageUrl } : {}) },
    caller.office
  );
  if (!result.ok) {
    // The DB update didn't happen, so the file just uploaded is unreferenced.
    if (newImageUrl) await deleteItemImageByUrl(newImageUrl);
    if (result.crossOfficeBlock) await logCrossOfficeBlock(result.crossOfficeBlock.itemName);
    return { ok: false, error: "Item not found." };
  }

  // DB now points at the new file; the old one is only clutter. A failed
  // delete is logged inside the helper and never fails the edit.
  if (newImageUrl && result.previousImageUrl !== newImageUrl) {
    await deleteItemImageByUrl(result.previousImageUrl);
  }

  const renamed = result.previousName !== name;
  const statusChanged = result.previousStatus !== status;
  const imageChanged = newImageUrl !== undefined;

  // Log what actually changed: a rename, a status change, a new picture, or a
  // no-op save.
  if (renamed || (!statusChanged && !imageChanged)) {
    await logActivity({
      userId: caller.id,
      action: "item_renamed",
      entityType: "item",
      entityId: id,
      description: renamed
        ? `Renamed item "${result.previousName}" to "${name}".`
        : `Saved item "${name}" with no changes.`,
      office: result.itemOffice,
    });
  }
  if (statusChanged) {
    await logActivity({
      userId: caller.id,
      action: "item_status_changed",
      entityType: "item",
      entityId: id,
      description: `Changed "${name}" status from ${result.previousStatus} to ${status}.`,
      office: result.itemOffice,
    });

    // Turning an item unavailable can otherwise strand any pending borrow
    // requests on it: approveBorrowRequest() now refuses to approve against
    // a non-available item, so a request left pending would sit forever in
    // both the admin's Requests queue and the borrower's Borrow Requests
    // list with no way forward. Auto-reject clears it immediately instead.
    if (status === "unavailable") {
      // Captured BEFORE auto-rejecting: the E5 emails find the requests that
      // were rejected by this change as those stamped at or after this moment.
      const autoRejectStartedAt = new Date();
      const rejectedCount = await autoRejectPendingRequestsForItem(id);
      if (rejectedCount > 0) {
        await logActivity({
          userId: caller.id,
          action: "borrow_rejected",
          entityType: "item",
          entityId: id,
          description: `Auto-rejected ${rejectedCount} pending request(s) on "${name}" — item marked unavailable.`,
          office: result.itemOffice,
        });
        // Auto-rejection changes borrow_records rows, not just the item, so
        // the admin Requests/History views and the borrower's own
        // Requests/History views all need a fresh read too.
        revalidatePath("/admin/requests");
        revalidatePath("/admin/history");
        revalidatePath("/borrower/requests");
        revalidatePath("/borrower/history");

        // E5: tell each borrower their pending request was closed because the
        // item is now unavailable. Runs after the response is sent, never
        // throws, and a failed send never affects the item change.
        after(() => notifyRequestsAutoRejected(id, autoRejectStartedAt, caller.id));
      }
    }
  }
  if (imageChanged) {
    await logActivity({
      userId: caller.id,
      action: "item_image_changed",
      entityType: "item",
      entityId: id,
      description: `Changed the picture of "${name}".`,
      office: result.itemOffice,
    });
  }

  revalidateItemPaths();
  return { ok: true };
}

export async function deleteItemAction(id: number): Promise<ItemActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await deleteItem(id, caller.office);
  if (result.status === "wrong_office") {
    await logActivity({
      userId: caller.id,
      action: "cross_office_action_blocked",
      entityType: "item",
      entityId: id,
      description: `Blocked delete attempt on "${result.itemName}" — different office.`,
      office: caller.office,
    });
    return { ok: false, error: "Item not found." };
  }
  if (result.status === "not_found") {
    return { ok: false, error: "Item not found." };
  }
  if (result.status === "has_records") {
    return {
      ok: false,
      error: "This item has borrow history and cannot be deleted.",
    };
  }

  // The row is gone; remove its picture too so the bucket doesn't fill with
  // orphaned files. Best-effort — never fails the delete.
  await deleteItemImageByUrl(result.imageUrl);

  await logActivity({
    userId: caller.id,
    action: "item_deleted",
    entityType: "item",
    entityId: id,
    description: `Deleted item "${result.itemName}".`,
    office: result.itemOffice,
  });

  revalidateItemPaths();
  return { ok: true };
}

export async function deleteItemsAction(ids: number[]): Promise<ItemActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  if (ids.length === 0) return { ok: true };

  const deletedNames: string[] = [];
  const deletedOffices = new Set<Office>();
  let blockedCount = 0;

  for (const id of ids) {
    const result = await deleteItem(id, caller.office);
    if (result.status === "deleted") {
      deletedNames.push(result.itemName);
      deletedOffices.add(result.itemOffice);
      await deleteItemImageByUrl(result.imageUrl);
    }
    if (result.status === "has_records") blockedCount += 1;
    if (result.status === "wrong_office") {
      await logActivity({
        userId: caller.id,
        action: "cross_office_action_blocked",
        entityType: "item",
        entityId: id,
        description: `Blocked bulk-delete attempt on "${result.itemName}" — different office.`,
        office: caller.office,
      });
    }
  }
  const deletedCount = deletedNames.length;

  if (deletedCount > 0) {
    await logActivity({
      userId: caller.id,
      action: "item_bulk_deleted",
      entityType: "item",
      description: `Deleted ${deletedCount} item(s): ${deletedNames
        .map((n) => `"${n}"`)
        .join(", ")}.`,
      // One office -> that office; a mixed super-admin batch stays null
      // (visible to the super admin only).
      office: deletedOffices.size === 1 ? [...deletedOffices][0] : null,
    });
    revalidateItemPaths();
  }

  if (blockedCount > 0) {
    return {
      ok: false,
      error:
        deletedCount > 0
          ? `Deleted ${deletedCount} item(s). ${blockedCount} item(s) have borrow history and were skipped.`
          : `${blockedCount} item(s) have borrow history and cannot be deleted.`,
    };
  }

  return { ok: true };
}