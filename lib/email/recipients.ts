// Real path: lib/email/recipients.ts
//
// Works out WHO receives an email. Nothing here sends anything.
//
// Rules (EMAIL-NOTIFICATIONS-PLAN.md, section 5 "Recipients"):
//   - deactivated accounts (deletedAt set) are never emailed;
//   - accounts with no email address are skipped silently;
//   - every admin has their own account, so each admin is its own recipient
//     (no shared office mailbox).
//
// Same query style as lib/repositories/users.ts: plain findFirst / findMany,
// no relation includes.

import { db } from "@/prisma/db";
import type { Office } from "@/lib/roles";

export interface Recipient {
  id: number;
  firstName: string;
  lastName: string;
  /** Always a non-empty, trimmed address. */
  email: string;
}

interface UserRowLike {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
}

/** Row -> Recipient, or null when the account has no usable email address. */
function toRecipient(row: UserRowLike): Recipient | null {
  const email = row.email?.trim();
  if (!email) return null;
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email,
  };
}

function compact(list: Array<Recipient | null>): Recipient[] {
  return list.filter((r): r is Recipient => r !== null);
}

/** "First Last" for use inside an email. */
export function fullName(r: { firstName: string; lastName: string }): string {
  return `${r.firstName} ${r.lastName}`.trim();
}

/**
 * One user by id (a borrower, an applicant, a newly created account).
 * Null when the user does not exist, is deactivated, or has no email.
 */
export async function getUserRecipient(
  userId: number,
): Promise<Recipient | null> {
  const row = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  return row ? toRecipient(row) : null;
}

/**
 * Every active admin of one office (E8: a new borrow request for an item that
 * belongs to `office`). Super admins (office = null) are left out unless
 * `includeSuperAdmins` is true, because the plan sends E8 to the item's own
 * office admins only.
 */
export async function getOfficeAdminRecipients(
  office: Office,
  options: { includeSuperAdmins?: boolean } = {},
): Promise<Recipient[]> {
  const rows = await db.user.findMany({
    where: {
      role: "admin",
      deletedAt: null,
      signUpStatus: "approved",
      ...(options.includeSuperAdmins
        ? { OR: [{ office }, { office: null }] }
        : { office }),
    },
    orderBy: { id: "asc" },
  });
  return compact(rows.map(toRecipient));
}

/**
 * Every active super admin (office = null): E9, a new sign-up request.
 */
export async function getSuperAdminRecipients(): Promise<Recipient[]> {
  const rows = await db.user.findMany({
    where: {
      role: "admin",
      office: null,
      deletedAt: null,
      signUpStatus: "approved",
    },
    orderBy: { id: "asc" },
  });
  return compact(rows.map(toRecipient));
}