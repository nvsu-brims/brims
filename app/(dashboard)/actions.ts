"use server";

import bcrypt from "bcryptjs";

import { getSession, reissueSession } from "@/lib/session";
import { changeOwnPassword } from "@/lib/repositories/users";
import { logActivity } from "@/lib/repositories/activity-logs";

// Change Password in the shared ProfileDialog. Port of profile.php's
// handleUpdatePassword(). The dialog is shared by both dashboards, so this
// action serves any signed-in user (borrower or admin) and only ever changes
// THEIR OWN password: the user id comes from the session, never from the
// request. proxy.ts guards the pages, but a Server Action is a public POST
// endpoint, so the session is checked again here.
//
// Rules: the current password must match; the new password is 8 to 72 bytes
// (the same rule sign-up and admin Add/Edit User enforce; bcrypt only reads
// the first 72 bytes) and must match its confirmation.

export type ChangePasswordActionResult =
  | { ok: true; message: string; passwordChangedAt: string }
  | { ok: false; error: string };

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ChangePasswordActionResult> {
  const user = await getSession();
  if (!user) {
    return { ok: false, error: "Please sign in again to change your password." };
  }

  const currentPassword =
    typeof input?.currentPassword === "string" ? input.currentPassword : "";
  const newPassword =
    typeof input?.newPassword === "string" ? input.newPassword : "";
  const confirmPassword =
    typeof input?.confirmPassword === "string" ? input.confirmPassword : "";

  if (currentPassword === "") {
    return { ok: false, error: "Enter your current password." };
  }
  if (newPassword === "") {
    return { ok: false, error: "New password cannot be empty." };
  }
  if (newPassword !== confirmPassword) {
    return {
      ok: false,
      error: "New password and confirmation must match.",
    };
  }
  if (newPassword.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `Your new password must be at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (new TextEncoder().encode(newPassword).length > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      error: `Your new password must be ${PASSWORD_MAX_BYTES} bytes or fewer (accented letters and emoji count as more than one).`,
    };
  }
  // Checked before hashing so a "change" to the same password doesn't write a
  // new hash, log password_changed_by_self, or move the "Last password
  // change" footer when nothing actually changed.
  if (newPassword === currentPassword) {
    return {
      ok: false,
      error: "Your new password must be different from your current password.",
    };
  }

  let result;
  try {
    result = await changeOwnPassword(
      user.userId,
      currentPassword,
      await bcrypt.hash(newPassword, 10)
    );
  } catch (error) {
    console.error("changePasswordAction failed:", error);
    return {
      ok: false,
      error: "Something went wrong updating your password. Please try again.",
    };
  }
  if (!result.ok) return { ok: false, error: result.error };

  // BUG-02: changeOwnPassword bumped users.session_version, which signed this
  // account out everywhere, including this browser. Re-issue THIS browser's
  // cookie with the new version so the person who just changed their password
  // stays signed in here, while any other device (or a thief holding the old
  // password's session) is signed out.
  //
  // If re-issuing fails, the password HAS changed, so do not report an error
  // for it. The cookie is now stale, so the person's next request sends them
  // to /sign-in, which is safe and self-explanatory. Log it and carry on.
  try {
    await reissueSession(user, result.sessionVersion);
  } catch (error) {
    console.error("changePasswordAction: could not re-issue the session:", error);
  }

  await logActivity({
    userId: user.userId,
    action: "password_changed_by_self",
    entityType: "user",
    entityId: user.userId,
    description: "Changed their own password.",
  });

  return {
    ok: true,
    message: "Password updated successfully.",
    passwordChangedAt: result.passwordChangedAt,
  };
}