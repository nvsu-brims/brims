import { NextResponse, type NextRequest } from "next/server";

import { markOverdueBorrowRecords } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";

// ---------------------------------------------------------------------------
// GET /api/cron/mark-overdue
//
// Real path: app/api/cron/mark-overdue/route.ts
//
// The daily job for BUG-13. It stores `status = 'overdue'` on every borrowed
// record whose due day (Manila calendar day) has passed, and writes one
// `item_overdue_reminder` activity-log row for each record it flips.
//
// Why it exists alongside the read-time check: borrower and admin pages already
// SHOW a past-due borrowed item as overdue on every load (effectiveStatus in
// lib/repositories/borrowings.ts), so this job is not what keeps the screens
// right. It is what makes the DATABASE agree, and it is the only thing that can
// record a reminder once per record (and, later, send a reminder email).
//
// NOT YET SCHEDULED. Nothing calls this route automatically today — this
// project is still in local development and has not been deployed anywhere,
// so there is no scheduler to wire up yet. Until one exists, run it by hand
// whenever you want overdue items marked (once a day is enough):
//
//   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/mark-overdue
//
// <CRON_SECRET> must match the CRON_SECRET value in .env.local (see
// .env.example). A GET with no body is all it needs; a successful run
// answers `{ "ok": true, "markedOverdue": <n> }`.
//
// Running it manually, on no fixed schedule, is completely safe: the job is
// idempotent (see below), so calling it twice in a row, or skipping a day,
// never double-marks a record or double-logs a reminder.
//
// Once this project is deployed, replace the manual curl above with a real
// scheduler that hits this same URL once a day, e.g.:
//   - Vercel Cron        → a `vercel.json` with a "crons" entry
//     ({ "path": "/api/cron/mark-overdue", "schedule": "5 16 * * *" }, i.e.
//     16:05 UTC = 00:05 Manila, just after the Manila day rolls over)
//   - GitHub Actions     → a workflow on a `schedule:` cron trigger that curls
//     the deployed URL with the same Authorization header
//   - Any other host     → that platform's own scheduler (system crontab,
//     `node-cron`, etc.) calling the same URL the same way
// Whichever is chosen, only the *caller* changes — this route itself does not
// need to change.
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
// duplicate log rows.
// ---------------------------------------------------------------------------

// Prisma and the pg adapter need the Node.js runtime, not the Edge runtime.
export const runtime = "nodejs";
// This must run on every request, never be prerendered or cached.
export const dynamic = "force-dynamic";

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

  return NextResponse.json({ ok: true, markedOverdue: changed.length });
}