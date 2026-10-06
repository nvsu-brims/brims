"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { setSignUpStatus } from "@/lib/repositories/users";
import { logActivity } from "@/lib/repositories/activity-logs";
import {
  notifySignUpApproved,
  notifySignUpRejected,
} from "@/lib/email/notify";

async function requireSuperAdmin(): Promise<
  | { ok: true; caller: { id: number } }
  | { ok: false; error: string }
> {
  const user = await getSession();
  if (!user || user.role !== "admin" || !isSuperAdmin(user.office ?? null)) {
    return { ok: false, error: "You are not allowed to review sign-up requests." };
  }
  return { ok: true, caller: { id: user.userId } };
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

function revalidateSignUpPaths() {
  revalidatePath("/admin/sign-up-requests");
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function approveSignUpAction(id: number): Promise<ReviewResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await setSignUpStatus(id, "approved");
  if (!result.ok) {
    return { ok: false, error: "That sign-up is no longer pending." };
  }

  await logActivity({
    userId: caller.id,
    action: "account_approved",
    entityType: "user",
    entityId: id,
    description: `Approved sign-up for account, ${result.firstName} ${result.lastName} (${result.idNumber}).`,
  });

  // E1: tell the applicant they can sign in. Runs after the response is sent,
  // never throws, and a failed send never affects the approval.
  after(() => notifySignUpApproved(id, caller.id));

  revalidateSignUpPaths();
  return { ok: true };
}

export async function rejectSignUpAction(id: number): Promise<ReviewResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await setSignUpStatus(id, "rejected");
  if (!result.ok) {
    return { ok: false, error: "That sign-up is no longer pending." };
  }

  await logActivity({
    userId: caller.id,
    action: "account_rejected",
    entityType: "user",
    entityId: id,
    description: `Rejected sign-up for account, ${result.firstName} ${result.lastName} (${result.idNumber}).`,
  });

  // E2: tell the applicant the request was not approved (no reason is given).
  after(() => notifySignUpRejected(id, caller.id));

  revalidateSignUpPaths();
  return { ok: true };
}