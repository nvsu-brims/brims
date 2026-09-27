import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getPendingBorrowRequests } from "@/lib/repositories/borrowings";

// ---------------------------------------------------------------------------
// GET /api/pending-requests-count
//
// Returns { count } — the number of pending borrow requests visible to the
// signed-in admin (office-scoped for SDO/UCAO admins, all offices for the
// super admin). Backs the "Borrower Requests" sidebar badge in
// admin-layout.tsx, which fetches this on mount and on every pathname change.
//
// 401 with { count: 0 } if there is no valid admin session — the layout's
// .catch() already falls back to 0, so this just makes the no-session case
// explicit rather than throwing.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getSession();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const pending = await getPendingBorrowRequests(user.office);
  return NextResponse.json({ count: pending.length });
}