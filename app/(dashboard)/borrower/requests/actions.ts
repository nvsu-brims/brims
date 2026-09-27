"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { cancelBorrowRequest } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";

// Cancel on the borrower's Borrow Requests table. Port of
// borrower_dashboard_borrow_requests.php's handleCancelBorrowRequest().
//
// A borrower only, checked again here (a Server Action is a public POST
// endpoint). The user id comes from the session and the repository scopes the
// request to it, so a borrower can never cancel someone else's request.
//
// `borrow_cancelled` activity logging is wired below.

export type CancelBorrowRequestActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function cancelBorrowRequestAction(
  requestId: number
): Promise<CancelBorrowRequestActionResult> {
  const user = await getSession();
  if (!user || user.role !== "borrower") {
    return { ok: false, error: "You are not allowed to cancel this request." };
  }

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await cancelBorrowRequest(user.userId, requestId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  void logActivity({
    userId: user.userId,
    action: "borrow_cancelled",
    entityType: "borrow_record",
    entityId: requestId,
    description: `Cancelled a borrow request for "${result.itemName}".`,
    office: result.itemOffice,
  });

  revalidatePath("/borrower/requests");
  revalidatePath("/borrower");

  return { ok: true, message: "Request cancelled." };
}