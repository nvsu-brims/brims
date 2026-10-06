// Real path: lib/email/send.ts
//
// The ONLY file that talks to Resend. Everything else builds an email
// (templates/*) and hands it to sendEmail().
//
// ============================================================================
// BEFORE GOING TO PRODUCTION  (while developing locally, sandbox mode is ON)
// ============================================================================
//   While EMAIL_SANDBOX is true, EVERY email is redirected to EMAIL_SANDBOX_TO
//   and no real borrower or admin receives anything. To send for real:
//
//   1. Verify your sending domain in Resend (Domains -> Add Domain -> add the
//      DNS records it shows, wait for "Verified").
//   2. On the host (e.g. Vercel -> Project -> Settings -> Environment
//      Variables, "Production"), set:
//        EMAIL_FROM        = BRIMS <no-reply@your-verified-domain>
//        EMAIL_SANDBOX     = false
//        APP_BASE_URL      = https://your-real-site-address
//        RESEND_API_KEY    = a production key (not the one used for testing)
//        CRON_SECRET       = already required by the daily cron
//      EMAIL_SANDBOX_TO is then ignored and can be removed.
//   3. Remove onboarding@resend.dev everywhere. config.ts refuses to start in
//      production with a @resend.dev sender.
//   4. Send one real email to yourself first (approve a test request) before
//      announcing the system to users.
//   5. Do NOT copy your personal sandbox address into .env.example or commit
//      .env.local.
// ============================================================================
//
// Contract (see EMAIL-NOTIFICATIONS-PLAN.md, section 5):
//   - sendEmail() NEVER throws. An email problem must never break the action
//     that triggered it (same rule as logActivity()). It returns a result, and
//     on failure it writes an `email_send_failed` Activity Log row.
//   - Resend's SDK does not throw on API errors; it returns { data, error }.
//     This file checks `error` explicitly, and also catches network throws.
//   - On a transient error it retries ONCE immediately (after a short pause).
//     Validation / bad-API-key errors are not retried, since a retry cannot fix
//     them.
//   - One-time emails are sent once (plus that single retry). There is no
//     queue and no automatic resend later (Option C).
//   - Sends are spaced out (see MIN_GAP_MS) because Resend's default rate limit
//     is about 2 requests per second; a multi-admin alert sends one email per
//     admin, one after another.

import { Resend } from "resend";
import { getEmailConfig } from "@/lib/email/config";
import {
  logActivity,
  type ActivityEntityType,
} from "@/lib/repositories/activity-logs";
import type { Office } from "@/lib/roles";

/** Every email the system sends. Used in the failure log, never shown to users. */
export type EmailKind =
  | "sign_up_approved" // E1
  | "sign_up_rejected" // E2
  | "request_approved" // E3
  | "request_rejected" // E4
  | "request_auto_rejected" // E5
  | "daily_unreturned" // E6
  | "item_returned" // E7
  | "new_request_alert" // E8
  | "new_sign_up_alert" // E9
  | "password_reset" // E10
  | "account_created"; // E11

export interface SendEmailInput {
  /** Which email this is (for the failure log). */
  kind: EmailKind;
  /** The REAL intended recipient. In sandbox mode it is redirected. */
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;

  // --- Context for the `email_send_failed` Activity Log row ---------------
  /** Who triggered it (the acting admin / user), or null for the system/cron. */
  actorUserId?: number | null;
  /** What the email was about, so an admin can find the record. */
  entityType?: ActivityEntityType;
  entityId?: number | null;
  office?: Office | null;
}

export type SendResult =
  | { status: "sent"; id: string | null; sandbox: boolean }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

// ---------------------------------------------------------------------------
// Rate limiting: sends run one at a time with a pause between them.
// ---------------------------------------------------------------------------

/** Minimum gap between two Resend calls from this server process, in ms. */
const MIN_GAP_MS = 600;

/** Pause before the single retry, in ms. */
const RETRY_DELAY_MS = 1200;

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `task` after every earlier task, at least MIN_GAP_MS after the last call. */
function inLine<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  // Keep the chain alive even if a task rejects.
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Resend client (created once)
// ---------------------------------------------------------------------------

let client: Resend | null = null;
let clientKey = "";

function getClient(apiKey: string): Resend {
  if (!client || clientKey !== apiKey) {
    client = new Resend(apiKey);
    clientKey = apiKey;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ResendErrorLike {
  name?: string;
  message: string;
  statusCode?: number | null;
}

/** Retry only errors that could succeed on a second try. */
function isRetryable(error: ResendErrorLike): boolean {
  const status = error.statusCode ?? null;
  if (status === 429 || (status !== null && status >= 500)) return true;
  switch (error.name) {
    case "rate_limit_exceeded":
    case "application_error":
    case "internal_server_error":
    case "network_error": // our own marker for a thrown fetch error
      return true;
    default:
      // validation_error, invalid_api_key, restricted_api_key,
      // missing_required_field, ... : a retry cannot fix these.
      return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One line, no control characters: safe for a subject / log text. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Looks like an email address (not a full validation; Resend validates too). */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** One attempt. Returns the Resend id on success, or an error object. */
async function attempt(
  resend: Resend,
  payload: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  },
): Promise<{ id: string | null } | { error: ResendErrorLike }> {
  try {
    const { data, error } = await resend.emails.send(payload);
    if (error) {
      return {
        error: {
          name: error.name,
          message: error.message,
          statusCode: (error as { statusCode?: number | null }).statusCode,
        },
      };
    }
    return { id: data?.id ?? null };
  } catch (thrown) {
    return {
      error: {
        name: "network_error",
        message: thrown instanceof Error ? thrown.message : String(thrown),
      },
    };
  }
}

async function logFailure(
  input: SendEmailInput,
  intendedTo: string,
  reason: string,
): Promise<void> {
  const description = oneLine(
    `Email "${input.kind}" to ${intendedTo} failed: ${reason}`,
  ).slice(0, 250);
  console.error(`[email] ${description}`);
  await logActivity({
    userId: input.actorUserId ?? null,
    action: "email_send_failed",
    entityType: input.entityType ?? "user",
    entityId: input.entityId ?? null,
    description,
    office: input.office ?? null,
  });
}

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

/**
 * Sends one email. Never throws. See the contract at the top of this file.
 *
 * Sandbox mode (EMAIL_SANDBOX=true, the default outside production): the email
 * goes to EMAIL_SANDBOX_TO, the subject becomes "[SANDBOX -> intended
 * recipient] ...", and a banner naming the intended recipient is added to the
 * body. The Activity Log always names the REAL intended recipient.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const intendedTo = input.to?.trim() ?? "";

  // Users without an email address are skipped silently (plan, decision 6).
  if (!intendedTo) {
    return { status: "skipped", reason: "no recipient email address" };
  }

  let config;
  try {
    config = getEmailConfig();
  } catch (configError) {
    const reason =
      configError instanceof Error ? configError.message : String(configError);
    await logFailure(input, intendedTo, `email is not configured: ${reason}`);
    return { status: "failed", error: reason };
  }

  // A malformed real address would only matter outside sandbox, but flag it in
  // both so the problem shows up during development.
  if (!looksLikeEmail(intendedTo)) {
    const reason = "invalid recipient email address";
    await logFailure(input, intendedTo, reason);
    return { status: "failed", error: reason };
  }

  // --- Sandbox redirect ----------------------------------------------------
  let to = intendedTo;
  let subject = oneLine(input.subject);
  let html = input.html;
  let text = input.text;

  if (config.sandbox) {
    to = config.sandboxTo;
    subject = `[SANDBOX → ${intendedTo}] ${subject}`;
    html =
      `<div style="background:#fff7d6;border:1px solid #e6c84f;color:#5c4a00;` +
      `padding:8px 12px;margin:0 0 12px;font:13px/1.4 Arial,sans-serif;">` +
      `<strong>SANDBOX</strong> &mdash; this email was intended for ` +
      `<strong>${escapeHtml(intendedTo)}</strong>.</div>` +
      html;
    text = `[SANDBOX] This email was intended for ${intendedTo}.\n\n${text}`;
  }

  const resend = getClient(config.apiKey);
  const payload = { from: config.from, to, subject, html, text };

  // --- Send, retrying once on a transient error ----------------------------
  let outcome = await inLine(() => attempt(resend, payload));

  if ("error" in outcome && isRetryable(outcome.error)) {
    await sleep(RETRY_DELAY_MS);
    outcome = await inLine(() => attempt(resend, payload));
  }

  if ("error" in outcome) {
    await logFailure(input, intendedTo, outcome.error.message);
    return { status: "failed", error: outcome.error.message };
  }

  return { status: "sent", id: outcome.id, sandbox: config.sandbox };
}