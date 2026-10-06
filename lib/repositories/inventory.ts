import { db } from "@/prisma/db";
import type { Office } from "@/lib/roles";

// ---------------------------------------------------------------------------
// Inventory repository — backed by Prisma (Supabase Postgres). Pages, Server
// Actions and the home page call these functions, never the database directly.
//
// Every function is async, so call sites don't care where the data comes from.
// ---------------------------------------------------------------------------

export type ItemStatus = "available" | "borrowed" | "unavailable";

/**
 * The two item categories (MIGRATION_LOGS.md Log 1 FE-6, a DECISION):
 * "SDO Items & Equipment" and "UCAO Items & Equipment". They are the
 * `ItemCategory` enum in prisma/contract.prisma and are read straight from the
 * column. The PHP's three legacy values were migrated by
 * prisma/migrate-item-categories.sql.
 */
export type ItemCategory =
  | "sports_dev_items_equipment"
  | "culture_arts_items_equipment";

/**
 * The category stored for a NEW item. Category follows the office (the Add
 * Item form shows it read-only), so it is derived here rather than trusted
 * from the client. Editing never changes office, so it never changes category.
 */
function categoryForOffice(office: Office): ItemCategory {
  return office === "sports_dev"
    ? "sports_dev_items_equipment"
    : "culture_arts_items_equipment";
}

/** One inventory row as the pages use it — the same shape as the old mocks. */
export interface InventoryListItem {
  id: number;
  name: string;
  description: string | null;
  status: ItemStatus;
  category: ItemCategory;
  office: Office;
  /** Object-storage URL of the picture, or null (none seeded yet). */
  imageUrl: string | null;
}

// Row type is inferred from the ORM; only the fields read here are listed.
function toListItem(row: {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  category: string;
  office: string;
  status: string;
}): InventoryListItem {
  const office = row.office as Office;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ItemStatus,
    category: row.category as ItemCategory,
    office,
    imageUrl: row.image,
  };
}

/**
 * How to order the list. The PHP's getInventoryList($conn, $sort, ...) took the
 * same two values: 'name' (admin Items, public catalog) and 'newest' (the
 * borrower catalog, so recently added items come first).
 */
export type InventorySort = "name" | "newest";

/**
 * Port of getInventoryList($conn, $sort, $adminOffice): every item.
 *
 * `office` scopes the list to one office, as the PHP does for an SDO / UCAO
 * admin. Pass null (super admin) or omit it for every office. The public page
 * and the borrower catalog pass nothing: they show every office's items.
 * `sort` defaults to 'name'.
 */
export async function getInventoryList(
  office?: Office | null,
  sort: InventorySort = "name"
): Promise<InventoryListItem[]> {
  const where = office ? { office } : {};

  const rows =
    sort === "newest"
      ? // Newest first; id breaks ties (the seed gives every row of a batch the
        // same created_at), so the order is stable between requests.
        await db.inventoryItem.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : await db.inventoryItem.findMany({ where, orderBy: { name: "asc" } });
  return rows.map(toListItem);
}

/**
 * Port of getUserPendingItemIds($conn, $userId): the ids of items this borrower
 * already has a PENDING borrow request on. Per-borrower only: it never touches
 * the item's own status, so other borrowers still see the item's real status.
 * The catalog uses it to swap a card's Borrow button for "Request Pending".
 *
 * The borrow flow (lib/repositories/borrowings.ts) creates and cancels
 * borrow_records, so this returns real, possibly non-empty data: a borrower
 * with a pending request on an item will have that item's id in the result.
 */
export async function getUserPendingItemIds(userId: number): Promise<number[]> {
  const rows = await db.borrowRecord.findMany({
    where: { userId, status: "pending" },
  });

  return [...new Set(rows.map((row) => row.itemId))];
}

/**
 * Port of index.php's inline query against ucao_sdo_inventory: every row, and
 * the rows whose status is 'available'. Counted in the database, so the home
 * page never loads the items themselves.
 */
export async function getPublicItemStats(): Promise<{
  availableCount: number;
  totalItemsCount: number;
}> {
  const [total, available] = await Promise.all([
    db.inventoryItem.count(),
    db.inventoryItem.count({ where: { status: "available" } }),
  ]);

  return {
    availableCount: available,
    totalItemsCount: total,
  };
}

// ---------------------------------------------------------------------------
// Writes (admin only — the Server Actions check the caller's role first)
// ---------------------------------------------------------------------------

export interface NewItem {
  name: string;
  description: string | null;
  office: Office;
  status: ItemStatus;
  /** Public Storage URL of the picture; null when there is none. */
  imageUrl: string | null;
}

/** Port of the PHP's assetForm insert. Returns the new row's id. */
export async function createItem(input: NewItem): Promise<number> {
  const row = await db.inventoryItem.create({
    data: {
      name: input.name,
      description: input.description,
      image: input.imageUrl,
      category: categoryForOffice(input.office),
      office: input.office,
      status: input.status,
    },
  });
  return row.id;
}

export interface ItemChanges {
  name: string;
  status: ItemStatus;
  /** Only set when a NEW picture was uploaded; undefined keeps the old one. */
  imageUrl?: string | null;
}

export type UpdateItemResult =
  | {
      ok: true;
      previousName: string;
      previousStatus: string;
      previousImageUrl: string | null;
      itemOffice: Office;
    }
  | { ok: false; crossOfficeBlock?: { itemName: string } };

export type ItemEditAccess =
  | { ok: true; imageUrl: string | null }
  | { ok: false; crossOfficeBlock?: { itemName: string } };

/**
 * Same office scoping as updateItem(), without writing anything. The edit
 * action calls this BEFORE uploading a picture, so a scoped admin can't put
 * files in Storage for another office's item.
 */
export async function getItemEditAccess(
  id: number,
  office: Office | null
): Promise<ItemEditAccess> {
  const existing = await db.inventoryItem.findFirst({ where: { id } });
  if (!existing) return { ok: false };
  if (office && existing.office !== office) {
    return { ok: false, crossOfficeBlock: { itemName: existing.name } };
  }
  return { ok: true, imageUrl: existing.image ?? null };
}

/**
 * Port of #editNameModal: rename / change status / replace the picture.
 * `office` is the caller's scope: a scoped admin can only touch their own
 * office's items, so the update is filtered by both id and office.
 * `crossOfficeBlock` is set only when the item exists but belongs to another
 * office, so the Server Action can write `cross_office_action_blocked`.
 */
export async function updateItem(
  id: number,
  changes: ItemChanges,
  office: Office | null
): Promise<UpdateItemResult> {
  const existing = await db.inventoryItem.findFirst({ where: { id } });
  if (!existing) return { ok: false };
  if (office && existing.office !== office) {
    return { ok: false, crossOfficeBlock: { itemName: existing.name } };
  }

  const data: { name: string; status: ItemStatus; image?: string | null } = {
    name: changes.name,
    status: changes.status,
  };
  if (changes.imageUrl !== undefined) data.image = changes.imageUrl;

  const updated = await db.inventoryItem
    .update({ where: { id }, data })
    .catch(() => null);
  if (updated === null) return { ok: false };
  return {
    ok: true,
    previousName: existing.name,
    previousStatus: existing.status as string,
    previousImageUrl: existing.image ?? null,
    itemOffice: existing.office as Office,
  };
}

export type DeleteItemResult =
  | {
      status: "deleted";
      itemName: string;
      itemOffice: Office;
      imageUrl: string | null;
    }
  | { status: "has_records"; itemName: string }
  | { status: "wrong_office"; itemName: string }
  | { status: "not_found" };

/**
 * Delete one item. Same office scoping as updateItem().
 *
 * An item's borrow records are NEVER deleted with it (SA-20 decision): if the
 * item has any borrow record, in any status, it is left alone and
 * "has_records" is returned, so the borrow history stays intact. The
 * foreign key on borrow_records.item_id (no cascade) is the backstop; the
 * check below just turns it into a readable result. A record created between
 * the check and the delete trips the foreign key, which is caught and
 * re-checked here.
 *
 * "wrong_office" (item exists, other office) lets the Server Action log
 * `cross_office_action_blocked`; the UI still shows "Item not found".
 *
 * VERIFY: `.delete()` is still the one call in the inventory code whose
 * Prisma 8 (RC) signature isn't proven by working code in this project.
 */
export async function deleteItem(
  id: number,
  office: Office | null
): Promise<DeleteItemResult> {
  const existing = await db.inventoryItem.findFirst({ where: { id } });
  if (!existing) return { status: "not_found" };
  if (office && existing.office !== office) {
    return { status: "wrong_office", itemName: existing.name };
  }

  if (await itemHasBorrowRecords(id)) {
    return { status: "has_records", itemName: existing.name };
  }

  const gone = {
    status: "deleted" as const,
    itemName: existing.name,
    itemOffice: existing.office as Office,
    imageUrl: existing.image ?? null,
  };
  const deleted = await db.inventoryItem
    .delete({ where: { id } })
    .catch(async (error) => {
      // A record created between the check above and this delete trips the
      // foreign key; re-check here rather than trusting the delete's own
      // error, since a plain .catch() on this promise can't be intercepted
      // by a surrounding try/catch (see BUGS.md BUG-32).
      if (await itemHasBorrowRecords(id)) return "has_records" as const;
      throw error;
    });
  if (deleted === "has_records") {
    return { status: "has_records", itemName: existing.name };
  }
  return deleted !== null ? gone : { status: "not_found" };
}

async function itemHasBorrowRecords(itemId: number): Promise<boolean> {
  const record = await db.borrowRecord.findFirst({ where: { itemId } });
  return record !== null && record !== undefined;
}