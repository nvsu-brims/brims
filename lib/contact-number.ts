// Real path: lib/contact-number.ts
//
// Philippine mobile number format: 09XX XXX XXXX (11 digits, "09" required).
// Spaces are display-only; stored value is digits-only ("09173846215").
// Shared by client forms and server actions so the rule can't drift.

/** Total digits in a contact number ("09" + 9). */
export const CONTACT_NUMBER_DIGITS = 11;

/** Length of a formatted number, spaces included ("09XX XXX XXXX"). */
export const CONTACT_NUMBER_LENGTH = CONTACT_NUMBER_DIGITS + 2;

/** The locked prefix. */
export const CONTACT_NUMBER_PREFIX = "09";

/** Shown as the input placeholder. */
export const CONTACT_NUMBER_PLACEHOLDER = "09XX XXX XXXX";

/** Shown when a submitted number doesn't match the format. */
export const CONTACT_NUMBER_ERROR =
  "Contact number must be 11 digits starting with 09 (e.g. 0917 384 6215).";

const CONTACT_NUMBER_PATTERN = /^09\d{9}$/;

/**
 * Formats input as "09XX XXX XXXX": keeps the "09" prefix, drops non-digits,
 * caps at 11 digits. A "+63" number is not converted and fails validation.
 */
export function formatContactNumber(value: string): string {
  let digits = value.replace(/\D/g, "");
  // Enforce the "09" prefix, however the value arrived.
  if (!digits.startsWith(CONTACT_NUMBER_PREFIX)) {
    digits = CONTACT_NUMBER_PREFIX + digits.replace(/^0*9?/, "");
  }
  digits = digits.slice(0, CONTACT_NUMBER_DIGITS);

  if (digits.length > 7) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length > 4) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  return digits;
}

/** Digits-only form, e.g. "0917 384 6215" -> "09173846215". Stored/validated form. */
export function normalizeContactNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/** True for "09" + 9 digits, ignoring spaces/dashes. Rejects letters and wrong length. */
export function isValidContactNumber(value: string): boolean {
  if (/[^\d\s-]/.test(value)) return false;
  return CONTACT_NUMBER_PATTERN.test(normalizeContactNumber(value));
}