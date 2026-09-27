"use server";

import { createSession } from "@/lib/session";
import { verifyCredentials } from "@/lib/repositories/users";
import { getDashboardPath } from "@/lib/roles";
import { getSignInThrottle, logActivity } from "@/lib/repositories/activity-logs";

// Shown for every failure so the form never reveals which accounts exist.
const GENERIC_ERROR = "Wrong username or Password!";

// Same cap sign-up enforces on ID numbers (public-sign-up-actions.ts). Without
// it, a single request could write an arbitrarily large string into
// activity_logs (description + attemptedIdNumber) on every failed attempt.
const ID_NUMBER_MAX = 50;

export interface SignInState {
  error: string | null;
  /** Echoed back so the ID field keeps its value after a failed attempt. */
  idNumber: string;
  /** Set on success; the client redirects here (see sign-in page.tsx). */
  redirectTo?: string;
}

export async function signInAction(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const rawIdNumber = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("pass") ?? "");

  // No real ID number is this long (sign-up rejects them), so it can never
  // match an account. Skip the bcrypt work and the DB lookup, keep the same
  // generic error, and log only a truncated copy so the log row stays bounded.
  if (rawIdNumber.length > ID_NUMBER_MAX) {
    const idNumber = rawIdNumber.slice(0, ID_NUMBER_MAX);
    await logActivity({
      userId: null,
      action: "sign_in_failed",
      entityType: "auth",
      description: `Failed sign-in attempt for ID ${idNumber}… (over ${ID_NUMBER_MAX} characters).`,
      attemptedIdNumber: idNumber,
    });
    return { error: GENERIC_ERROR, idNumber };
  }
  const idNumber = rawIdNumber;

  // BUG-03: sign-in throttle. Checked BEFORE verifyCredentials, so a locked ID
  // costs no bcrypt work (each attempt is real CPU, which is also what made an
  // unthrottled endpoint a cheap denial-of-service vector).
  //
  // Fails closed: if the failure count can't be read, the attempt is refused
  // instead of letting a database error switch the throttle off.
  let throttle;
  try {
    throttle = await getSignInThrottle(idNumber);
  } catch (error) {
    console.error("signInAction: could not check the sign-in throttle:", error);
    return {
      error: "Sign-in is temporarily unavailable. Please try again shortly.",
      idNumber,
    };
  }

  if (throttle.blocked) {
    // Logged with attemptedIdNumber = null on purpose (per login_throttle.php:
    // a blocked attempt must NOT extend the window). The throttle counts rows
    // by attempted_id_number, so this row is invisible to it. The ID is still
    // in the description for the audit trail. userId is null like any failed
    // sign-in. Reuses `sign_in_failed`: activity_logs.action has a CHECK
    // constraint, so a new action value would need a migration.
    await logActivity({
      userId: null,
      action: "sign_in_failed",
      entityType: "auth",
      description: `Blocked sign-in attempt for ID ${idNumber}: too many failed attempts, locked for about ${throttle.retryAfterMinutes} more minute(s).`,
      attemptedIdNumber: null,
    });
    return {
      error: `Too many failed sign-in attempts for this ID number. Please wait ${throttle.retryAfterMinutes} ${
        throttle.retryAfterMinutes === 1 ? "minute" : "minutes"
      } and try again.`,
      idNumber,
    };
  }

  const user = await verifyCredentials(idNumber, password);

  if (!user) {
    await logActivity({
      userId: null,
      action: "sign_in_failed",
      entityType: "auth",
      description: `Failed sign-in attempt for ID ${idNumber}.`,
      attemptedIdNumber: idNumber,
    });
    return { error: GENERIC_ERROR, idNumber };
  }

  // Write the JWT session cookie.
  await createSession(user);

  await logActivity({
    userId: user.userId,
    action: "sign_in_success",
    entityType: "auth",
    description: `User ${idNumber} signed in.`,
    office: user.office ?? null,
  });

  return {
    error: null,
    idNumber,
    redirectTo: getDashboardPath({ role: user.role, office: user.office ?? null }),
  };
}