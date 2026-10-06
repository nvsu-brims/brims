// Real path: lib/email/templates/new-sign-up-alert.ts
//
// E9 - New sign-up request waiting for review. Sent to each super admin (one
// email per admin) when someone submits a sign-up request, including a
// rejected applicant who resubmits. Called by notifyNewSignUpAlert() in
// notify.ts. Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface NewSignUpAlertData {
  adminFirstName: string;
  /** The applicant's full name. */
  requesterName: string;
  idNumber: string;
  /** Absolute link to the admin Sign-Up Requests page. */
  signUpRequestsUrl: string;
}

export function buildNewSignUpAlertEmail(data: NewSignUpAlertData): EmailContent {
  return renderEmail({
    subject: `New sign-up request from ${data.requesterName}`,
    label: "Action Required",
    tone: "action",
    preheader: `${data.requesterName} is waiting for approval.`,
    greeting: `Hello ${data.adminFirstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          `**${data.requesterName}** (ID number **${data.idNumber}**) has ` +
          "submitted a sign-up request and is waiting for approval.",
      },
    ],
    button: { text: "Review sign-up requests", url: data.signUpRequestsUrl },
  });
}