// Real path: lib/email/templates/password-reset.ts
//
// E10 - Password reset by an admin. Sent to the user whose password an admin
// just changed. Called by notifyPasswordReset() in notify.ts.
//
// SECURITY: this email NEVER contains the password. The admin gives the new
// password to the user separately. Builds the message only.

import {
  OFFICE_EMAIL,
  OFFICE_PHONE,
  renderEmail,
  type EmailContent,
} from "@/lib/email/templates/layout";

export interface PasswordResetData {
  firstName: string;
  /** Absolute link to the sign-in page. */
  signInUrl: string;
}

export function buildPasswordResetEmail(data: PasswordResetData): EmailContent {
  return renderEmail({
    subject: "Your NVSU-BRIMS password was reset",
    label: "Security Notice",
    tone: "security",
    preheader: "An administrator reset your password.",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          "An administrator has reset the password for your NVSU-BRIMS " +
          "account. Your new password has been given to you separately by " +
          "the office.",
      },
      {
        type: "paragraph",
        text:
          "For your security, please sign in and change your password right " +
          "away from your profile.",
      },
      {
        type: "paragraph",
        text:
          "If you did not expect this change, please contact the office " +
          `immediately at ${OFFICE_EMAIL} or ${OFFICE_PHONE}.`,
      },
    ],
    button: { text: "Sign in", url: data.signInUrl },
  });
}