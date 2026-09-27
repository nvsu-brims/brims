import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getBorrowedItems } from "@/lib/repositories/borrowings";

// ---------------------------------------------------------------------------
// GET /api/borrowed-items-count
//
// Returns { count } — the number of currently borrowed items (status
// 'borrowed' or 'overdue') visible to the signed-in admin (office-scoped for
// SDO/UCAO admins, all offices for the super admin). Backs the "Borrowed
// Items" sidebar badge in admin-layout.tsx, mirroring the existing
// pending-requests-count route.
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

  const items = await getBorrowedItems(user.office);
  return NextResponse.json({ count: items.length });
}