// Real path: lib/email/templates/account-created.ts
//
// E11 - Account created by an admin (welcome). Sent to the email address
// entered for the new account, not to the admin. Called by
// notifyAccountCreated() in notify.ts.
//
// SECURITY: this email NEVER contains the password. The admin gives it to the
// user separately. Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface AccountCreatedData {
  firstName: string;
  idNumber: string;
  /** Absolute link to the sign-in page. */
  signInUrl: string;
}

export function buildAccountCreatedEmail(data: AccountCreatedData): EmailContent {
  return renderEmail({
    subject: "Welcome to NVSU-BRIMS — your account is ready",
    label: "Welcome",
    tone: "success",
    preheader: "Your NVSU-BRIMS account has been created.",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text: "An account has been created for you on NVSU-BRIMS.",
      },
      {
        type: "details",
        rows: [
          { label: "Sign in with ID number", value: data.idNumber },
          { label: "Password", value: "Provided to you separately by the office" },
        ],
      },
      {
        type: "paragraph",
        text:
          "After your first sign-in, please change your password from your " +
          "profile.",
      },
    ],
    button: { text: "Sign in to NVSU-BRIMS", url: data.signInUrl },
  });
}