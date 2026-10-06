// Real path: lib/email/templates/sign-up-rejected.ts
//
// E2 - Sign-up rejected. Sent to the applicant when a super admin rejects
// their sign-up request. Called by notifySignUpRejected() in notify.ts.
//
// DECIDED: no reason is given, so this template takes no reason at all. It
// states the outcome and points the applicant to the office.

import {
  OFFICE_EMAIL,
  OFFICE_PHONE,
  renderEmail,
  type EmailContent,
} from "@/lib/email/templates/layout";

export interface SignUpRejectedData {
  firstName: string;
}

export function buildSignUpRejectedEmail(data: SignUpRejectedData): EmailContent {
  return renderEmail({
    subject: "Update on your NVSU-BRIMS sign-up request",
    label: "Sign-Up Update",
    tone: "neutral",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          "Thank you for signing up for NVSU-BRIMS. After review, your " +
          "sign-up request was not approved.",
      },
      {
        type: "paragraph",
        text:
          "If you have questions about this decision, please contact the " +
          `office at ${OFFICE_EMAIL} or ${OFFICE_PHONE}.`,
      },
    ],
  });
}