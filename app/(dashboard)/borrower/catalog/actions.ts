"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import { isValidIsoDate, todayIso } from "@/lib/dates";
import { createBorrowRequest } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";
import { notifyNewRequestAlert } from "@/lib/email/notify";

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
    /** Must be true: the borrower ticked the Terms and Conditions box. Not stored. */
    acceptedTerms: boolean;
    /** Units to borrow (1 up to the available quantity). */
    quantity: number;
  }
): Promise<SubmitBorrowRequestResult> {
  const user = await getSession();
  if (!user || user.role !== "borrower") {
    return { ok: false, error: "You are not allowed to submit a borrow request." };
  }

  if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
    return { ok: false, error: "Invalid item." };
  }

  // Plan 2: the request is refused unless the Terms checkbox was ticked. The
  // acceptance itself is not stored; this only enforces the gate on the server.
  if (input.acceptedTerms !== true) {
    return {
      ok: false,
      error: "You must accept the Terms and Conditions to submit a request.",
    };
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, error: "Quantity must be a whole number of at least 1." };
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
    quantity: input.quantity,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await logActivity({
    userId: user.userId,
    action: "borrow_requested",
    entityType: "borrow_record",
    entityId: result.id,
    description: `Requested to borrow "${result.itemName}".`,
    office: result.itemOffice,
  });

  // E8: alert the admins of the item's office that a request is waiting. One
  // email per admin; runs after the response is sent, never throws, and a
  // failed send never affects the request.
  after(() => notifyNewRequestAlert(result.id));

  revalidatePath("/borrower/catalog");
  revalidatePath("/borrower/requests");
  revalidatePath("/borrower");

  return { ok: true, message: "Request submitted." };
}