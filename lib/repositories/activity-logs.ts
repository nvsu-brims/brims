import { db } from "@/prisma/db";
import type { Office } from "@/lib/roles";
import { isPastDue } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Activity logs + admin Home stats repository — backed by Prisma (Supabase
// Postgres). Real path: lib/repositories/activity-logs.ts.
//
// Ports two PHP files:
//   - logs_reader.php        -> getActivityLogs()
//   - admin_dashboard_stats.php -> getAdminHomeStats()
// Pages call these functions, never the database directly.
//
// Reads AND writes: logActivity() (bottom of this file) inserts the rows;
// getActivityLogs() / getAdminHomeStats() / getLastPasswordChangeAt() read
// them. Every admin action,
// sign-in / sign-out, sign-up, borrower request and unauthorized URL access
// writes a row through logActivity().
//
// No join API is used (none is proven against Prisma 8 (RC) in this project,
// same rule as lib/repositories/borrowings.ts): actor names and item offices
// are looked up with plain `.where().all()` reads and matched in code.
// ---------------------------------------------------------------------------

export type ActivityCategory = "item" | "borrow" | "account" | "auth";

/**
 * Port of admin_dashboard.php's $activityCategoryMap: which filter category a
 * row's `entity_type` belongs to.
 */
const CATEGORY_BY_ENTITY_TYPE: Record<string, ActivityCategory> = {
  item: "item",
  borrow_record: "borrow",
  user: "account",
  auth: "auth",
};

/**
 * Port of admin_dashboard.php's $activityActionLabels: human-readable wording
 * for every `activity_logs.action`. Display wording is a rendering concern,
 * but it is shared by the Home widget and the full table, so it lives next to
 * the read function that produces the rows both use.
 */
const ACTION_LABELS: Record<string, string> = {
  item_added: "Item Added",
  item_renamed: "Item Renamed",
  item_status_changed: "Item Status Changed",
  item_image_changed: "Item Picture Changed",
  item_deleted: "Item Deleted",
  item_bulk_deleted: "Items Bulk Deleted",
  account_created: "Account Created",
  account_updated: "Account Updated",
  account_deactivated: "Account Deactivated",
  account_reactivated: "Account Reactivated",
  account_signed_up: "Account Signed Up",
  account_approved: "Sign-Up Approved",
  account_rejected: "Sign-Up Rejected",
  password_reset_by_admin: "Password Reset by Admin",
  password_changed_by_self: "Password Changed",
  borrow_approved: "Borrow Approved",
  borrow_rejected: "Borrow Rejected",
  borrow_requested: "Borrow Requested",
  borrow_cancelled: "Borrow Cancelled",
  borrow_returned: "Item Returned",
  sign_in_success: "Sign In Success",
  sign_in_failed: "Sign In Failed",
  sign_out: "Sign Out",
  item_overdue_reminder: "Overdue Reminder",
  email_send_failed: "Email Send Failed",
  email_recovered: "Email Recovered",
  cross_office_action_blocked: "Cross-Office Action Blocked",
  unauthorized_page_access: "Unauthorized Access",
};

/** One row as the Activity Logs page and the Home widget use it. */
export interface ActivityLogRow {
  id: number;
  /** Human label, e.g. "Borrow Approved" (falls back to the raw action). */
  action: string;
  category: ActivityCategory;
  /** "First Last", or "System" when there is no actor (the PHP's fallback). */
  actorName: string;
  details: string;
  /** ISO timestamp (Asia/Manila formatting is done by lib/dates.ts). */
  createdAt: string;
}

/** Postgres timestamps can come back as a Date or an ISO string. */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

/**
 * Port of getActivityLogs($conn, $office, $limit): newest first.
 *
 * Scoping is the PHP's exact rule and is done on `activity_logs.office`
 * itself, never by joining out to the item table (that broke for deleted
 * items in the PHP, see logs_reader.php's docblock). A scoped admin
 * (`office` set) gets only rows whose own `office` equals theirs. Account
 * rows (sign-up review, user management) carry no office, so they are
 * excluded for a scoped admin without any extra rule — only the super
 * admin ever sees them. Auth rows are different: `sign_in_success`,
 * `sign_out`, and `unauthorized_page_access` are stamped with the
 * signed-in actor's own office (see BUGS.md BUG-30), so a scoped admin
 * correctly sees their own sign-ins/sign-outs/blocked-access attempts
 * here, just not anyone else's — borrowers and the super admin have no
 * office, so their auth rows only ever surface for the super admin, same
 * as account rows. The super admin (`office` null / omitted) gets every
 * row, every category.
 *
 * `limit` caps the result, for the Home "Recent Activity" widget (6). Omit it
 * for the full Activity Logs page.
 */
export async function getActivityLogs(
  office: Office | null = null,
  limit?: number
): Promise<ActivityLogRow[]> {
  const records = await db.activityLog.findMany({
    where: office ? { office } : {},
    // Newest first; id breaks ties so the order is stable between requests.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const capped =
    typeof limit === "number" && limit > 0 ? records.slice(0, limit) : records;

  if (capped.length === 0) return [];

  // Actor names: one read of the users that actually appear, matched in code.
  const needsActors = capped.some((log) => log.userId != null);
  const users = needsActors ? await db.user.findMany({}) : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return capped.map((log) => {
    const actor = log.userId != null ? userById.get(log.userId) : undefined;
    const rawAction = (log.action ?? "") as string;
    return {
      id: log.id,
      action: ACTION_LABELS[rawAction] ?? rawAction,
      category: CATEGORY_BY_ENTITY_TYPE[log.entityType as string] ?? "item",
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : "System",
      details: log.description,
      createdAt: toIso(log.createdAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Admin Home stats
// ---------------------------------------------------------------------------

export interface AdminHomeStats {
  /** Items in the inventory (the admin's own office, or every office). */
  totalItems: number;
  /** Borrow records currently 'overdue'. */
  overdueBorrowers: number;
  /** Borrow records currently 'pending'. */
  pendingRequests: number;
}

/**
 * Port of getHomeStats($conn, $office).
 *
 * `office` scopes every count, exactly as the PHP does: null (super admin) =
 * totals across both offices; an SDO / UCAO admin only ever sees their own
 * office's numbers. `borrow_records` has no office column of its own, so the
 * overdue and pending counts are scoped through each record's item: the item
 * ids in the admin's office are collected first, then the records are counted
 * against them (the PHP's JOIN, done in code).
 *
 * "Overdue" (BUG-13) counts BOTH records the daily job has already stored as
 * 'overdue' AND 'borrowed' records whose due day has passed but that the job
 * has not reached yet, using the same rule as everywhere else
 * (lib/dates.ts isPastDue). So the number is correct the moment the page
 * loads, not up to a day later.
 *
 * Like the PHP, a failed count is not allowed to break the whole page: each
 * count defaults to 0 and the error is logged.
 */
export async function getAdminHomeStats(
  office: Office | null = null
): Promise<AdminHomeStats> {
  const stats: AdminHomeStats = {
    totalItems: 0,
    overdueBorrowers: 0,
    pendingRequests: 0,
  };

  try {
    const items = await db.inventoryItem.findMany({
      where: office ? { office } : {},
    });
    stats.totalItems = items.length;

    // For a scoped admin the item ids decide which records count; for the
    // super admin every record counts, so no id set is needed.
    const officeItemIds = office ? new Set(items.map((item) => item.id)) : null;
    const inScope = (itemId: number) =>
      officeItemIds === null || officeItemIds.has(itemId);

    const [storedOverdue, borrowed, pending] = await Promise.all([
      db.borrowRecord.findMany({ where: { status: "overdue" } }),
      db.borrowRecord.findMany({ where: { status: "borrowed" } }),
      db.borrowRecord.findMany({ where: { status: "pending" } }),
    ]);
    // dueAt can come back as a Date or a string (same as in
    // repositories-borrowings.ts, which reads it through toIso()). Normalise it
    // to an ISO string first; isPastDue returns false for anything it cannot
    // read, so a bad value is never counted as late (and cannot throw).
    const latePastDue = borrowed.filter((r) => {
      if (r.dueAt == null) return false;
      const due = new Date(r.dueAt as unknown as string);
      return !Number.isNaN(due.getTime()) && isPastDue(due.toISOString());
    });
    stats.overdueBorrowers = [...storedOverdue, ...latePastDue].filter((r) =>
      inScope(r.itemId)
    ).length;
    stats.pendingRequests = pending.filter((r) => inScope(r.itemId)).length;
  } catch (error) {
    // Same defensive default as the PHP: report zeros rather than an error
    // page. The failure is logged so it is not silent.
    console.error("getAdminHomeStats failed:", error);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Profile — last password change
// ---------------------------------------------------------------------------

/**
 * When this account's password last changed, as an ISO timestamp, or null if
 * it never has since the account was created.
 *
 * Read from the activity log, not users.updated_at: updated_at also moves on
 * unrelated edits (an admin editing, deactivating or reactivating the
 * account), so it can't say when the *password* changed. Two log actions
 * change a password, and they are keyed differently:
 *   - password_changed_by_self: logged with the user's own id as user_id;
 *   - password_reset_by_admin: logged with the ADMIN's id as user_id and the
 *     affected account as entity_id (entity_type "user").
 * The later of the two wins.
 *
 * Never throws: it feeds the profile dialog's footer through /api/me, and a
 * failed read must not break the session lookup. On error it logs and
 * returns null (the footer then shows "Never").
 */
export async function getLastPasswordChangeAt(
  userId: number
): Promise<string | null> {
  try {
    const [ownChanges, adminResets] = await Promise.all([
      db.activityLog.findMany({
        where: { userId, action: "password_changed_by_self" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      db.activityLog.findMany({
        where: {
          entityType: "user",
          entityId: userId,
          action: "password_reset_by_admin",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);

    // The newest row of each kind is first; keep whichever of the two is later.
    const candidates = [ownChanges[0]?.createdAt, adminResets[0]?.createdAt]
      .map(toIso)
      .filter((iso) => iso !== "")
      .map((iso) => ({ iso, time: new Date(iso).getTime() }))
      .filter(({ time }) => !Number.isNaN(time));
    if (candidates.length === 0) return null;

    return candidates.reduce((latest, next) =>
      next.time > latest.time ? next : latest
    ).iso;
  } catch (error) {
    console.error("getLastPasswordChangeAt failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sign-in throttle (BUG-03)
// ---------------------------------------------------------------------------

/** Port of login_throttle.php: 5 failed attempts inside a 15 minute window. */
export const SIGN_IN_MAX_FAILURES = 5;
export const SIGN_IN_WINDOW_MINUTES = 15;

export type SignInThrottle =
  | { blocked: false }
  | { blocked: true; retryAfterMinutes: number };

/**
 * Whether sign-in attempts for `idNumber` are currently blocked.
 *
 * Counts `sign_in_failed` rows whose `attempted_id_number` equals the ID and
 * whose `created_at` is inside the last SIGN_IN_WINDOW_MINUTES. Served by the
 * schema's @@index([attemptedIdNumber, createdAt]).
 *
 * A blocked attempt must not extend the window (per the PHP notes). That holds
 * because signInAction logs a blocked attempt with attemptedIdNumber = null, so
 * it is invisible to this count. Only real failed guesses are counted, and a
 * successful sign-in does not reset the count (same as the PHP).
 *
 * The wait is measured from the OLDEST failure in the window: the block lifts
 * when that row ages out and the count drops below the limit.
 *
 * Unlike getLastPasswordChangeAt this does NOT swallow errors. If the count
 * cannot be read, the caller decides; signInAction fails closed (refuses the
 * attempt) rather than letting a database error switch the throttle off.
 */
export async function getSignInThrottle(
  idNumber: string
): Promise<SignInThrottle> {
  const windowMs = SIGN_IN_WINDOW_MINUTES * 60_000;
  const since = new Date(Date.now() - windowMs);

  const failures = await db.activityLog.findMany({
    where: {
      action: "sign_in_failed",
      attemptedIdNumber: idNumber,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (failures.length < SIGN_IN_MAX_FAILURES) return { blocked: false };

  // With N failures in the window, the block ends when enough of the oldest
  // ones expire to bring the count back under the limit: that is the
  // (N - MAX + 1)th oldest row.
  const decisive = failures[failures.length - SIGN_IN_MAX_FAILURES];
  const unblockAt = decisive.createdAt.getTime() + windowMs;
  const retryAfterMinutes = Math.max(
    1,
    Math.ceil((unblockAt - Date.now()) / 60_000)
  );
  return { blocked: true, retryAfterMinutes };
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

/**
 * The full `activity_logs.action` enum (prisma/contract.prisma's
 * `ActivityAction`), so a call site gets a compile error on a typo'd action
 * string instead of a silent bad insert — the same protection
 * logger.php's `in_array($action, ACTIVITY_LOG_ACTIONS, true)` check gives
 * the PHP at runtime.
 */
export type ActivityAction =
  | "item_added"
  | "item_renamed"
  | "item_deleted"
  | "item_status_changed"
  | "item_image_changed"
  | "item_bulk_deleted"
  | "account_created"
  | "account_updated"
  | "account_deactivated"
  | "account_reactivated"
  | "account_signed_up"
  | "account_approved"
  | "account_rejected"
  | "password_reset_by_admin"
  | "password_changed_by_self"
  | "borrow_approved"
  | "borrow_rejected"
  | "borrow_requested"
  | "borrow_cancelled"
  | "borrow_returned"
  | "sign_in_success"
  | "sign_in_failed"
  | "sign_out"
  | "item_overdue_reminder"
  | "email_send_failed"
  | "email_recovered"
  | "cross_office_action_blocked"
  | "unauthorized_page_access";

export type ActivityEntityType = "item" | "borrow_record" | "user" | "auth";

/**
 * Port of logger.php's logActivity($conn, $userId, $action, $entityType,
 * $entityId, $description, $office, $attemptedIdNumber): inserts one
 * `activity_logs` row.
 *
 * $entityId, $office and $attemptedIdNumber are all nullable in the PHP
 * (bind_param's "i"/"s" types handle a PHP null correctly) — the same
 * three fields default to `null` here.
 *
 * A failed write is intentionally never allowed to break the caller's own
 * flow (logger.php's own closing note: "Logging is observability, not a
 * precondition for the underlying action succeeding"). Every call site
 * should be fire-and-forget — `await logActivity(...)`, never `await`ed in a
 * way that blocks or changes what happens next, and never placed before a
 * caller's own redirect/response in a way that could short-circuit it.
 * Errors are caught and logged here, not thrown.
 */
export async function logActivity(input: {
  userId: number | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: number | null;
  description: string;
  office?: Office | null;
  attemptedIdNumber?: string | null;
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        office: input.office ?? null,
        attemptedIdNumber: input.attemptedIdNumber ?? null,
      },
    });
  } catch (error) {
    console.error("logActivity: insert failed:", error);
  }
}