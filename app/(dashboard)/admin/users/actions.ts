"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
// Aliased: editUserAction below has a local variable named `after`.
import { after as afterResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isSuperAdmin, type Office, type Role } from "@/lib/roles";
import { isValidCollegeOrganization } from "@/data/colleges";
import { ID_NUMBER_ERROR, isValidIdNumber } from "@/lib/id-number";
import {
  CONTACT_NUMBER_ERROR,
  isValidContactNumber,
  normalizeContactNumber,
} from "@/lib/contact-number";
import {
  createUser,
  updateUser,
  setUserDeactivated,
  getUserManagementList,
} from "@/lib/repositories/users";
import {
  logActivity,
  getLastPasswordChangeAt,
} from "@/lib/repositories/activity-logs";
import {
  notifyAccountCreated,
  notifyPasswordReset,
} from "@/lib/email/notify";

const SALT_ROUNDS = 10;

async function requireSuperAdmin(): Promise<
  | { ok: true; caller: { id: number } }
  | { ok: false; error: string }
> {
  const user = await getSession();
  if (!user || user.role !== "admin" || !isSuperAdmin(user.office ?? null)) {
    return { ok: false, error: "You are not allowed to manage users." };
  }
  return { ok: true, caller: { id: user.userId } };
}

export type UserActionResult = { ok: true } | { ok: false; error: string };

export interface AddUserInput {
  idNumber: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  office: Office | "";
  college: string;
  organizationName: string;
  password: string;
}

export interface EditUserInput {
  id: number;
  idNumber: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  office: Office | "";
  college: string;
  organizationName: string;
  /** Empty string = unchanged, matching the form's "leave blank" helper text. */
  newPassword: string;
}

/**
 * Shared validation for Add/Edit: role/office/college pairing.
 * An admin must have an office (or none, for super admin) and no
 * college/organization; a borrower must have a college+organization pairing
 * (validated against data/colleges.ts) and no office.
 */
function validateCommon(input: {
  role: Role;
  office: Office | "";
  college: string;
  organizationName: string;
}): string | null {
  if (input.role === "admin") {
    if (input.college || input.organizationName) {
      return "An admin account cannot have a college or organization.";
    }
    return null;
  }

  // Borrower
  if (input.office) {
    return "A borrower account cannot have an office.";
  }
  if (!input.college || !input.organizationName) {
    return "College and organization are required for a borrower.";
  }
  if (!isValidCollegeOrganization(input.college, input.organizationName)) {
    return "That organization does not belong to the selected college.";
  }
  return null;
}

/**
 * Names the account fields an edit changed, old to new, the way item edits are
 * logged ("Changed "X" status from A to B"). Returns [] when nothing changed.
 * The password is never included, only whether it was reset (logged
 * separately as password_reset_by_admin).
 */
function describeFieldChanges(
  before: {
    idNumber: string;
    firstName: string;
    lastName: string;
    role: Role;
    office: Office | null;
    college: string | null;
    organization: string | null;
    email: string | null;
    contactNumber: string | null;
  },
  after: {
    idNumber: string;
    firstName: string;
    lastName: string;
    role: Role;
    office: Office | null;
    college: string | null;
    organization: string | null;
    email: string | null;
    contactNumber: string | null;
  }
): string[] {
  const show = (v: string | null) => (v === null || v === "" ? "none" : v);
  const fields: Array<[string, string | null, string | null]> = [
    ["ID number", before.idNumber, after.idNumber],
    ["first name", before.firstName, after.firstName],
    ["last name", before.lastName, after.lastName],
    ["role", before.role, after.role],
    ["office", before.office, after.office],
    ["college", before.college, after.college],
    ["organization", before.organization, after.organization],
    ["email", before.email, after.email],
    ["contact number", before.contactNumber, after.contactNumber],
  ];
  return fields
    .filter(([, from, to]) => (from ?? "") !== (to ?? ""))
    .map(([label, from, to]) => `${label} from ${show(from)} to ${show(to)}`);
}

function revalidateUserPaths() {
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function addUserAction(input: AddUserInput): Promise<UserActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  const idNumber = input.idNumber.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const contactNumber = input.contactNumber.trim();

  if (!idNumber || !firstName || !lastName || !email || !contactNumber) {
    return { ok: false, error: "All fields are required." };
  }
  if (!isValidIdNumber(idNumber)) {
    return { ok: false, error: ID_NUMBER_ERROR };
  }
  // "09" + 9 digits; the spaces are for readability only (lib/contact-number.ts).
  if (!isValidContactNumber(contactNumber)) {
    return { ok: false, error: CONTACT_NUMBER_ERROR };
  }
  if (!input.password) {
    return { ok: false, error: "A password is required." };
  }

  const validationError = validateCommon(input);
  if (validationError) return { ok: false, error: validationError };

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const result = await createUser({
    idNumber,
    firstName,
    lastName,
    role: input.role,
    office: input.role === "admin" ? input.office || null : null,
    college: input.role === "borrower" ? input.college : null,
    organization: input.role === "borrower" ? input.organizationName : null,
    email: email || null,
    contactNumber: normalizeContactNumber(contactNumber),
    passwordHash,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await logActivity({
    userId: caller.id,
    action: "account_created",
    entityType: "user",
    entityId: result.id,
    description: `Added account, ${firstName} ${lastName} (${idNumber}).`,
  });

  // E11: welcome email to the address entered for the new account. It never
  // contains the password. Runs after the response is sent, never throws, and
  // a failed send never affects the account creation.
  afterResponse(() => notifyAccountCreated(result.id, caller.id));

  revalidateUserPaths();
  return { ok: true };
}

export async function editUserAction(input: EditUserInput): Promise<UserActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  const idNumber = input.idNumber.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const contactNumber = input.contactNumber.trim();

  if (!idNumber || !firstName || !lastName || !email || !contactNumber) {
    return { ok: false, error: "All fields are required." };
  }

  // Snapshot the account before it changes so the log can say what changed.
  // Best-effort: if the lookup fails or the user is gone, updateUser below
  // still decides the outcome and this only affects the log wording.
  const before = (await getUserManagementList()).find((u) => u.id === input.id);

  // The ID must be 000-0000. An account whose stored ID predates the rule is
  // still saveable as long as its ID is left as it is; only a NEW or CHANGED
  // ID has to match the format.
  if (!isValidIdNumber(idNumber) && idNumber !== before?.idNumber) {
    return { ok: false, error: ID_NUMBER_ERROR };
  }

  // Same rule for the contact number: a NEW or CHANGED number must be
  // "09" + 9 digits. A stored number that predates the rule (the seed admins
  // hold placeholders like 9000000001) still saves while it is left as is.
  const contactUnchanged =
    normalizeContactNumber(contactNumber) === (before?.contactNumber ?? null);
  if (!isValidContactNumber(contactNumber) && !contactUnchanged) {
    return { ok: false, error: CONTACT_NUMBER_ERROR };
  }
  // What gets stored (and logged): digits only, so "0917 384 6215" and
  // "09173846215" are the same number and never show up as a change.
  const storedContactNumber = normalizeContactNumber(contactNumber);

  const validationError = validateCommon(input);
  if (validationError) return { ok: false, error: validationError };

  const passwordHash = input.newPassword
    ? await bcrypt.hash(input.newPassword, SALT_ROUNDS)
    : undefined;

  const result = await updateUser(input.id, {
    idNumber,
    firstName,
    lastName,
    role: input.role,
    office: input.role === "admin" ? input.office || null : null,
    college: input.role === "borrower" ? input.college : null,
    organization: input.role === "borrower" ? input.organizationName : null,
    email: email || null,
    contactNumber: storedContactNumber || null,
    passwordHash,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // What the saved account looks like now (mirrors what updateUser wrote).
  const after = {
    idNumber,
    firstName,
    lastName,
    role: input.role,
    office: input.role === "admin" ? ((input.office || null) as Office | null) : null,
    college: input.role === "borrower" ? input.college : null,
    organization: input.role === "borrower" ? input.organizationName : null,
    email: email || null,
    contactNumber: storedContactNumber || null,
  };
  const changes = before ? describeFieldChanges(before, after) : [];
  const passwordReset = Boolean(input.newPassword);

  // Field edits and a password reset are logged as separate rows so neither
  // hides the other. A save with no changes at all still writes one
  // account_updated row, as before, so the action is never silently unlogged.
  //
  // Keep password_reset_by_admin's action name and entityId (the edited
  // user's id) as they are: getLastPasswordChangeAt reads those rows.
  if (changes.length > 0 || !passwordReset) {
    await logActivity({
      userId: caller.id,
      action: "account_updated",
      entityType: "user",
      entityId: input.id,
      description:
        changes.length > 0
          ? `Updated account, ${firstName} ${lastName} (${idNumber}): changed ${changes.join("; ")}.`
          : `Saved account, ${firstName} ${lastName} (${idNumber}), with no changes.`,
    });
  }
  if (passwordReset) {
    await logActivity({
      userId: caller.id,
      action: "password_reset_by_admin",
      entityType: "user",
      entityId: input.id,
      description: `Reset the password for ${firstName} ${lastName} (${idNumber}).`,
    });

    // E10: tell the user their password was reset. It never contains the
    // password; the admin gives that to the user separately. Runs after the
    // response is sent, never throws, and a failed send never affects the
    // reset.
    afterResponse(() => notifyPasswordReset(input.id, caller.id));
  }

  revalidateUserPaths();
  return { ok: true };
}

export async function deactivateUserAction(id: number): Promise<UserActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  // The Deactivate button is disabled client-side for the caller's own
  // row, but that's UI-only — re-check here so a direct action call (or
  // a future UI regression) can't lock a super admin out of their own
  // account.
  if (id === caller.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const result = await setUserDeactivated(id, true);
  if (!result.ok) return { ok: false, error: "This user no longer exists." };

  await logActivity({
    userId: caller.id,
    action: "account_deactivated",
    entityType: "user",
    entityId: id,
    description: `Deactivated account, ${result.firstName} ${result.lastName}.`,
  });

  revalidateUserPaths();
  return { ok: true };
}

export async function reactivateUserAction(id: number): Promise<UserActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const { caller } = gate;

  const result = await setUserDeactivated(id, false);
  if (!result.ok) return { ok: false, error: "This user no longer exists." };

  await logActivity({
    userId: caller.id,
    action: "account_reactivated",
    entityType: "user",
    entityId: id,
    description: `Reactivated account, ${result.firstName} ${result.lastName}.`,
  });

  revalidateUserPaths();
  return { ok: true };
}

export type LastPasswordChangeResult =
  | { ok: true; lastPasswordChangeAt: string | null }
  | { ok: false; error: string };

/**
 * For the read-only View User dialog's "Last Password Update" field.
 * getLastPasswordChangeAt() itself is already user-agnostic (it just reads
 * password_changed_by_self / password_reset_by_admin rows for whatever
 * userId it's given — see lib/repositories/activity-logs.ts); /api/me only
 * ever calls it with the *session's own* id. This is the admin-gated caller
 * that allows querying it for an arbitrary user, same super-admin-only gate
 * as the rest of this file, since it can reveal another user's account
 * activity.
 */
export async function getLastPasswordChangeAtAction(
  userId: number
): Promise<LastPasswordChangeResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;

  const lastPasswordChangeAt = await getLastPasswordChangeAt(userId);
  return { ok: true, lastPasswordChangeAt };
}