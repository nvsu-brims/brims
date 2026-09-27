"use server";

import bcrypt from "bcryptjs";

import { isValidCollegeOrganization } from "@/data/colleges";
import { ID_NUMBER_ERROR, isValidIdNumber } from "@/lib/id-number";
import {
  CONTACT_NUMBER_ERROR,
  isValidContactNumber,
  normalizeContactNumber,
} from "@/lib/contact-number";
import { createPendingSignUp } from "@/lib/repositories/users";
import { logActivity } from "@/lib/repositories/activity-logs";

// Replaces sign_up.php's POST handler. Creates a borrower with signUpStatus
// "pending"; an admin approves or rejects it from /admin/sign-up-requests.
//
// Every rule is checked HERE, on the server: the form's `required` and the
// dropdowns only guide the browser, and anyone can post anything to a Server
// Action.

export interface SignUpState {
  status: "idle" | "success" | "error";
  message: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpAction(
  _previousState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const fail = (message: string): SignUpState => ({ status: "error", message });

  const firstName = text("firstName");
  const lastName = text("lastName");
  const idNumber = text("idNumber");
  const email = text("email").toLowerCase();
  // Validated as typed (so letters are rejected, not silently dropped), then
  // stored digits-only ("0917 384 6215" -> "09173846215"), like the seed data.
  const rawContactNumber = text("contactNumber");
  const contactNumber = normalizeContactNumber(rawContactNumber);
  const college = text("college");
  const organization = text("organization");
  // Passwords are never trimmed: spaces may be part of one.
  const password = String(formData.get("pass") ?? "");
  const confirmPass = String(formData.get("confirmPass") ?? "");

  if (!firstName || !lastName || !idNumber) {
    return fail("Please enter your first name, last name and ID number.");
  }
  if (firstName.length > 100 || lastName.length > 100) {
    return fail("First and last names must be 100 characters or fewer.");
  }
  // Strict 000-0000 (see lib/id-number.ts). This also caps the length, so the
  // old "too long" check is no longer needed.
  if (!isValidIdNumber(idNumber)) {
    return fail(ID_NUMBER_ERROR);
  }
  if (!isValidCollegeOrganization(college, organization)) {
    return fail("Please choose your college and organization.");
  }
  // Both required in the PHP (sign_up.php lines 106-111).
  if (!email) {
    return fail("Email is required.");
  }
  if (!EMAIL_PATTERN.test(email)) {
    return fail("Please enter a valid email address.");
  }
  if (!contactNumber) {
    return fail("Contact number is required.");
  }
  // Strict "09" + 9 digits (see lib/contact-number.ts); replaces the old
  // 10-13 digit rule, which accepted numbers that do not start with 09.
  if (!isValidContactNumber(rawContactNumber)) {
    return fail(CONTACT_NUMBER_ERROR);
  }
  if (password.length < 8) {
    return fail("Your password must be at least 8 characters.");
  }
  // bcrypt only reads the first 72 bytes, so refuse anything it would cut off.
  if (new TextEncoder().encode(password).length > 72) {
    return fail(
      "Your password must be 72 bytes or fewer (accented letters and emoji count as more than one)."
    );
  }
  if (password !== confirmPass) {
    return fail("Passwords do not match.");
  }

  // Writes a pending borrower row via the users repository, then
  // fire-and-forget logs the sign-up. A sign-up only creates a row in this
  // app's own `users` table; the account doesn't gain a real session until
  // an admin approves it and the person signs in (see public/sign-in/actions.ts).
  const result = await createPendingSignUp({
    idNumber,
    firstName,
    lastName,
    email: email || null,
    contactNumber: contactNumber || null,
    college,
    organization,
    passwordHash: await bcrypt.hash(password, 10),
  });
  if (!result.ok) return fail(result.error);

  await logActivity({
    userId: null,
    action: "account_signed_up",
    entityType: "user",
    entityId: result.id,
    description: result.resubmitted
      ? `Sign-up resubmitted for ID number '${idNumber}', previously rejected`
      : `New borrower sign-up submitted for ID number '${idNumber}'`,
  });

  return {
    status: "success",
    message:
      "Your sign-up has been submitted and is awaiting admin approval.",
  };
}