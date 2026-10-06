"use server";

// TEMPORARY - DELETE BEFORE PRODUCTION.
// Real path: app/dev/email-test/actions.ts
//
// Server actions behind the email test page. Three buttons per email:
//   - previewEmailAction     builds the email from SAMPLE data and returns it.
//                            Nothing is sent and Resend is not called.
//   - sendSampleEmailAction  sends that sample email through sendEmail() and
//                            Resend, exactly like a real email.
//   - runRealNotifyAction    runs the REAL notify...() function for an existing
//                            record id, so the database loading, the recipient
//                            lookup and the Activity Log entry are tested too.
//
// Safety, because these actions can send email:
//   1. Disabled when NODE_ENV is "production".
//   2. Signed-in admins only.
//   3. Sending is refused unless EMAIL_SANDBOX is true, so a test can never
//      reach a real borrower or admin. In sandbox mode every email goes to
//      EMAIL_SANDBOX_TO with the intended recipient in the subject.

import { requireAdminAction } from "@/lib/require-admin";
import { getEmailConfig } from "@/lib/email/config";
import { sendEmail, type EmailKind, type SendResult } from "@/lib/email/send";
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
import {
  notifyAccountCreated,
  notifyDailyUnreturned,
  notifyItemReturned,
  notifyNewRequestAlert,
  notifyNewSignUpAlert,
  notifyPasswordReset,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyRequestsAutoRejected,
  notifySignUpApproved,
  notifySignUpRejected,
} from "@/lib/email/notify";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type PreviewResult =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

type Guard = { ok: true; actorId: number } | { ok: false; error: string };

async function guard(): Promise<Guard> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "The email test page is disabled in production." };
  }
  const auth = await requireAdminAction("Sign in as an admin to use this page.");
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, actorId: auth.caller.id };
}

/** Null when sending is allowed (sandbox on), otherwise the reason it is not. */
function sandboxProblem(): string | null {
  try {
    if (!getEmailConfig().sandbox) {
      return (
        "Refusing to send: EMAIL_SANDBOX is not true, so this would email real " +
        'recipients. Set EMAIL_SANDBOX="true" in .env.local and restart the server.'
      );
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// ---------------------------------------------------------------------------
// Sample data (previews and "Send sample")
// ---------------------------------------------------------------------------

const BASE = "http://localhost:3000";
const SAMPLE_TO = "juan.delacruz@example.com";

const SAMPLES: Record<EmailKind, () => EmailContent> = {
  sign_up_approved: () =>
    buildSignUpApprovedEmail({
      firstName: "Juan",
      idNumber: "2023-00123",
      signInUrl: `${BASE}/sign-in`,
    }),
  sign_up_rejected: () => buildSignUpRejectedEmail({ firstName: "Juan" }),
  request_approved: () =>
    buildRequestApprovedEmail({
      firstName: "Juan",
      itemName: "Projector",
      officeName: "Sports Development Office",
      dueDate: "October 10, 2026",
      borrowedItemsUrl: `${BASE}/borrower/borrowed-items`,
    }),
  request_rejected: () =>
    buildRequestRejectedEmail({
      firstName: "Juan",
      itemName: "Projector",
      reason: "Other",
      note: "Needed for a school event on the same day.",
      catalogUrl: `${BASE}/borrower/catalog`,
    }),
  request_auto_rejected: () =>
    buildRequestAutoRejectedEmail({
      firstName: "Juan",
      itemName: "Projector",
      cause: "borrowed_by_other",
      catalogUrl: `${BASE}/borrower/catalog`,
    }),
  daily_unreturned: () =>
    buildDailyUnreturnedEmail({
      firstName: "Juan",
      itemName: "Projector",
      officeName: "Sports Development Office",
      dueDate: "October 1, 2026",
      daysOverdue: 3,
      borrowedItemsUrl: `${BASE}/borrower/borrowed-items`,
    }),
  item_returned: () =>
    buildItemReturnedEmail({
      firstName: "Juan",
      itemName: "Projector",
      returnedDate: "October 2, 2026",
      historyUrl: `${BASE}/borrower/history`,
    }),
  new_request_alert: () =>
    buildNewRequestAlertEmail({
      adminFirstName: "Maria",
      requesterName: "Juan Dela Cruz",
      itemName: "Projector",
      officeName: "Sports Development Office",
      dueDate: "October 10, 2026",
      requestsUrl: `${BASE}/admin/requests`,
    }),
  new_sign_up_alert: () =>
    buildNewSignUpAlertEmail({
      adminFirstName: "Maria",
      requesterName: "Juan Dela Cruz",
      idNumber: "2023-00123",
      signUpRequestsUrl: `${BASE}/admin/sign-up-requests`,
    }),
  password_reset: () =>
    buildPasswordResetEmail({ firstName: "Juan", signInUrl: `${BASE}/sign-in` }),
  account_created: () =>
    buildAccountCreatedEmail({
      firstName: "Juan",
      idNumber: "2023-00123",
      signInUrl: `${BASE}/sign-in`,
    }),
};

function describe(result: SendResult): ActionResult {
  switch (result.status) {
    case "sent":
      return {
        ok: true,
        message: result.sandbox
          ? `Sent via Resend (id ${result.id ?? "n/a"}). Check your sandbox inbox.`
          : `Sent via Resend (id ${result.id ?? "n/a"}).`,
      };
    case "skipped":
      return { ok: true, message: `Skipped: ${result.reason}.` };
    case "failed":
      return {
        ok: false,
        error: `Failed: ${result.error}. An email_send_failed row was written to Activity Logs.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Builds the email from sample data. Sends nothing. */
export async function previewEmailAction(kind: EmailKind): Promise<PreviewResult> {
  const g = await guard();
  if (!g.ok) return g;
  const build = SAMPLES[kind];
  if (!build) return { ok: false, error: "Unknown email." };
  const content = build();
  return { ok: true, subject: content.subject, html: content.html, text: content.text };
}

/** Sends the sample email through sendEmail() and Resend (sandbox only). */
export async function sendSampleEmailAction(kind: EmailKind): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const problem = sandboxProblem();
  if (problem) return { ok: false, error: problem };

  const build = SAMPLES[kind];
  if (!build) return { ok: false, error: "Unknown email." };
  const content = build();

  const result = await sendEmail({
    kind,
    to: SAMPLE_TO,
    subject: content.subject,
    html: content.html,
    text: content.text,
    actorUserId: g.actorId,
    entityType: "user",
    entityId: null,
  });
  return describe(result);
}

/**
 * Runs the REAL notify...() function for an existing record. `id` is a user id,
 * a borrow request id or an item id depending on the email (the page labels
 * the field). Sandbox only, so it still lands in your own inbox.
 *
 * Note: E5 uses requests auto-rejected in the LAST HOUR for that item, and E6
 * sends the notice for that one record without touching lastOverdueEmailOn.
 */
export async function runRealNotifyAction(
  kind: EmailKind,
  id: number,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const problem = sandboxProblem();
  if (problem) return { ok: false, error: problem };
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Enter a valid id (a whole number above 0)." };
  }

  const actor = g.actorId;
  switch (kind) {
    case "sign_up_approved":
      return describe(await notifySignUpApproved(id, actor));
    case "sign_up_rejected":
      return describe(await notifySignUpRejected(id, actor));
    case "request_approved":
      return describe(await notifyRequestApproved(id, actor));
    case "request_rejected":
      return describe(await notifyRequestRejected(id, actor));
    case "daily_unreturned":
      return describe(await notifyDailyUnreturned(id));
    case "item_returned":
      return describe(await notifyItemReturned(id, actor));
    case "password_reset":
      return describe(await notifyPasswordReset(id, actor));
    case "account_created":
      return describe(await notifyAccountCreated(id, actor));
    case "request_auto_rejected": {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const sent = await notifyRequestsAutoRejected(id, since, actor);
      return {
        ok: true,
        message:
          `${sent} auto-rejected email(s) sent for item #${id} ` +
          "(requests auto-rejected in the last hour).",
      };
    }
    case "new_request_alert": {
      const sent = await notifyNewRequestAlert(id);
      return { ok: true, message: `${sent} admin alert email(s) sent for request #${id}.` };
    }
    case "new_sign_up_alert": {
      const sent = await notifyNewSignUpAlert(id);
      return { ok: true, message: `${sent} super admin alert email(s) sent for user #${id}.` };
    }
  }
}