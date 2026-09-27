"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { isValidIsoDate, todayIso } from "@/lib/dates";
import { createBorrowRequest } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";

// Submit Request in the Borrow Request Form dialog. Port of
// borrower_dashboard_borrow_requests.php's handleSubmitBorrowRequest().
//
// A borrower only. proxy.ts already keeps other roles out of /borrower/*, but
// a Server Action is a public POST endpoint, so the role is checked again
// here on every call (same pattern as the admin actions). The user id comes
// from the session, never from the request.
//
// `borrow_requested` activity logging is wired below.

export type SubmitBorrowRequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function submitBorrowRequestAction(
  input: {
    itemId: number;
    /** "YYYY-MM-DD" from the DatePicker. */
    expectedReturnDate: string;
  }
): Promise<SubmitBorrowRequestResult> {
  const user = await getSession();
  if (!user || user.role !== "borrower") {
    return { ok: false, error: "You are not allowed to submit a borrow request." };
  }

  if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
    return { ok: false, error: "Invalid item." };
  }

  if (
    !isValidIsoDate(input.expectedReturnDate) ||
    input.expectedReturnDate <= todayIso()
  ) {
    return { ok: false, error: "Return date must be a real date after today." };
  }

  const result = await createBorrowRequest({
    userId: user.userId,
    itemId: input.itemId,
    expectedReturnDate: input.expectedReturnDate,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  void logActivity({
    userId: user.userId,
    action: "borrow_requested",
    entityType: "borrow_record",
    entityId: result.id,
    description: `Requested to borrow "${result.itemName}".`,
    office: result.itemOffice,
  });

  revalidatePath("/borrower/catalog");
  revalidatePath("/borrower/requests");
  revalidatePath("/borrower");

  return { ok: true, message: "Request submitted." };
}