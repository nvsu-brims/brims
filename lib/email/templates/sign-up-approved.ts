// Real path: lib/email/templates/sign-up-approved.ts
//
// E1 - Sign-up approved. Sent to the applicant when a super admin approves
// their sign-up request. Called by notifySignUpApproved() in notify.ts.
// Builds the message only; nothing is sent here.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface SignUpApprovedData {
  firstName: string;
  idNumber: string;
  /** Absolute link to the sign-in page. */
  signInUrl: string;
}

export function buildSignUpApprovedEmail(data: SignUpApprovedData): EmailContent {
  return renderEmail({
    subject: "Your NVSU-BRIMS account has been approved",
    label: "Account Approved",
    tone: "success",
    preheader: "You can now sign in to NVSU-BRIMS.",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          "Good news! Your sign-up request has been approved, and your " +
          "NVSU-BRIMS account is now active.",
      },
      {
        type: "paragraph",
        text:
          `You can sign in using your ID number (**${data.idNumber}**) and ` +
          "the password you created when you signed up.",
      },
      {
        type: "paragraph",
        text:
          "Once signed in, you can browse available items and equipment and " +
          "submit borrow requests.",
      },
    ],
    button: { text: "Sign in to NVSU-BRIMS", url: data.signInUrl },
  });
}