// Real path: lib/email/notify.ts
//
// One function per email event. THIS is what server actions and the cron call,
// right after their database change. Each function:
//   1. loads what it needs from the database (by id),
//   2. works out the recipient(s) (recipients.ts),
//   3. builds the message from a template (templates/*),
//   4. hands it to sendEmail() (send.ts).
//
// Contract: every function here NEVER throws and never blocks the action's
// result on a failed email. A crash while loading data is caught and logged to
// the server console. Send failures are logged to Activity Logs by send.ts.
//
// Calling pattern (in a server action, after the DB update and logActivity):
//
//     await notifyRequestApproved(requestId, caller.id);
//
// Sending takes a moment (sends are spaced ~0.6 s apart for Resend's rate
// limit; a multi-admin alert sends one email per admin). If that delay is
// noticeable, wrap the call in Next's `after()` (from "next/server") so the
// response goes out first and the email is sent afterwards:
//
//     after(() => notifyRequestApproved(requestId, caller.id));
//
// TEMPLATE CONTRACT (templates are separate files, written next). Each exports
// a pure function that returns { subject, html, text } and sends nothing:
//   sign-up-approved.ts      buildSignUpApprovedEmail({ firstName, idNumber, signInUrl })
//   sign-up-rejected.ts      buildSignUpRejectedEmail({ firstName })
//   request-approved.ts      buildRequestApprovedEmail({ firstName, itemName, officeName, dueDate, borrowedItemsUrl })
//   request-rejected.ts      buildRequestRejectedEmail({ firstName, itemName, reason, note, catalogUrl })
//   request-auto-rejected.ts buildRequestAutoRejectedEmail({ firstName, itemName, cause, catalogUrl })
//   daily-unreturned.ts      buildDailyUnreturnedEmail({ firstName, itemName, officeName, dueDate, daysOverdue, borrowedItemsUrl })
//   item-returned.ts         buildItemReturnedEmail({ firstName, itemName, returnedDate, historyUrl })
//   new-request-alert.ts     buildNewRequestAlertEmail({ adminFirstName, requesterName, itemName, officeName, dueDate, requestsUrl })
//   new-sign-up-alert.ts     buildNewSignUpAlertEmail({ adminFirstName, requesterName, idNumber, signUpRequestsUrl })
//   password-reset.ts        buildPasswordResetEmail({ firstName, signInUrl })
//   account-created.ts       buildAccountCreatedEmail({ firstName, idNumber, signInUrl })
// EmailContent ({ subject, html, text }) is exported from templates/layout.ts.

import { db } from "@/prisma/db";
import { OFFICE_LABELS, type Office } from "@/lib/roles";
import { formatLongDate, isoToManilaDate, todayIso } from "@/lib/dates";
import { appUrl } from "@/lib/email/config";
import {
  getOfficeAdminRecipients,
  getSuperAdminRecipients,
  getUserRecipient,
  fullName,
  type Recipient,
} from "@/lib/email/recipients";
import {
  sendEmail,
  type EmailKind,
  type SendResult,
} from "@/lib/email/send";
import type { EmailContent } from "@/lib/email/templates/layout";
import { buildSignUpApprovedEmail } from "@/lib/email/templates/sign-up-approved";
import { buildSignUpRejectedEmail } from "@/lib/email/templates/sign-up-rejected";
import { buildRequestApprovedEmail } from "@/lib/email/templates/request-approved";
import { buildRequestRejectedEmail } from "@/lib/email/templates/request-rejected";
import { buildRequestAutoRejectedEmail } from "@/lib/email/templates/request-auto-rejected";
import { buildDailyUnreturnedEmail } from "@/lib/email/templates/daily-unreturned";
import { buildItemReturnedEmail } from "@/lib/email/templates/item-returned";
import { buildNewRequestAlertEmail } from "@/lib/email/templates/new-request-alert";
import { buildNewSignUpAlertEmail } from "@/lib/email/templates/new-sign-up-alert";
import { buildPasswordResetEmail } from "@/lib/email/templates/password-reset";
import { buildAccountCreatedEmail } from "@/lib/email/templates/account-created";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runs `fn`; any thrown error is logged and `fallback` is returned. */
async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[email] ${label} crashed:`, error);
    return fallback;
  }
}

/** Messages that have nothing to send return this. */
const SKIPPED: SendResult = { status: "skipped", reason: "nothing to send" };

interface Context {
  kind: EmailKind;
  actorUserId: number | null;
  entityType: "user" | "borrow_record";
  entityId: number;
  office?: Office | null;
}

/** Builds nothing itself: sends ready-made content to one recipient. */
function deliver(
  recipient: Recipient | null,
  content: EmailContent,
  ctx: Context,
): Promise<SendResult> {
  if (!recipient) {
    return Promise.resolve({
      status: "skipped",
      reason: "no active recipient with an email address",
    } as SendResult);
  }
  return sendEmail({
    kind: ctx.kind,
    to: recipient.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    actorUserId: ctx.actorUserId,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    office: ctx.office ?? null,
  });
}

/** A borrow request with its item and borrower recipient, or null. */
async function loadRequest(requestId: number) {
  const record = await db.borrowRecord.findFirst({ where: { id: requestId } });
  if (!record) return null;
  const item = await db.inventoryItem.findFirst({ where: { id: record.itemId } });
  if (!item) return null;
  const recipient = await getUserRecipient(record.userId);
  return { record, item, recipient, office: item.office as Office };
}

/** The date the item is due back, as an ISO string (or null). */
function dueIso(record: {
  dueAt: Date | null;
  expectedReturnDate: Date | null;
}): string | null {
  return (
    record.dueAt?.toISOString() ??
    record.expectedReturnDate?.toISOString() ??
    null
  );
}

/** "October 1, 2026" for a due date, with a safe fallback. */
function dueLabel(record: {
  dueAt: Date | null;
  expectedReturnDate: Date | null;
}): string {
  return formatLongDate(dueIso(record), "the agreed return date");
}

/** Whole calendar days from `fromDay` to `toDay` (both "YYYY-MM-DD"). */
function daysBetween(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(ms / 86_400_000);
}

/**
 * `remarks` stores "reason first, note on the next line if provided"
 * (rejectBorrowRequest in lib/repositories/borrowings.ts).
 */
function splitRemarks(remarks: string | null): { reason: string; note: string } {
  const [first = "", ...rest] = (remarks ?? "").split("\n");
  return {
    reason: first.trim() || "No reason was recorded.",
    note: rest.join("\n").trim(),
  };
}

// Fixed auto-reject reasons written by lib/repositories/borrowings.ts.
const REASON_ITEM_UNAVAILABLE = "Item marked unavailable by admin";

// ---------------------------------------------------------------------------
// E1 / E2 - sign-up decision (to the applicant)
// ---------------------------------------------------------------------------

/** E1: call after approveSignUpAction succeeds. */
export function notifySignUpApproved(
  userId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifySignUpApproved", SKIPPED, async () => {
    const user = await db.user.findFirst({ where: { id: userId } });
    if (!user) return SKIPPED;
    const content = buildSignUpApprovedEmail({
      firstName: user.firstName,
      idNumber: user.idNumber,
      signInUrl: appUrl("/sign-in"),
    });
    return deliver(await getUserRecipient(userId), content, {
      kind: "sign_up_approved",
      actorUserId,
      entityType: "user",
      entityId: userId,
    });
  });
}

/** E2: call after rejectSignUpAction succeeds. No reason is given. */
export function notifySignUpRejected(
  userId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifySignUpRejected", SKIPPED, async () => {
    const user = await db.user.findFirst({ where: { id: userId } });
    if (!user) return SKIPPED;
    const content = buildSignUpRejectedEmail({ firstName: user.firstName });
    return deliver(await getUserRecipient(userId), content, {
      kind: "sign_up_rejected",
      actorUserId,
      entityType: "user",
      entityId: userId,
    });
  });
}

// ---------------------------------------------------------------------------
// E3 / E4 / E5 / E7 - borrow request outcomes (to the borrower)
// ---------------------------------------------------------------------------

/** E3: call after approveRequestAction succeeds. */
export function notifyRequestApproved(
  requestId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifyRequestApproved", SKIPPED, async () => {
    const loaded = await loadRequest(requestId);
    if (!loaded?.recipient) return SKIPPED;
    const { record, item, recipient, office } = loaded;
    const content = buildRequestApprovedEmail({
      firstName: recipient.firstName,
      itemName: item.name,
      officeName: OFFICE_LABELS[office],
      dueDate: dueLabel(record),
      borrowedItemsUrl: appUrl("/borrower/borrowed-items"),
    });
    return deliver(recipient, content, {
      kind: "request_approved",
      actorUserId,
      entityType: "borrow_record",
      entityId: requestId,
      office,
    });
  });
}

/** E4: call after rejectRequestAction succeeds. Reason/note come from `remarks`. */
export function notifyRequestRejected(
  requestId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifyRequestRejected", SKIPPED, async () => {
    const loaded = await loadRequest(requestId);
    if (!loaded?.recipient) return SKIPPED;
    const { record, item, recipient, office } = loaded;
    const { reason, note } = splitRemarks(record.remarks);
    const content = buildRequestRejectedEmail({
      firstName: recipient.firstName,
      itemName: item.name,
      reason,
      note,
      catalogUrl: appUrl("/borrower/catalog"),
    });
    return deliver(recipient, content, {
      kind: "request_rejected",
      actorUserId,
      entityType: "borrow_record",
      entityId: requestId,
      office,
    });
  });
}

/**
 * E5: the pending requests that were auto-rejected on one item (another
 * request was approved, or the item was marked unavailable).
 *
 * The repository only returns a COUNT, so this finds the rows itself: rejected
 * requests for `itemId` with no approver (approvedById null) that were stamped
 * at or after `since`. Capture `since` just BEFORE calling the repository:
 *
 *     const since = new Date();
 *     const result = await approveBorrowRequest(...);
 *     if (result.ok && result.autoRejectedCount) {
 *       await notifyRequestsAutoRejected(itemId, since, caller.id);
 *     }
 *
 * Returns how many emails were sent.
 */
export function notifyRequestsAutoRejected(
  itemId: number,
  since: Date,
  actorUserId: number | null,
): Promise<number> {
  return safe("notifyRequestsAutoRejected", 0, async () => {
    const item = await db.inventoryItem.findFirst({ where: { id: itemId } });
    if (!item) return 0;
    const office = item.office as Office;

    const records = await db.borrowRecord.findMany({
      where: {
        itemId,
        status: "rejected",
        approvedById: null,
        approvedAt: { gte: since },
      },
      orderBy: { id: "asc" },
    });

    let sent = 0;
    for (const record of records) {
      const recipient = await getUserRecipient(record.userId);
      if (!recipient) continue;
      const content = buildRequestAutoRejectedEmail({
        firstName: recipient.firstName,
        itemName: item.name,
        cause:
          record.remarks === REASON_ITEM_UNAVAILABLE
            ? "item_unavailable"
            : "borrowed_by_other",
        catalogUrl: appUrl("/borrower/catalog"),
      });
      const result = await deliver(recipient, content, {
        kind: "request_auto_rejected",
        actorUserId,
        entityType: "borrow_record",
        entityId: record.id,
        office,
      });
      if (result.status === "sent") sent++;
    }
    return sent;
  });
}

/** E7: call after markReturnedAction succeeds. */
export function notifyItemReturned(
  requestId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifyItemReturned", SKIPPED, async () => {
    const loaded = await loadRequest(requestId);
    if (!loaded?.recipient) return SKIPPED;
    const { record, item, recipient, office } = loaded;
    const content = buildItemReturnedEmail({
      firstName: recipient.firstName,
      itemName: item.name,
      returnedDate: formatLongDate(
        record.returnedAt?.toISOString() ?? new Date().toISOString(),
      ),
      historyUrl: appUrl("/borrower/history"),
    });
    return deliver(recipient, content, {
      kind: "item_returned",
      actorUserId,
      entityType: "borrow_record",
      entityId: requestId,
      office,
    });
  });
}

// ---------------------------------------------------------------------------
// E6 - daily unreturned-item notice (to the borrower)
// ---------------------------------------------------------------------------

/**
 * E6: one borrow record's daily notice. Called by the 8:00 AM cron for each
 * record that is 'borrowed' or 'overdue' with a due day of today or earlier.
 *
 * Returns the SendResult so the cron knows whether to set
 * `lastOverdueEmailOn` to today: set it ONLY when status is "sent" (a failed
 * send leaves the date alone, so the next run retries). A record that is no
 * longer borrowed/overdue, or whose borrower has no email, returns "skipped".
 *
 * `daysOverdue` is 0 on the due date itself ("due today" wording) and 1 or
 * more after it ("overdue" wording).
 */
export function notifyDailyUnreturned(requestId: number): Promise<SendResult> {
  return safe("notifyDailyUnreturned", SKIPPED, async () => {
    const loaded = await loadRequest(requestId);
    if (!loaded?.recipient) return SKIPPED;
    const { record, item, recipient, office } = loaded;
    if (record.status !== "borrowed" && record.status !== "overdue") {
      return SKIPPED;
    }

    const iso = dueIso(record);
    const dueDay = iso ? isoToManilaDate(iso) : "";
    if (!dueDay) return SKIPPED;
    const daysOverdue = Math.max(0, daysBetween(dueDay, todayIso()));

    const content = buildDailyUnreturnedEmail({
      firstName: recipient.firstName,
      itemName: item.name,
      officeName: OFFICE_LABELS[office],
      dueDate: dueLabel(record),
      daysOverdue,
      borrowedItemsUrl: appUrl("/borrower/borrowed-items"),
    });
    return deliver(recipient, content, {
      kind: "daily_unreturned",
      actorUserId: null, // sent by the cron, not by a person
      entityType: "borrow_record",
      entityId: requestId,
      office,
    });
  });
}

// ---------------------------------------------------------------------------
// E8 / E9 - alerts to admins (one email per admin)
// ---------------------------------------------------------------------------

/**
 * E8: call after a borrower submits a request. Goes to every active admin of
 * the item's office (not super admins), each as their own email.
 * Returns how many emails were sent.
 */
export function notifyNewRequestAlert(requestId: number): Promise<number> {
  return safe("notifyNewRequestAlert", 0, async () => {
    const record = await db.borrowRecord.findFirst({ where: { id: requestId } });
    if (!record) return 0;
    const item = await db.inventoryItem.findFirst({ where: { id: record.itemId } });
    const requester = await db.user.findFirst({ where: { id: record.userId } });
    if (!item || !requester) return 0;
    const office = item.office as Office;

    const admins = await getOfficeAdminRecipients(office);
    let sent = 0;
    for (const admin of admins) {
      const content = buildNewRequestAlertEmail({
        adminFirstName: admin.firstName,
        requesterName: fullName(requester),
        itemName: item.name,
        officeName: OFFICE_LABELS[office],
        dueDate: dueLabel(record),
        requestsUrl: appUrl("/admin/requests"),
      });
      const result = await deliver(admin, content, {
        kind: "new_request_alert",
        actorUserId: requester.id,
        entityType: "borrow_record",
        entityId: requestId,
        office,
      });
      if (result.status === "sent") sent++;
    }
    return sent;
  });
}

/**
 * E9: call after a sign-up request is submitted (also after a rejected
 * applicant resubmits). Goes to every active super admin, each as their own
 * email. Returns how many emails were sent.
 */
export function notifyNewSignUpAlert(userId: number): Promise<number> {
  return safe("notifyNewSignUpAlert", 0, async () => {
    const applicant = await db.user.findFirst({ where: { id: userId } });
    if (!applicant) return 0;

    const admins = await getSuperAdminRecipients();
    let sent = 0;
    for (const admin of admins) {
      const content = buildNewSignUpAlertEmail({
        adminFirstName: admin.firstName,
        requesterName: fullName(applicant),
        idNumber: applicant.idNumber,
        signUpRequestsUrl: appUrl("/admin/sign-up-requests"),
      });
      const result = await deliver(admin, content, {
        kind: "new_sign_up_alert",
        actorUserId: applicant.id,
        entityType: "user",
        entityId: userId,
      });
      if (result.status === "sent") sent++;
    }
    return sent;
  });
}

// ---------------------------------------------------------------------------
// E10 / E11 - account emails (to that user)
// ---------------------------------------------------------------------------

/**
 * E10: call after an admin sets a new password for a user (editUserAction with
 * a new password). The email never contains the password.
 */
export function notifyPasswordReset(
  userId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifyPasswordReset", SKIPPED, async () => {
    const recipient = await getUserRecipient(userId);
    if (!recipient) return SKIPPED;
    const content = buildPasswordResetEmail({
      firstName: recipient.firstName,
      signInUrl: appUrl("/sign-in"),
    });
    return deliver(recipient, content, {
      kind: "password_reset",
      actorUserId,
      entityType: "user",
      entityId: userId,
    });
  });
}

/**
 * E11: call after an admin creates an account (addUserAction). Goes to the
 * email entered for the new account. The email never contains the password.
 */
export function notifyAccountCreated(
  userId: number,
  actorUserId: number | null,
): Promise<SendResult> {
  return safe("notifyAccountCreated", SKIPPED, async () => {
    const user = await db.user.findFirst({ where: { id: userId } });
    if (!user) return SKIPPED;
    const content = buildAccountCreatedEmail({
      firstName: user.firstName,
      idNumber: user.idNumber,
      signInUrl: appUrl("/sign-in"),
    });
    return deliver(await getUserRecipient(userId), content, {
      kind: "account_created",
      actorUserId,
      entityType: "user",
      entityId: userId,
    });
  });
}

// ---------------------------------------------------------------------------
// E6 batch - the 8:00 AM daily job
// ---------------------------------------------------------------------------

export interface DailyUnreturnedSummary {
  /** Records due today or earlier that had not been emailed today. */
  eligible: number;
  /** Emails Resend accepted (and whose lastOverdueEmailOn was set). */
  sent: number;
  /** Nothing to send: no active borrower email, or no longer borrowed. */
  skipped: number;
  /** Sends that failed; they are retried on the next run. */
  failed: number;
}

/**
 * Sends the E6 notice for every borrow record that is 'borrowed' or 'overdue',
 * is due today or earlier (Manila day), and has not been emailed today. Called
 * once a day by app/api/cron/mark-overdue/route.ts, after the overdue marking.
 *
 * Once-per-day rule: `lastOverdueEmailOn` is set to today ONLY when the send
 * succeeds. Running the job twice in a day therefore sends nothing the second
 * time, and a failed send is picked up by the next run. Records that are
 * returned drop out of the query, so the emails stop on their own.
 *
 * Never throws: a problem with one record is logged and the rest still run.
 * Sends are spaced out by send.ts (Resend's rate limit), so a long list takes
 * a while; the route sets maxDuration for that.
 */
export async function sendDailyUnreturnedEmails(
  now: Date = new Date(),
): Promise<DailyUnreturnedSummary> {
  const summary: DailyUnreturnedSummary = {
    eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  return safe("sendDailyUnreturnedEmails", summary, async () => {
    const today = todayIso(now);
    // @db.Date column: midnight UTC of the Manila calendar day.
    const todayDate = new Date(`${today}T00:00:00.000Z`);

    const candidates = await db.borrowRecord.findMany({
      where: {
        status: { in: ["borrowed", "overdue"] },
        OR: [
          { lastOverdueEmailOn: null },
          { lastOverdueEmailOn: { lt: todayDate } },
        ],
      },
      orderBy: { id: "asc" },
    });

    // Due day (Manila) is today or earlier.
    const due = candidates.filter((record) => {
      const iso = dueIso(record);
      const dueDay = iso ? isoToManilaDate(iso) : "";
      return dueDay !== "" && dueDay <= today;
    });
    summary.eligible = due.length;

    for (const record of due) {
      const result = await notifyDailyUnreturned(record.id);
      if (result.status === "sent") {
        summary.sent++;
        // Set the date only after a successful send.
        await db.borrowRecord
          .update({
            where: { id: record.id },
            data: { lastOverdueEmailOn: todayDate },
          })
          .catch((error: unknown) => {
            console.error(
              `[email] could not set lastOverdueEmailOn for record ${record.id}:`,
              error,
            );
          });
      } else if (result.status === "skipped") {
        summary.skipped++;
      } else {
        summary.failed++;
      }
    }

    return summary;
  });
}