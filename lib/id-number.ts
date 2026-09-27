// Real path: lib/id-number.ts
//
// ID number format: 000-0000 (e.g. 252-0229). Shared by client forms and
// server actions so the rule can't drift.

/** Total digits in an ID number (3 + 4). */
export const ID_NUMBER_DIGITS = 7;

/** Length of a formatted ID number, hyphen included ("000-0000"). */
export const ID_NUMBER_LENGTH = ID_NUMBER_DIGITS + 1;

/** Shown as the input placeholder. */
export const ID_NUMBER_PLACEHOLDER = "000-0000";

/** Shown when a submitted ID doesn't match the format. */
export const ID_NUMBER_ERROR = "ID number must be in the format 000-0000.";

const ID_NUMBER_PATTERN = /^\d{3}-\d{4}$/;

/**
 * Formats input as "000-0000": drops non-digits, caps at 7 digits, inserts
 * the hyphen once a 4th digit is typed (so backspacing over it works).
 */
export function formatIdNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, ID_NUMBER_DIGITS);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/** True only for a complete "000-0000". Rejects "0000-0000", "000000", etc. */
export function isValidIdNumber(value: string): boolean {
  return ID_NUMBER_PATTERN.test(value);
}