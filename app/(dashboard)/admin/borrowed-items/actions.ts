"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdminAction } from "@/lib/require-admin";
import { markBorrowReturned, markBorrowPickedUp } from "@/lib/repositories/borrowings";
import { logActivity } from "@/lib/repositories/activity-logs";
import { notifyItemReturned } from "@/lib/email/notify";

function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

export type BorrowedItemActionResult = { ok: true } | { ok: false; error: string };

export type UnitCondition = "good" | "damaged" | "lost";
const UNIT_CONDITIONS: UnitCondition[] = ["good", "damaged", "lost"];

export async function markReturnedAction(
  requestId: number,
  conditions: UnitCondition[]
): Promise<BorrowedItemActionResult> {
  if (!isValidId(requestId)) {
    return { ok: false, error: "Invalid request." };
  }
  if (
    !Array.isArray(conditions) ||
    conditions.length < 1 ||
    !conditions.every((c) => UNIT_CONDITIONS.includes(c))
  ) {
    return { ok: false, error: "Choose a condition for every unit." };
  }

  const gate = await requireAdminAction("You are not allowed to manage borrowed items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await markBorrowReturned(requestId, caller.office, caller.id, conditions);
  if (!result.ok) {
    // Same audit trail approve/reject already write: an admin from one office
    // trying to act on the other office's item is recorded, not just refused.
    if (result.crossOfficeBlock) {
      await logActivity({
        userId: caller.id,
        action: "cross_office_action_blocked",
        entityType: "borrow_record",
        entityId: requestId,
        description: `Blocked mark-as-returned attempt on "${result.crossOfficeBlock.itemName}" — different office.`,
        office: caller.office,
      });
    }
    return { ok: false, error: result.error };
  }

  await logActivity({
    userId: caller.id,
    action: "borrow_returned",
    entityType: "borrow_record",
    entityId: requestId,
    description: `Marked "${result.itemName}" as returned by ${result.borrowerName}.`,
    // The item's office, so the owning office's admins see the row even when
    // the super admin marked it returned.
    office: result.itemOffice,
  });

  // E7: send the borrower a returned-item receipt. Runs after the response is
  // sent, never throws, and a failed send never affects the return.
  after(() => notifyItemReturned(requestId, caller.id));

  revalidatePath("/admin/borrowed-items");
  revalidatePath("/admin/history");
  revalidatePath("/admin");

  return { ok: true };
}

export async function markPickedUpAction(requestId: number): Promise<BorrowedItemActionResult> {
  if (!isValidId(requestId)) {
    return { ok: false, error: "Invalid request." };
  }
  const gate = await requireAdminAction("You are not allowed to update borrowed items.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await markBorrowPickedUp(requestId, caller.office);
  if (!result.ok) return result;

  await logActivity({
    userId: caller.id,
    action: "borrow_picked_up",
    entityType: "borrow_record",
    entityId: requestId,
    description: `Marked "${result.itemName}" picked up by ${result.borrowerName}.`,
    office: result.itemOffice,
  });
  revalidatePath("/admin/borrowed-items");
  return { ok: true };
}