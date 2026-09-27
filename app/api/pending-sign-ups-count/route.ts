import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { getPendingSignUps } from "@/lib/repositories/users";

// ---------------------------------------------------------------------------
// GET /api/pending-sign-ups-count
//
// Returns { count } — the number of pending sign-up requests. Super-admin
// only (Sign-Up Requests is a super-admin-only page; SDO/UCAO admins never
// see this nav item at all, so admin-layout.tsx only calls this route when
// isSuperAdmin(sessionUser?.office) is true). Backs the "Sign-Up Requests"
// sidebar badge.
//
// 401 with { count: 0 } for no session or a non-super-admin — the layout's
// .catch() already falls back to 0.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getSession();

  if (!user || user.role !== "admin" || !isSuperAdmin(user.office)) {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const pending = await getPendingSignUps();
  return NextResponse.json({ count: pending.length });
}