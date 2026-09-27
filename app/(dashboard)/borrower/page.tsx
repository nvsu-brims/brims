import Link from "next/link";
import { BookCheck, CalendarClock, Hourglass, TriangleAlert } from "lucide-react";

import { redirect } from "next/navigation";
import { formatDate } from "@/lib/dates";
import { getSession } from "@/lib/session";
import { getBorrowerHomeStats } from "@/lib/repositories/borrowings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Port of borrower_dashboard.php's homeSection, backed by
// getBorrowerHomeStats($conn, $currentUserId) (lib/repositories/borrowings.ts):
// borrowedCount, overdueCount, totalBorrowedCount, upcomingDue (the 6
// soonest-due borrowed items) and pendingApprovals (this borrower's own 6
// longest-waiting pending requests). A Server Component that reads the
// database on every request, so the numbers are never frozen at build time.
//
// Layout ports the PHP 1:1: 3 stat cards (Borrowed / Overdue / Total
// Borrowed) in one row, then a 2-column row of "Upcoming Due Dates" and
// "Pending Approval" list cards below. Each list card's "View All" is a real
// link to the matching dashboard route (the PHP's dashboardNav.showSection()).
// "View All" links to the matching dashboard route use Button's `asChild`
// (Radix composition — this project is on Radix UI per Step 2, not Base UI)
// wrapping a <Link>, same pattern used in admin Home.
//
// The Welcome greeting reads the session's name (first + last, like the PHP's
// $currentUserName).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function BorrowerHomePage() {
  const user = await getSession();
  // BUG-02: a null session may be a REVOKED cookie that proxy.ts still sees
  // as valid. Go through /api/session-expired, which clears it, so the
  // proxy does not bounce the visitor straight back here. A wrong-role
  // session is still valid, so it must not be cleared: plain /sign-in.
  if (!user) redirect("/api/session-expired");
  if (user.role !== "borrower") redirect("/sign-in");

  const stats = await getBorrowerHomeStats(user.userId);

  const borrowerName = `${user.firstName} ${user.lastName}`.trim() || "Borrower";
  const upcomingDue = stats.upcomingDue;
  const pendingApprovals = stats.pendingApprovals;
  const HOME_STATS = {
    borrowedCount: stats.borrowedCount,
    overdueCount: stats.overdueCount,
    totalBorrowedCount: stats.totalBorrowedCount,
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          Welcome, {borrowerName}
        </h3>
        <p className="mb-0 text-muted-foreground">
          This is your borrower dashboard. Track your borrowed items and
          browse what&apos;s available.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Borrowed
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <BookCheck className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {HOME_STATS.borrowedCount}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Items currently in your possession.
            </p>
          </CardFooter>
        </Card>

        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Overdue
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
              <TriangleAlert className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {HOME_STATS.overdueCount}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Past their due date — return as soon as possible.
            </p>
          </CardFooter>
        </Card>

        <Card className="rounded-2xl border-0! shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="mb-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total Borrowed
            </p>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-800">
              <Hourglass className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="mb-0 text-3xl font-bold">
              {HOME_STATS.totalBorrowedCount}
            </h3>
          </CardContent>
          <CardFooter className="border-t-0 bg-white">
            <p className="mb-0 text-sm text-muted-foreground">
              Total items borrowed, including past returns.
            </p>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-0! shadow-sm">
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-orange-800" />
                <h3 className="mb-0 font-semibold">Upcoming Due Dates</h3>
              </div>
              <Button
                asChild
                size="sm"
                className="rounded-md! bg-green-600 px-3 font-semibold hover:bg-green-700"
              >
                <Link href="/borrower/borrowed-items">View All</Link>
              </Button>
            </div>
            {upcomingDue.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {upcomingDue.map((item, i) => (
                  <li
                    key={item.id}
                    className={
                      "flex items-center justify-between py-2 text-sm" +
                      (i > 0 ? " border-t border-slate-100" : "")
                    }
                  >
                    <span className="font-semibold">{item.itemName}</span>
                    <span className="text-muted-foreground">
                      {formatDate(item.dueAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 text-sm text-muted-foreground">
                No upcoming due dates.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0! shadow-sm">
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hourglass className="size-4 text-amber-800" />
                <h3 className="mb-0 font-semibold">Pending Borrow Requests</h3>
              </div>
              <Button
                asChild
                size="sm"
                className="rounded-md! bg-green-600 px-3 font-semibold hover:bg-green-700"
              >
                <Link href="/borrower/requests">View All</Link>
              </Button>
            </div>
            {pendingApprovals.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {pendingApprovals.map((item, i) => (
                  <li
                    key={item.id}
                    className={
                      "flex items-center justify-between py-2 text-sm" +
                      (i > 0 ? " border-t border-slate-100" : "")
                    }
                  >
                    <span className="font-semibold">{item.itemName}</span>
                    <span className="text-muted-foreground">
                      {formatDate(item.requestedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 text-sm text-muted-foreground">
                No requests waiting for approval.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}