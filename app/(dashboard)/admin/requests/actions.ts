"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdminAction } from "@/lib/require-admin";
import {
  approveBorrowRequest,
  rejectBorrowRequest,
} from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";
import { REJECT_REASONS } from "@/lib/reject-reasons";
import {
  notifyRequestApproved,
  notifyRequestRejected,
  notifyRequestsAutoRejected,
} from "@/lib/email/notify";

export type RequestActionResult = { ok: true } | { ok: false; error: string };

export interface RejectRequestInput {
  id: number;
  reason: string;
  /** Required only when reason === "Other". */
  note: string;
}

function revalidateRequestPaths() {
  revalidatePath("/admin/requests");
  revalidatePath("/admin/borrowed-items");
  revalidatePath("/admin");
}

export async function approveRequestAction(
  requestId: number
): Promise<RequestActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage borrow requests.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  // Captured BEFORE approving: the E5 emails find the requests that were
  // auto-rejected by this approval as those stamped at or after this moment.
  const approvalStartedAt = new Date();

  const result = await approveBorrowRequest(requestId, caller.id, caller.office);
  if (!result.ok) {
    if (result.crossOfficeBlock) {
      await logActivity({
        userId: caller.id,
        action: "cross_office_action_blocked",
        entityType: "borrow_record",
        entityId: requestId,
        description: `Blocked approve attempt on "${result.crossOfficeBlock.itemName}" — different office.`,
        office: caller.office,
      });
    }
    return { ok: false, error: result.error };
  }

  await logActivity({
    userId: caller.id,
    action: "borrow_approved",
    entityType: "borrow_record",
    entityId: requestId,
    description: `Approved ${result.borrowerName}'s request to borrow "${result.itemName}".`,
    // The item's office (not the caller's) so the owning office's admins see
    // it even when the super admin did the approving.
    office: result.itemOffice,
  });

  // BUG-12: approving this request also auto-rejected the item's other pending
  // requests (see approveBorrowRequest). Log it the same way the
  // item-marked-unavailable case is logged, and refresh the borrower-side
  // views so those borrowers no longer see a stale "Request Pending".
  if (result.autoRejectedCount && result.autoRejectedCount > 0) {
    await logActivity({
      userId: caller.id,
      action: "borrow_rejected",
      entityType: "item",
      entityId: result.itemId ?? null,
      description: `Auto-rejected ${result.autoRejectedCount} other pending request(s) on "${result.itemName}" — item borrowed by another request.`,
      office: result.itemOffice,
    });
    revalidatePath("/admin/history");
    revalidatePath("/borrower/requests");
    revalidatePath("/borrower/history");
    revalidatePath("/borrower/catalog");
    revalidatePath("/borrower");
  }

  // E3: tell the borrower their request was approved. E5: tell the borrowers
  // whose pending requests for the same item were auto-rejected. Both run
  // after the response is sent, never throw, and a failed send never affects
  // the approval.
  const autoRejectedItemId =
    typeof result.itemId === "number" ? result.itemId : null;
  const hadAutoRejections = (result.autoRejectedCount ?? 0) > 0;
  after(async () => {
    await notifyRequestApproved(requestId, caller.id);
    if (autoRejectedItemId !== null && hadAutoRejections) {
      await notifyRequestsAutoRejected(
        autoRejectedItemId,
        approvalStartedAt,
        caller.id
      );
    }
  });

  revalidateRequestPaths();
  return { ok: true };
}

export async function rejectRequestAction(
  input: RejectRequestInput
): Promise<RequestActionResult> {
  const gate = await requireAdminAction("You are not allowed to manage borrow requests.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const reason = input.reason.trim();
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: "Please select a valid reason." };
  }
  if (reason === "Other" && !input.note.trim()) {
    return { ok: false, error: "A note is required when selecting \"Other\"." };
  }

  // Combine reason + optional note into one string for storage.
  const combinedReason = input.note.trim()
    ? `${reason}\n${input.note.trim()}`
    : reason;

  const result = await rejectBorrowRequest(
    input.id,
    caller.id,
    combinedReason,
    caller.office
  );
  if (!result.ok) {
    if (result.crossOfficeBlock) {
      await logActivity({
        userId: caller.id,
        action: "cross_office_action_blocked",
        entityType: "borrow_record",
        entityId: input.id,
        description: `Blocked reject attempt on "${result.crossOfficeBlock.itemName}" — different office.`,
        office: caller.office,
      });
    }
    return { ok: false, error: result.error };
  }

  await logActivity({
    userId: caller.id,
    action: "borrow_rejected",
    entityType: "borrow_record",
    entityId: input.id,
    description: `Rejected ${result.borrowerName}'s request to borrow "${result.itemName}": ${reason}.`,
    office: result.itemOffice,
  });

  // E4: tell the borrower their request was not approved. The reason and note
  // are read from the request's `remarks` (stored as combinedReason above).
  after(() => notifyRequestRejected(input.id, caller.id));

  revalidateRequestPaths();
  return { ok: true };
}