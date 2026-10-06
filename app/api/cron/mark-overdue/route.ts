import { NextResponse, type NextRequest } from "next/server";

import { markOverdueBorrowRecords } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";
import { sendDailyUnreturnedEmails } from "@/lib/email/notify";

// ---------------------------------------------------------------------------
// GET /api/cron/mark-overdue
//
// Real path: app/api/cron/mark-overdue/route.ts
//
// The daily job. It does two things, in this order:
//
//   1. BUG-13: stores `status = 'overdue'` on every borrowed record whose due
//      day (Manila calendar day) has passed, and writes one
//      `item_overdue_reminder` activity-log row for each record it flips.
//   2. E6 email: sends each borrower whose item is due today or already
//      overdue ONE notice ("Due today" / "Overdue by N days"), every day until
//      the item is marked returned (sendDailyUnreturnedEmails in
//      lib/email/notify.ts). `borrow_records.lastOverdueEmailOn` keeps it to
//      one email per record per Manila day.
//
// SCHEDULE: every day at 8:00 AM Philippine time, so the emails arrive in the
// morning and not at midnight. Schedulers such as Vercel Cron use UTC, and
// 8:00 AM Manila (UTC+8, no daylight saving) is 00:00 UTC: `0 0 * * *`
// (see vercel.json).
//
// Why it exists alongside the read-time check: borrower and admin pages already
// SHOW a past-due borrowed item as overdue on every load (effectiveStatus in
// lib/repositories/borrowings.ts), so this job is not what keeps the screens
// right. It is what makes the DATABASE agree, and it is the only thing that can
// record a reminder once per record (and, later, send a reminder email).
//
// SCHEDULING. vercel.json (project root) registers this route with Vercel Cron.
// Vercel Cron runs ONLY on production deployments, so nothing calls it while
// the project is in local development. Until it is deployed, run it by hand
// whenever you want overdue items marked and the daily emails sent:
//
//   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/mark-overdue
//
// <CRON_SECRET> must match the CRON_SECRET value in .env.local (see
// .env.example). A GET with no body is all it needs; a successful run
// answers `{ "ok": true, "markedOverdue": <n> }`.
//
// Running it manually, on no fixed schedule, is completely safe: the job is
// idempotent (see below), so calling it twice in a row, or skipping a day,
// never double-marks a record, double-logs a reminder or double-sends a notice
// on the same day.
//
// Using a different host? Replace vercel.json with that platform's scheduler
// hitting this same URL once a day at 8:00 AM Manila (00:00 UTC):
//   - GitHub Actions     → a workflow on a `schedule:` cron trigger that curls
//     the deployed URL with the same Authorization header
//   - Any other host     → system crontab, `node-cron`, etc. calling the same
//     URL the same way
// Only the *caller* changes — this route itself does not need to change.
//
// Vercel Hobby (free) plan notes: a cron may run once a day at most, and it can
// fire anywhere inside the scheduled hour (so 8:00-8:59 AM Manila); a run can
// very occasionally fire twice, which is harmless here (see "Idempotent").
// Function time limits also apply; the emails are sent one at a time, so a long
// list of overdue items needs `maxDuration` (set below) to be allowed to finish.
//
// SECURITY. This route writes to the database and the activity log, so it must
// not be callable by anyone who finds the URL:
//   - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
//     when a CRON_SECRET environment variable is set on the project;
//   - the route compares that header to CRON_SECRET and answers 401 otherwise;
//   - if CRON_SECRET is not set at all it answers 500 and does nothing (fails
//     closed), rather than running open to the world.
// It is under /api, so proxy.ts (whose matcher skips /api/*) does not touch it,
// and it does not use the user session: there is no signed-in user here.
//
// Idempotent: markOverdueBorrowRecords() only ever touches 'borrowed' rows, so
// re-running it (a retry, a manual trigger) flips nothing twice and writes no
// duplicate log rows. The emails skip any record already emailed today, so a
// re-run sends nothing twice; a record whose send failed is retried.
//
// BEFORE GOING TO PRODUCTION: emails use sandbox mode until EMAIL_SANDBOX is
// set to false on the host. See the checklist at the top of lib/email/send.ts.
// ---------------------------------------------------------------------------

// Prisma and the pg adapter need the Node.js runtime, not the Edge runtime.
export const runtime = "nodejs";
// This must run on every request, never be prerendered or cached.
export const dynamic = "force-dynamic";
// Emails are sent one at a time (about 0.6 s apart for Resend's rate limit), so
// give the job room to finish. The platform's own plan limit still applies.
export const maxDuration = 60;

/** Constant-time string compare, so the secret cannot be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unset secret must never mean "no protection".
    console.error(
      "[cron/mark-overdue] CRON_SECRET is not set; refusing to run."
    );
    return NextResponse.json(
      { ok: false, error: "Cron is not configured." },
      { status: 500 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let changed;
  try {
    changed = await markOverdueBorrowRecords();
  } catch (error) {
    console.error("[cron/mark-overdue] job failed:", error);
    return NextResponse.json(
      { ok: false, error: "The overdue job failed." },
      { status: 500 }
    );
  }

  // One log row per record the job just flipped. logActivity() never throws
  // (it catches and logs its own failures), so a logging problem cannot undo
  // or hide the status changes above. userId is the BORROWER the reminder is
  // about; there is no acting admin for a scheduled job.
  for (const record of changed) {
    await logActivity({
      userId: record.userId,
      action: "item_overdue_reminder",
      entityType: "borrow_record",
      entityId: record.id,
      description: `"${record.itemName}" was due on ${record.dueDay} and is now overdue.`,
      office: record.itemOffice,
    });
  }

  // E6: the daily emails. sendDailyUnreturnedEmails never throws, and a
  // failure here must not hide the overdue marking above, so the response
  // still reports ok.
  const emails = await sendDailyUnreturnedEmails();

  return NextResponse.json({
    ok: true,
    markedOverdue: changed.length,
    emails,
  });
}