import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getBorrowerHomeStats } from "@/lib/repositories/borrowings";

// ---------------------------------------------------------------------------
// GET /api/borrower-borrowed-items-count
//
// Returns { count } — the number of the signed-in borrower's own currently
// borrowed items (status 'borrowed' or 'overdue'). Backs the "Borrowed
// Items" sidebar badge in borrower-layout.tsx, mirroring the admin's
// borrowed-items-count route.
//
// 401 with { count: 0 } if there is no valid borrower session — the layout's
// .catch() already falls back to 0, so this just makes the no-session case
// explicit rather than throwing.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getSession();

  if (!user || user.role !== "borrower") {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const stats = await getBorrowerHomeStats(user.userId);
  return NextResponse.json({ count: stats.borrowedItems.length });
}