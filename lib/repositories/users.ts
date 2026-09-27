import bcrypt from "bcryptjs";

import { db } from "@/prisma/db";
import type { Office, Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";

// User repository — backed by Prisma (Supabase Postgres). Pages, Server
// Actions and NextAuth call these functions, never the database directly.
// SessionUser is defined in lib/session.ts; this repository just returns it.

// Compared against when the ID doesn't exist (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** Wrong password, unknown ID, deactivated, or not approved all return null. */
export async function verifyCredentials(
  idNumber: string,
  password: string
): Promise<SessionUser | null> {
  const user = await db.user.findFirst({ where: { idNumber } });

  // Always run one bcrypt comparison, found or not (timing-safe).
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !passwordMatches) return null;
  if (user.deletedAt) return null; // deactivated account
  if (user.signUpStatus !== "approved") return null; // pending or rejected

  return {
    userId: user.id,
    idNumber: user.idNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    contactNumber: user.contactNumber,
    college: user.college,
    organization: user.organization,
    role: user.role as Role,
    office: user.office as Office | null,
    createdAt: new Date(user.createdAt).toISOString(),
    sessionVersion: user.sessionVersion,
  };
}

// Sign-up and approval

/** Postgres SQL state for a unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { sqlState?: string } | null)?.sqlState === "23505";
}

export interface NewSignUp {
  idNumber: string;
  firstName: string;
  lastName: string;
  /** Already trimmed and lower-cased; null when the borrower left it blank. */
  email: string | null;
  /** Digits only; null when left blank. */
  contactNumber: string | null;
  /** College / organization CODES, already checked against data/colleges.ts. */
  college: string;
  organization: string;
  /** bcrypt hash — the plain password never reaches this layer. */
  passwordHash: string;
}

export type SignUpResult =
  | { ok: true; id: number; resubmitted: boolean }
  | { ok: false; error: string };

/** Self-registration. A REJECTED sign-up may resubmit and flips back to "pending". */
export async function createPendingSignUp(
  input: NewSignUp
): Promise<SignUpResult> {
  const existing = await db.user.findFirst({
    where: { idNumber: input.idNumber },
  });

  if (existing) {
    const canResubmit =
      existing.signUpStatus === "rejected" && !existing.deletedAt;
    if (!canResubmit) {
      return {
        ok: false,
        error:
          existing.signUpStatus === "pending" && !existing.deletedAt
            ? "A sign-up for this ID number is already waiting for approval."
            : "This ID number is already registered.",
      };
    }
  }

  // email/contactNumber are unique too; resubmission may keep its own values.
  if (input.email) {
    const taken = await db.user.findFirst({ where: { email: input.email } });
    if (taken && taken.id !== existing?.id) {
      return { ok: false, error: "This email address is already registered." };
    }
  }
  if (input.contactNumber) {
    const taken = await db.user.findFirst({
      where: { contactNumber: input.contactNumber },
    });
    if (taken && taken.id !== existing?.id) {
      return { ok: false, error: "This contact number is already registered." };
    }
  }

  let id: number;
  try {
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          college: input.college,
          organization: input.organization,
          email: input.email,
          contactNumber: input.contactNumber,
          passwordHash: input.passwordHash,
          signUpStatus: "pending",
        },
      });
      id = existing.id;
    } else {
      const row = await db.user.create({
        data: {
          idNumber: input.idNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          role: "borrower",
          office: null,
          college: input.college,
          organization: input.organization,
          email: input.email,
          contactNumber: input.contactNumber,
          signUpStatus: "pending",
          passwordHash: input.passwordHash,
          deletedAt: null,
        },
      });
      id = row.id;
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "An account with these details is already registered.",
      };
    }
    throw error;
  }

  return { ok: true, id, resubmitted: existing !== null && existing !== undefined };
}

/** One row of the admin Sign-Up Requests table. */
export interface SignUpRequest {
  id: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string | null;
  /** College / organization CODES (data/colleges.ts). */
  college: string | null;
  organization: string | null;
}

/** Pending borrowers only, oldest first. */
export async function getPendingSignUps(): Promise<SignUpRequest[]> {
  const rows = await db.user.findMany({
    where: { signUpStatus: "pending" },
    orderBy: { createdAt: "asc" },
  });

  return rows
    .filter((user) => !user.deletedAt)
    .map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      idNumber: user.idNumber,
      email: user.email,
      college: user.college,
      organization: user.organization,
    }));
}

/**
 * Approve or reject a PENDING sign-up. `{ ok: false }` if already reviewed.
 * Returns the target's name/idNumber on success, for the activity-log description.
 */
export async function setSignUpStatus(
  id: number,
  status: "approved" | "rejected"
): Promise<
  | { ok: true; firstName: string; lastName: string; idNumber: string }
  | { ok: false }
> {
  const user = await db.user.findFirst({ where: { id } });
  if (!user || user.deletedAt || user.signUpStatus !== "pending") {
    return { ok: false };
  }

  const updated = await db.user.update({
    where: { id },
    data: { signUpStatus: status },
  }).catch(() => null);
  if (updated === null) return { ok: false };

  return {
    ok: true,
    firstName: user.firstName,
    lastName: user.lastName,
    idNumber: user.idNumber,
  };
}

// User Management (admin/users) — super-admin only. Only APPROVED accounts;
// pending sign-ups live in Sign-Up Requests, rejected accounts aren't manageable.

/** One row of the admin User Management table. */
export interface UserManagementRow {
  id: number;
  idNumber: string;
  firstName: string;
  lastName: string;
  role: Role;
  office: Office | null;
  college: string | null;
  organization: string | null;
  email: string | null;
  contactNumber: string | null;
  isDeactivated: boolean;
  /** ISO string. Shown in the read-only View User dialog as "Account Created". */
  createdAt: string;
}

function toManagementRow(user: {
  id: number;
  idNumber: string;
  firstName: string;
  lastName: string;
  role: string;
  office: string | null;
  college: string | null;
  organization: string | null;
  email: string | null;
  contactNumber: string | null;
  deletedAt: unknown;
  createdAt: unknown;
}): UserManagementRow {
  return {
    id: user.id,
    idNumber: user.idNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as Role,
    office: user.office as Office | null,
    college: user.college,
    organization: user.organization,
    email: user.email,
    contactNumber: user.contactNumber,
    isDeactivated: user.deletedAt != null,
    createdAt: new Date(user.createdAt as string).toISOString(),
  };
}

/** Every APPROVED account, active or deactivated, oldest account first. */
export async function getUserManagementList(): Promise<UserManagementRow[]> {
  const rows = await db.user.findMany({
    where: { signUpStatus: "approved" },
    orderBy: { id: "asc" },
  });
  return rows.map(toManagementRow);
}

export type UserWriteResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export interface NewManagedUser {
  idNumber: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** Admins only: null = super admin. Must be null for a borrower. */
  office: Office | null;
  /** Borrowers only: college/organization CODES. Must be null for an admin. */
  college: string | null;
  organization: string | null;
  email: string | null;
  contactNumber: string | null;
  /** bcrypt hash — the plain password never reaches this layer. */
  passwordHash: string;
}

/**
 * Port of admin_dashboard.php's #addUserModal handler. Admin-created accounts
 * are approved immediately (no pending step, unlike self-registration).
 */
export async function createUser(
  input: NewManagedUser
): Promise<UserWriteResult> {
  const idTaken = await db.user.findFirst({
    where: { idNumber: input.idNumber },
  });
  if (idTaken) {
    return { ok: false, error: "An account with this ID number already exists." };
  }
  if (input.email) {
    const taken = await db.user.findFirst({ where: { email: input.email } });
    if (taken) return { ok: false, error: "This email address is already registered." };
  }
  if (input.contactNumber) {
    const taken = await db.user.findFirst({
      where: { contactNumber: input.contactNumber },
    });
    if (taken) return { ok: false, error: "This contact number is already registered." };
  }

  try {
    const row = await db.user.create({
      data: {
        idNumber: input.idNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        office: input.office,
        college: input.college,
        organization: input.organization,
        email: input.email,
        contactNumber: input.contactNumber,
        signUpStatus: "approved",
        passwordHash: input.passwordHash,
        deletedAt: null,
      },
    });
    return { ok: true, id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An account with these details already exists." };
    }
    throw error;
  }
}

export interface ManagedUserEdits {
  /** undefined = unchanged. */
  idNumber?: string;
  firstName: string;
  lastName: string;
  role: Role;
  office: Office | null;
  college: string | null;
  organization: string | null;
  email: string | null;
  contactNumber: string | null;
  /** undefined = unchanged; a bcrypt hash here sets a new password. */
  passwordHash?: string;
}

export async function updateUser(
  id: number,
  input: ManagedUserEdits
): Promise<UserWriteResult> {
  const existing = await db.user.findFirst({ where: { id } });
  if (!existing || existing.signUpStatus !== "approved") {
    return { ok: false, error: "This user no longer exists." };
  }

  if (input.idNumber && input.idNumber !== existing.idNumber) {
    const taken = await db.user.findFirst({
      where: { idNumber: input.idNumber },
    });
    if (taken && taken.id !== id) {
      return { ok: false, error: "This ID number is already registered." };
    }
  }
  if (input.email && input.email !== existing.email) {
    const taken = await db.user.findFirst({ where: { email: input.email } });
    if (taken && taken.id !== id) {
      return { ok: false, error: "This email address is already registered." };
    }
  }
  if (input.contactNumber && input.contactNumber !== existing.contactNumber) {
    const taken = await db.user.findFirst({
      where: { contactNumber: input.contactNumber },
    });
    if (taken && taken.id !== id) {
      return { ok: false, error: "This contact number is already registered." };
    }
  }

  const data: {
    idNumber?: string;
    firstName: string;
    lastName: string;
    role: Role;
    office: Office | null;
    college: string | null;
    organization: string | null;
    email: string | null;
    contactNumber: string | null;
    passwordHash?: string;
    sessionVersion?: { increment: number };
  } = {
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    office: input.office,
    college: input.college,
    organization: input.organization,
    email: input.email,
    contactNumber: input.contactNumber,
  };
  if (input.idNumber) data.idNumber = input.idNumber;
  if (input.passwordHash) {
    data.passwordHash = input.passwordHash;
    // BUG-02: an admin reset signs the account out everywhere, in the same
    // write as the new hash, so there is no moment where the password has
    // changed but the old sessions still work.
    data.sessionVersion = { increment: 1 };
  }

  try {
    const updated = await db.user
      .update({ where: { id }, data })
      .catch(() => null);
    if (!updated) return { ok: false, error: "This user no longer exists." };
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An account with these details already exists." };
    }
    throw error;
  }
}

/**
 * Deactivate (soft-delete) or reactivate an approved account via `deletedAt`.
 * `{ ok: false }` if unknown id or not approved. Returns the target's name on success.
 */
export async function setUserDeactivated(
  id: number,
  deactivated: boolean
): Promise<
  { ok: true; firstName: string; lastName: string } | { ok: false }
> {
  const existing = await db.user.findFirst({ where: { id } });
  if (!existing || existing.signUpStatus !== "approved") return { ok: false };

  const updated = await db.user
    .update({
      where: { id },
      // BUG-02: deactivating also revokes the account's sessions right away,
      // in the same write. getSession() already rejects a deactivated user,
      // but bumping means a later REactivation does not quietly revive a
      // token from before the deactivation.
      data: deactivated
        ? {
            deletedAt: new Date().toISOString(),
            sessionVersion: { increment: 1 },
          }
        : { deletedAt: null },
    })
    .catch(() => null);
  if (updated === null) return { ok: false };

  return { ok: true, firstName: existing.firstName, lastName: existing.lastName };
}

// Profile — change own password (shared by borrower/admin ProfileDialog)

export type ChangePasswordResult =
  | { ok: true; passwordChangedAt: string; sessionVersion: number }
  | { ok: false; error: string };

/**
 * Verifies the CURRENT password against its bcrypt hash, then stores the new
 * hash. Only a live, approved account can change its password.
 *
 * No dedicated "password changed at" column exists — `updatedAt` already
 * carries `@updatedAt` (bumped automatically by Prisma on this same write),
 * so it's reused here as the "Last password change" timestamp instead of
 * adding a new column.
 */
export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPasswordHash: string
): Promise<ChangePasswordResult> {
  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user || user.deletedAt || user.signUpStatus !== "approved") {
    return { ok: false, error: "Your account could not be found." };
  }

  const currentMatches = await bcrypt.compare(
    currentPassword,
    user.passwordHash
  );
  if (!currentMatches) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const updated = await db.user
    .update({
      where: { id: userId },
      // BUG-02: bump in the same write as the new hash, so every other
      // session for this account stops working the moment the password
      // changes. The caller re-issues THIS browser's cookie with the value
      // returned below.
      data: {
        passwordHash: newPasswordHash,
        sessionVersion: { increment: 1 },
      },
    })
    .catch((error) => {
      // Logged instead of swallowed: this is the only way the function can
      // answer "not found" AFTER the current password already checked out.
      console.error("changeOwnPassword: update failed:", error);
      return null;
    });
  if (updated === null) {
    return { ok: false, error: "Your account could not be found." };
  }

  // The new hash is saved by this point, so nothing below may throw: a throw
  // here would reach the caller as "Something went wrong" for a password that
  // DID change. Prisma returns updatedAt as a Date, but go through new Date()
  // (as verifyCredentials does for createdAt) so a string can't break it, and
  // fall back to now if the value is somehow unreadable.
  const changedAt = new Date(updated.updatedAt);
  return {
    ok: true,
    passwordChangedAt: (Number.isNaN(changedAt.getTime())
      ? new Date()
      : changedAt
    ).toISOString(),
    sessionVersion: updated.sessionVersion,
  };
}