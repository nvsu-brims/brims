import { db } from "@/prisma/db";
import type { Office } from "@/lib/roles";
import { isPastDue, isoToManilaDate } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Borrowing repository — backed by Prisma (Supabase Postgres). Covers BOTH
// sides of the borrow lifecycle:
//   - Borrower side: submit / cancel / getBorrowerHomeStats(), ported from
//     borrower_dashboard_borrow_requests.php and borrower_dashboard_stats.php.
//   - Admin side: getPendingBorrowRequests() / getBorrowedItems() /
//     getBorrowHistory() and the three admin mutations (approve / reject /
//     mark returned), ported from admin_dashboard_borrow_requests.php.
// Pages and Server Actions call these functions, never the database directly.
//
// getUserPendingItemIds() stays in lib/repositories/inventory.ts, where the
// borrower catalog already reads it.
//
// No join API is used anywhere in this file: this project has not proven one
// against Prisma 8 (RC), so the item name / office, the borrower's identity
// and the approver's name are all looked up with plain `.where().all()` reads
// and matched in code. If a join turns out to be available, the lookups in
// getBorrowerHomeStats() and hydrateAdminRows() are the only things to
// replace.
//
// Excluded on purpose, everywhere in this file: the admin-side activity-log
// rows (`borrow_approved`, `borrow_rejected`, `borrow_returned`,
// `cross_office_action_blocked`) and every email. Not deferred to "later" —
// deliberately out of scope until further notice. `borrow_requested` /
// `borrow_cancelled` ARE now logged, but one layer up, in the Server Actions
// that call createBorrowRequest() / cancelBorrowRequest() below — this
// repository itself still never calls logActivity() directly; it just
// returns the item name/office those callers need to build the row.
// ---------------------------------------------------------------------------

export type BorrowStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "borrowed"
  | "returned"
  | "overdue"
  | "cancelled";

// ---------------------------------------------------------------------------
// Submit / cancel
// ---------------------------------------------------------------------------

export type CreateBorrowRequestResult =
  | { ok: true; id: number; itemName: string; itemOffice: Office }
  | { ok: false; error: string };

/**
 * Port of handleSubmitBorrowRequest()'s database half, in the PHP's order:
 * the item must exist, must still be 'available' (re-checked here even though
 * the button is disabled client-side), and the borrower must not already have
 * a 'pending' request on it. Then a 'pending' row is inserted. `requestedAt`
 * is stamped by the database; the borrower never sets due_at / approved_by /
 * etc. (those stay admin-only, filled in on approval).
 *
 * The caller validates `expectedReturnDate` (a real date after today).
 *
 * Like the PHP, the duplicate check and the insert are two statements, so two
 * simultaneous submissions can both pass. Closing that gap needs a partial
 * unique index on (user_id, item_id) WHERE status = 'pending', which is a
 * schema change (see COMPLETED_TASKS.md, Not Yet Built).
 *
 * VERIFY (first write to `borrow_records`): every nullable column is passed
 * explicitly as null, the way createUser() / createItem() do, and
 * `expectedReturnDate` is a `DateString` written as "YYYY-MM-DD". If the
 * contract rejects either, this is the only place to change.
 */
export async function createBorrowRequest(input: {
  userId: number;
  itemId: number;
  /** "YYYY-MM-DD", already validated by the caller. */
  expectedReturnDate: string;
}): Promise<CreateBorrowRequestResult> {
  const item = await db.inventoryItem.findFirst({
    where: { id: input.itemId },
  });
  if (!item) return { ok: false, error: "That item no longer exists." };
  if (item.status !== "available") {
    return {
      ok: false,
      error: "That item is no longer available to borrow.",
    };
  }

  const alreadyPending = await db.borrowRecord.findFirst({
    where: { userId: input.userId, itemId: input.itemId, status: "pending" },
  });
  if (alreadyPending) {
    return {
      ok: false,
      error: "You already have a pending request for this item.",
    };
  }

  const row = await db.borrowRecord.create({
    data: {
      userId: input.userId,
      itemId: input.itemId,
      status: "pending",
      expectedReturnDate: new Date(`${input.expectedReturnDate}T00:00:00.000Z`),
      dueAt: null,
      approvedAt: null,
      approvedById: null,
      returnedAt: null,
      remarks: null,
    },
  });

  return { ok: true, id: row.id, itemName: item.name, itemOffice: item.office as Office };
}

export type CancelBorrowRequestResult =
  | { ok: true; itemName: string; itemOffice: Office | null }
  | { ok: false; error: string };

const NOT_CANCELLABLE =
  "That request could no longer be cancelled (it may have already been approved or rejected).";

/**
 * Port of handleCancelBorrowRequest()'s database half. A borrower can cancel
 * only their OWN request, and only while it is still 'pending'.
 *
 * The lookup is scoped to (id, userId) and the UPDATE is filtered on
 * (id, userId, status = 'pending') again, so a request an admin approved or
 * rejected in the gap between the two can't be cancelled out from under them
 * (the PHP's `affected_rows > 0` guard). Every failure returns the same
 * message, like the PHP.
 */
export async function cancelBorrowRequest(
  userId: number,
  requestId: number
): Promise<CancelBorrowRequestResult> {
  const record = await db.borrowRecord.findFirst({
    where: { id: requestId, userId },
  });
  if (!record || record.status !== "pending") {
    return { ok: false, error: NOT_CANCELLABLE };
  }

  const item = await db.inventoryItem.findFirst({
    where: { id: record.itemId },
  });

  const updated = await db.borrowRecord
    .update({
      where: { id: requestId, userId, status: "pending" },
      data: { status: "cancelled" },
    })
    .catch(() => null);
  if (updated === null) return { ok: false, error: NOT_CANCELLABLE };

  return { ok: true, itemName: item?.name ?? "", itemOffice: (item?.office as Office | undefined) ?? null };
}

// ---------------------------------------------------------------------------
// Borrower Home stats and the Requests / Borrowed Items / History rows
// ---------------------------------------------------------------------------

/**
 * One of this borrower's borrow_records, with the item's name / office and the
 * approving admin's name resolved. Dates are ISO strings; `expectedReturnDate`
 * is date-only ("YYYY-MM-DD"). Format them with lib/dates.ts.
 */
export interface BorrowerBorrowRow {
  id: number;
  status: BorrowStatus;
  itemId: number;
  itemName: string;
  itemOffice: Office;
  requestedAt: string;
  expectedReturnDate: string | null;
  dueAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  /** Set when status = 'rejected' (the reason an admin gave, or the
   *  auto-reject message from BUG-12 / item-marked-unavailable). Null for
   *  every other status. Surfaced in Borrow History so a borrower can see
   *  why a request was turned down (BUG-14). */
  remarks: string | null;
}

/** Same shape as the PHP's getBorrowerHomeStats() return array. */
export interface BorrowerHomeStats {
  /** status = 'pending' (Borrow Requests table), newest requested first. */
  pendingRequests: BorrowerBorrowRow[];
  /** every other status (Borrow History table), newest requested first. */
  borrowHistory: BorrowerBorrowRow[];
  /** 'borrowed' or 'overdue' (Borrowed Items table), soonest due first. */
  borrowedItems: BorrowerBorrowRow[];
  borrowedCount: number;
  overdueCount: number;
  /** borrowed + overdue + returned. */
  totalBorrowedCount: number;
  /** Up to 6 'borrowed' rows with a due date, soonest first (Home widget). */
  upcomingDue: BorrowerBorrowRow[];
  /** Up to 6 pending rows, oldest requested first (Home widget). */
  pendingApprovals: BorrowerBorrowRow[];
}

const HOME_WIDGET_LIMIT = 6;

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A date-only column, as "YYYY-MM-DD". */
function toDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, 10);
}

function timeOf(iso: string | null): number {
  return iso ? Date.parse(iso) : Number.POSITIVE_INFINITY;
}

/**
 * The status a record should be SHOWN and COUNTED as (BUG-13). A 'borrowed'
 * record whose due day (Manila calendar day, see lib/dates.ts isPastDue) has
 * passed is 'overdue' — even if the daily job (markOverdueBorrowRecords, below)
 * has not run yet, so the display is correct the moment the page loads. Every
 * other status, and a record with no due date, is returned unchanged.
 *
 * This only changes what is read. The stored status is left alone here; the
 * job is what writes 'overdue' to the database. Both apply the same rule.
 */
function effectiveStatus(status: string, dueAt: string | null): BorrowStatus {
  if (status === "borrowed" && isPastDue(dueAt)) return "overdue";
  return status as BorrowStatus;
}

/**
 * Port of getBorrowerHomeStats($conn, $userId): ONE borrower-scoped read of
 * borrow_records (newest requested first), split by status into the plain
 * arrays each page needs. Every page under /borrower calls this and uses its
 * own slice, so the split rules live in one place, as they did in the PHP.
 *
 * A record whose item no longer exists is skipped, like the PHP's inner JOIN.
 */
export async function getBorrowerHomeStats(
  userId: number
): Promise<BorrowerHomeStats> {
  const records = await db.borrowRecord.findMany({
    where: { userId },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
  });

  const stats: BorrowerHomeStats = {
    pendingRequests: [],
    borrowHistory: [],
    borrowedItems: [],
    borrowedCount: 0,
    overdueCount: 0,
    totalBorrowedCount: 0,
    upcomingDue: [],
    pendingApprovals: [],
  };
  if (records.length === 0) return stats;

  const needsApprovers = records.some((r) => r.approvedById != null);
  const [items, admins] = await Promise.all([
    db.inventoryItem.findMany({}),
    needsApprovers
      ? db.user.findMany({ where: { role: "admin" } })
      : Promise.resolve([]),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const adminById = new Map(admins.map((admin) => [admin.id, admin]));

  for (const record of records) {
    const item = itemById.get(record.itemId);
    if (!item) continue;

    const approver =
      record.approvedById != null
        ? adminById.get(record.approvedById)
        : undefined;

    const dueAt = toIso(record.dueAt);

    const row: BorrowerBorrowRow = {
      id: record.id,
      // BUG-13: a borrowed item past its due day reads as overdue.
      status: effectiveStatus(record.status, dueAt),
      itemId: record.itemId,
      itemName: item.name,
      itemOffice: item.office as Office,
      requestedAt: toIso(record.requestedAt) ?? "",
      expectedReturnDate: toDateOnly(record.expectedReturnDate),
      dueAt,
      approvedAt: toIso(record.approvedAt),
      approvedByName: approver
        ? `${approver.firstName} ${approver.lastName}`
        : null,
      remarks: record.remarks,
    };

    if (row.status === "pending") {
      stats.pendingRequests.push(row);
    } else {
      stats.borrowHistory.push(row);
    }

    if (row.status === "borrowed" || row.status === "overdue") {
      stats.borrowedItems.push(row);
    }

    if (row.status === "borrowed") stats.borrowedCount++;
    if (row.status === "overdue") stats.overdueCount++;
    if (
      row.status === "borrowed" ||
      row.status === "overdue" ||
      row.status === "returned"
    ) {
      stats.totalBorrowedCount++;
    }

    if (row.status === "borrowed" && row.dueAt) stats.upcomingDue.push(row);
    if (row.status === "pending") stats.pendingApprovals.push(row);
  }

  // Soonest / most-overdue first; a row with no due date sorts last.
  stats.borrowedItems.sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt));

  // Home widgets: the 6 soonest due, and the 6 longest-waiting requests.
  stats.upcomingDue.sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt));
  stats.upcomingDue = stats.upcomingDue.slice(0, HOME_WIDGET_LIMIT);

  stats.pendingApprovals.sort(
    (a, b) => timeOf(a.requestedAt) - timeOf(b.requestedAt)
  );
  stats.pendingApprovals = stats.pendingApprovals.slice(0, HOME_WIDGET_LIMIT);

  return stats;
}

// ---------------------------------------------------------------------------
// ADMIN-SIDE ADDITIONS to lib/repositories/borrowings.ts.
//
// Append everything below to the existing repositories-borrowings.ts (the
// borrower-side file already has createBorrowRequest / cancelBorrowRequest /
// getBorrowerHomeStats — this section is the admin mirror of those reads,
// plus the three admin mutations). Ported from
// admin_dashboard_borrow_requests.php: getPendingBorrowRequests(),
// getBorrowedItems(), getBorrowHistory(), handleApproveRequest(),
// handleRejectRequest(), handleMarkReturned().
//
// Excluded on purpose, matching the rest of this project's admin actions:
// - Every activity-log write (logActivity(...) calls) still happens one
//   layer up, in the Server Actions, not here — same pattern as
//   createBorrowRequest() / cancelBorrowRequest() above. This file's three
//   admin mutations DO now distinguish a genuine cross-office block from an
//   ordinary "already resolved" race (AdminActionResult's optional
//   `crossOfficeBlock` field), which is what lets the Server Action layer
//   write cross_office_action_blocked correctly — but this repository still
//   never calls logActivity() itself.
// - Every email (sendBorrowApprovedEmail / sendBorrowRejectedEmail /
//   sendItemReturnedEmail).
//
// Both mutations that also touch the item (approve, mark-returned) run the
// borrow_records + inventory_items updates as two sequential statements
// rather than a database transaction, because no other file in this project
// has used a Prisma 8 (RC) transaction yet and introducing one here would be
// a first for the codebase (see the VERIFY notes below). If the second
// statement fails after the first succeeds, the two tables can disagree
// (record says borrowed/returned, item status doesn't match) — flagged in
// COMPLETED_TASKS.md as a known gap until a proven transaction pattern
// exists in this project.
// ---------------------------------------------------------------------------

/**
 * One row for the admin Borrower Requests / Borrowed Items / History tables —
 * same shape as BorrowerBorrowRow but includes the borrower's own identity
 * fields (every admin table shows Borrower / ID Number / College /
 * Organization; the borrower's own tables don't need to name the borrower).
 */
export interface AdminBorrowRow {
  id: number;
  status: BorrowStatus;
  itemId: number;
  itemName: string;
  itemOffice: Office;
  borrowerId: number;
  borrowerName: string;
  borrowerIdNumber: string;
  /** College/Organization CODES straight from data/colleges.ts, or null (admins have neither). */
  college: string | null;
  organization: string | null;
  requestedAt: string;
  expectedReturnDate: string | null;
  dueAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  returnedAt: string | null;
  remarks: string | null;
}

function toAdminRow(
  record: {
    id: number;
    status: string;
    itemId: number;
    userId: number;
    requestedAt: unknown;
    expectedReturnDate: unknown;
    dueAt: unknown;
    approvedAt: unknown;
    approvedById: number | null;
    returnedAt: unknown;
    remarks: string | null;
  },
  item: { name: string; office: string },
  borrower: {
    id: number;
    firstName: string;
    lastName: string;
    idNumber: string;
    college: string | null;
    organization: string | null;
  },
  approver: { firstName: string; lastName: string } | undefined
): AdminBorrowRow {
  const dueAt = toIso(record.dueAt);
  return {
    id: record.id,
    // BUG-13: a borrowed item past its due day reads as overdue.
    status: effectiveStatus(record.status, dueAt),
    itemId: record.itemId,
    itemName: item.name,
    itemOffice: item.office as Office,
    borrowerId: borrower.id,
    borrowerName: `${borrower.firstName} ${borrower.lastName}`,
    borrowerIdNumber: borrower.idNumber,
    college: borrower.college,
    organization: borrower.organization,
    requestedAt: toIso(record.requestedAt) ?? "",
    expectedReturnDate: toDateOnly(record.expectedReturnDate),
    dueAt,
    approvedAt: toIso(record.approvedAt),
    approvedByName: approver
      ? `${approver.firstName} ${approver.lastName}`
      : null,
    returnedAt: toIso(record.returnedAt),
    remarks: record.remarks,
  };
}

/**
 * Shared by the three admin read functions below: resolves every record's
 * item and borrower (and, for history, the approving admin) with plain
 * `.all()` reads matched in code — same "no join API proven yet" reasoning
 * as getBorrowerHomeStats(). A record whose item no longer exists is
 * skipped, matching the PHP's inner JOIN on ucao_sdo_inventory.
 */
async function hydrateAdminRows(records: {
  id: number;
  status: string;
  itemId: number;
  userId: number;
  requestedAt: unknown;
  expectedReturnDate: unknown;
  dueAt: unknown;
  approvedAt: unknown;
  approvedById: number | null;
  returnedAt: unknown;
  remarks: string | null;
}[]): Promise<AdminBorrowRow[]> {
  if (records.length === 0) return [];

  const needsApprovers = records.some((r) => r.approvedById != null);
  const [items, borrowers, admins] = await Promise.all([
    db.inventoryItem.findMany({}),
    db.user.findMany({ where: { role: "borrower" } }),
    needsApprovers
      ? db.user.findMany({ where: { role: "admin" } })
      : Promise.resolve([]),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const borrowerById = new Map(borrowers.map((u) => [u.id, u]));
  const adminById = new Map(admins.map((u) => [u.id, u]));

  const rows: AdminBorrowRow[] = [];
  for (const record of records) {
    const item = itemById.get(record.itemId);
    const borrower = borrowerById.get(record.userId);
    // Skip if the item is gone (PHP's inner JOIN) or the borrower is gone
    // (shouldn't happen — users are soft-deleted, never hard-deleted — but
    // guards the lookup the same way the item lookup is guarded).
    if (!item || !borrower) continue;

    const approver =
      record.approvedById != null ? adminById.get(record.approvedById) : undefined;

    rows.push(toAdminRow(record, item, borrower, approver));
  }
  return rows;
}

/**
 * Port of getPendingBorrowRequests($conn, $office): every 'pending' request,
 * oldest requested first (longest-waiting surfaces first). `office` scopes
 * the list — null (or omitted) = super admin, sees every office's pending
 * requests.
 */
export async function getPendingBorrowRequests(
  office: Office | null = null
): Promise<AdminBorrowRow[]> {
  const records = await db.borrowRecord.findMany({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
  });

  const rows = await hydrateAdminRows(records);
  return office ? rows.filter((row) => row.itemOffice === office) : rows;
}

/**
 * Port of getBorrowedItems($conn, $office): every 'borrowed' or 'overdue'
 * request, soonest due first. `office` scopes the list the same way.
 *
 * BUG-13: a 'borrowed' row past its due day is shown as 'overdue' (see
 * effectiveStatus, applied in toAdminRow), so this list is correct even between
 * runs of the daily job that writes the stored status.
 */
export async function getBorrowedItems(
  office: Office | null = null
): Promise<AdminBorrowRow[]> {
  const borrowed = await db.borrowRecord.findMany({
    where: { status: "borrowed" },
  });
  const overdue = await db.borrowRecord.findMany({
    where: { status: "overdue" },
  });

  const rows = await hydrateAdminRows([...borrowed, ...overdue]);
  const scoped = office ? rows.filter((row) => row.itemOffice === office) : rows;

  // Soonest due first; a row with no due date sorts last.
  scoped.sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt));
  return scoped;
}

/**
 * Port of getBorrowHistory($conn, $office): every settled, non-currently-out
 * request (approved, rejected, returned, cancelled — NOT pending/borrowed/
 * overdue, which live in the two functions above), newest requested first.
 * `office` scopes the list the same way.
 */
export async function getBorrowHistory(
  office: Office | null = null
): Promise<AdminBorrowRow[]> {
  const excluded = new Set(["pending", "borrowed", "overdue"]);
  const records = await db.borrowRecord.findMany({
    orderBy: { requestedAt: "desc" },
  });
  const settled = records.filter((r) => !excluded.has(r.status));

  const rows = await hydrateAdminRows(settled);
  return office ? rows.filter((row) => row.itemOffice === office) : rows;
}

// ---------------------------------------------------------------------------
// Approve / Reject / Mark as Returned
// ---------------------------------------------------------------------------

export type AdminActionResult =
  | {
      ok: true;
      /** For the activity-log description and office (BUG-06). */
      itemName: string;
      itemOffice: Office;
      borrowerName: string;
      /**
       * Set only by approveBorrowRequest (BUG-12): how many OTHER borrowers'
       * pending requests for the same item were auto-rejected because this
       * approval made the item `borrowed`. 0 when there were none.
       */
      autoRejectedCount?: number;
      /** Set only by approveBorrowRequest (BUG-12): the approved request's item id. */
      itemId?: number;
    }
  /**
   * `crossOfficeBlock` is set only when the PHP's own distinguishing check
   * would have found a row: the request exists, is still in the right
   * status, and its item exists — but belongs to a DIFFERENT office than
   * the scoped admin's. Every other failure (unknown id, wrong status,
   * item gone, or a real DB error) leaves this unset, exactly matching
   * `handleApproveRequest()` / `handleRejectRequest()` / `handleMarkReturned()`'s
   * own "only worth distinguishing wrong-office from already-resolved..."
   * comment — a super admin (`office === null`) can never trigger this,
   * since there's no office to be wrong about.
   */
  | { ok: false; error: string; crossOfficeBlock?: { itemName: string } };

/** "First Last" for a borrow record's requester; "a borrower" if not found. */
async function borrowerNameOf(userId: number): Promise<string> {
  const user = await db.user.findFirst({ where: { id: userId } });
  return user ? `${user.firstName} ${user.lastName}` : "a borrower";
}

const NO_LONGER_PENDING = "That request is no longer pending.";
const NO_LONGER_RETURNABLE =
  "That request can no longer be marked as returned.";

/**
 * Port of handleApproveRequest($conn, $office). Sets status = 'borrowed'
 * directly (no separate "approved, not yet picked up" state), stamps
 * approvedAt / approvedById, and sets dueAt from the borrower's own
 * expectedReturnDate — falling back to 14 days out for a row with none. Also
 * flips the item's own status to 'borrowed' so it stops showing as available.
 *
 * `office` scopes the update: a scoped admin can only approve a request for
 * an item in their own office (checked by loading the item first, same
 * ownership-check pattern as editItemAction/deleteItem elsewhere in this
 * project, rather than a raw SQL JOIN...UPDATE).
 *
 * VERIFY: the borrow_records + inventory_items updates below are two
 * sequential statements, not inside a database transaction — this project
 * has not used a Prisma 8 (RC) transaction anywhere yet. If the second
 * update fails after the first succeeds, the record says 'borrowed' while
 * the item's own status could remain stale. Worth revisiting once a
 * transaction pattern is proven elsewhere in this codebase.
 */
export async function approveBorrowRequest(
  requestId: number,
  adminId: number,
  office: Office | null
): Promise<AdminActionResult> {
  const record = await db.borrowRecord.findFirst({ where: { id: requestId } });
  if (!record || record.status !== "pending") {
    return { ok: false, error: NO_LONGER_PENDING };
  }

  const item = await db.inventoryItem.findFirst({ where: { id: record.itemId } });
  if (!item) return { ok: false, error: NO_LONGER_PENDING };
  if (office && item.office !== office) {
    return {
      ok: false,
      error: NO_LONGER_PENDING,
      crossOfficeBlock: { itemName: item.name },
    };
  }
  // Defense in depth: a pending request can outlive the item's own status
  // (e.g. an admin marks it unavailable while a request is still pending).
  // autoRejectPendingRequestsForItem() is meant to clear these out at the
  // moment the item goes unavailable, and (BUG-12) approving a request now
  // rejects the item's other pending requests too, but this check still
  // guards approval if either step was skipped or failed, or if two admins
  // approve different requests for one item at the same moment.
  if (item.status !== "available") {
    return { ok: false, error: NO_LONGER_PENDING };
  }

  const dueAt =
    record.expectedReturnDate ??
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const updated = await db.borrowRecord
    .update({
      where: { id: requestId, status: "pending" },
      data: {
        status: "borrowed",
        approvedAt: new Date().toISOString(),
        approvedById: adminId,
        dueAt,
      },
    })
    .catch(() => null);
  if (updated === null) return { ok: false, error: NO_LONGER_PENDING };

  await db.inventoryItem.update({
    where: { id: record.itemId },
    data: { status: "borrowed" },
  });

  // BUG-12: the item is now `borrowed`, so any OTHER borrower's pending request
  // for it can no longer be approved (see the item.status check above). Reject
  // those now, with a reason the borrower sees in their own History, instead of
  // leaving them stuck as "Request Pending" in the borrower's list, the catalog
  // and the admin's queue.
  const autoRejectedCount = await rejectOtherPendingRequestsForItem(
    record.itemId,
    requestId,
    ITEM_BORROWED_REJECT_REASON
  );

  return {
    ok: true,
    itemName: item.name,
    itemOffice: item.office as Office,
    borrowerName: await borrowerNameOf(record.userId),
    autoRejectedCount,
    itemId: record.itemId,
  };
}

/**
 * Port of handleRejectRequest($conn, $office). Sets status = 'rejected' and
 * stores the combined reason+note string in remarks — same "reason first,
 * note on the next line if provided" combination the PHP builds before this
 * function is ever called (done here, since the caller no longer needs to
 * know it's two fields either). Reason/note presence validation (required
 * reason; note required when reason is "Other") is the Server Action's job,
 * same division as every other action in this project — this function
 * assumes `reason` is already the final combined string.
 *
 * `office` scopes the update the same way as approveBorrowRequest.
 */
export async function rejectBorrowRequest(
  requestId: number,
  adminId: number,
  reason: string,
  office: Office | null
): Promise<AdminActionResult> {
  const record = await db.borrowRecord.findFirst({ where: { id: requestId } });
  if (!record || record.status !== "pending") {
    return { ok: false, error: NO_LONGER_PENDING };
  }

  const item = await db.inventoryItem.findFirst({ where: { id: record.itemId } });
  if (!item) return { ok: false, error: NO_LONGER_PENDING };
  if (office && item.office !== office) {
    return {
      ok: false,
      error: NO_LONGER_PENDING,
      crossOfficeBlock: { itemName: item.name },
    };
  }

  const updated = await db.borrowRecord
    .update({
      where: { id: requestId, status: "pending" },
      data: {
        status: "rejected",
        approvedAt: new Date().toISOString(),
        approvedById: adminId,
        remarks: reason,
      },
    })
    .catch(() => null);
  if (updated === null) return { ok: false, error: NO_LONGER_PENDING };

  return {
    ok: true,
    itemName: item.name,
    itemOffice: item.office as Office,
    borrowerName: await borrowerNameOf(record.userId),
  };
}

/**
 * Auto-rejects every 'pending' request on one item, called from
 * editItemAction() the moment an admin changes that item's status to
 * 'unavailable'. Without this, a pending request just sits there forever —
 * it can never be approved (approveBorrowRequest() checks item.status), but
 * it also never leaves the admin's Requests queue or the borrower's Borrow
 * Requests list, so both sides are stuck looking at a request that's
 * effectively dead. This clears it immediately instead, with a reason the
 * borrower can see in their own History.
 *
 * Deliberately NOT the same code path as rejectBorrowRequest(): that
 * function is for one admin explicitly rejecting one request (re-checks
 * office ownership, stamps approvedById to that admin, expects a
 * caller-picked reason). This is a system-triggered bulk action, has no
 * single "approver", and always uses the same fixed reason — so it's kept
 * separate rather than looping rejectBorrowRequest() per row.
 *
 * Like approveBorrowRequest()/rejectBorrowRequest() elsewhere in this file,
 * this is not wrapped in a database transaction (see the VERIFY note on
 * approveBorrowRequest). Returns the count actually rejected, so the caller
 * can decide whether to mention it in the item_status_changed activity log.
 */
const ITEM_UNAVAILABLE_REJECT_REASON = "Item marked unavailable by admin";
// BUG-12: fixed reason for the requests auto-rejected when another borrower's
// request for the same item is approved.
const ITEM_BORROWED_REJECT_REASON = "Item was borrowed by another request";

/**
 * Shared by autoRejectPendingRequestsForItem() (item marked unavailable) and
 * approveBorrowRequest() (item taken by another approved request, BUG-12): sets
 * every 'pending' request on one item to 'rejected' with a fixed `reason` and no
 * single approver (approvedById null). `exceptRequestId` skips one request,
 * which approveBorrowRequest uses so it never rejects the request it just
 * approved (that row is already 'borrowed', so the status filter would skip it
 * anyway; the explicit exclusion is defense in depth).
 *
 * Each row is updated with `where: { id, status: "pending" }`, so a request
 * that changed state in the meantime is skipped rather than overwritten.
 * Returns the count actually rejected.
 */
async function rejectOtherPendingRequestsForItem(
  itemId: number,
  exceptRequestId: number | null,
  reason: string
): Promise<number> {
  const pending = await db.borrowRecord.findMany({
    where: { itemId, status: "pending" },
  });

  let rejectedCount = 0;
  for (const record of pending) {
    if (exceptRequestId !== null && record.id === exceptRequestId) continue;
    const updated = await db.borrowRecord
      .update({
        where: { id: record.id, status: "pending" },
        data: {
          status: "rejected",
          approvedAt: new Date().toISOString(),
          approvedById: null,
          remarks: reason,
        },
      })
      .catch(() => null);
    if (updated !== null) rejectedCount++;
  }
  return rejectedCount;
}

export async function autoRejectPendingRequestsForItem(
  itemId: number
): Promise<number> {
  return rejectOtherPendingRequestsForItem(
    itemId,
    null,
    ITEM_UNAVAILABLE_REJECT_REASON
  );
}

/**
 * Port of handleMarkReturned($conn, $office). Sets status = 'returned' and
 * stamps returnedAt on a currently 'borrowed' or 'overdue' row, and flips the
 * item's own status back to 'available' in the same "both mutations must
 * happen together" spirit as approveBorrowRequest (see its VERIFY note — not
 * a real transaction here either, same caveat applies). remarks is
 * deliberately left untouched: this is a plain "the item is back" action,
 * not a damage/loss report.
 *
 * `office` scopes the update the same way as the two functions above.
 */
export async function markBorrowReturned(
  requestId: number,
  office: Office | null
): Promise<AdminActionResult> {
  const record = await db.borrowRecord.findFirst({ where: { id: requestId } });
  if (!record || (record.status !== "borrowed" && record.status !== "overdue")) {
    return { ok: false, error: NO_LONGER_RETURNABLE };
  }

  const item = await db.inventoryItem.findFirst({ where: { id: record.itemId } });
  if (!item) return { ok: false, error: NO_LONGER_RETURNABLE };
  if (office && item.office !== office) {
    return {
      ok: false,
      error: NO_LONGER_RETURNABLE,
      crossOfficeBlock: { itemName: item.name },
    };
  }

  const updated = await db.borrowRecord
    .update({
      where: { id: requestId },
      data: { status: "returned", returnedAt: new Date().toISOString() },
    })
    .catch(() => null);
  if (updated === null) return { ok: false, error: NO_LONGER_RETURNABLE };

  await db.inventoryItem.update({
    where: { id: record.itemId },
    data: { status: "available" },
  });

  return {
    ok: true,
    itemName: item.name,
    itemOffice: item.office as Office,
    borrowerName: await borrowerNameOf(record.userId),
  };
}

// ---------------------------------------------------------------------------
// Daily overdue job (BUG-13)
// ---------------------------------------------------------------------------

/** One record the job flipped to 'overdue' — enough to write its log row. */
export interface NewlyOverdueRecord {
  id: number;
  userId: number;
  itemName: string;
  itemOffice: Office;
  /** The Manila due day, "YYYY-MM-DD". */
  dueDay: string;
}

/**
 * Stores the 'overdue' status for every 'borrowed' record whose due day has
 * passed (BUG-13), and returns the records it changed.
 *
 * This is the write half of the fix. The read half (effectiveStatus, above)
 * already SHOWS those records as overdue on every page load; this makes the
 * database agree, and it is what lets an `item_overdue_reminder` log row (and
 * later a reminder email) be sent once per record. Both halves use the same
 * rule (lib/dates.ts isPastDue), so they can never disagree about who is late.
 *
 * Safe to run any number of times:
 *   - only 'borrowed' rows are considered, so a record already flipped is not
 *     touched or returned again — this is what keeps the reminder log to one
 *     row per record instead of one per run;
 *   - each update is filtered on (id, status = 'borrowed'), so a record an
 *     admin marked returned in the gap is not flipped back to overdue.
 * A record that fails to update is skipped and logged; the rest still run.
 *
 * markBorrowReturned() already accepts 'overdue', so flipped records can still
 * be returned normally.
 */
export async function markOverdueBorrowRecords(
  now: Date = new Date()
): Promise<NewlyOverdueRecord[]> {
  const borrowed = await db.borrowRecord.findMany({
    where: { status: "borrowed" },
  });
  const late = borrowed.filter((r) => isPastDue(toIso(r.dueAt), now));
  if (late.length === 0) return [];

  const items = await db.inventoryItem.findMany({});
  const itemById = new Map(items.map((item) => [item.id, item]));

  const changed: NewlyOverdueRecord[] = [];
  for (const record of late) {
    const item = itemById.get(record.itemId);
    if (!item) continue;

    const updated = await db.borrowRecord
      .update({
        where: { id: record.id, status: "borrowed" },
        data: { status: "overdue" },
      })
      .catch((error: unknown) => {
        console.error(
          `markOverdueBorrowRecords: could not update record ${record.id}:`,
          error
        );
        return null;
      });
    if (updated === null) continue;

    const dueIso = toIso(record.dueAt) ?? "";
    changed.push({
      id: record.id,
      userId: record.userId,
      itemName: item.name,
      itemOffice: item.office as Office,
      dueDay: dueIso ? isoToManilaDate(dueIso) : "",
    });
  }
  return changed;
}