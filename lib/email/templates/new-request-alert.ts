// Real path: lib/email/templates/new-request-alert.ts
//
// E8 - New borrow request waiting for review. Sent to each admin of the
// item's office (one email per admin) when a borrower submits a request.
// Called by notifyNewRequestAlert() in notify.ts. Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface NewRequestAlertData {
  adminFirstName: string;
  /** The borrower's full name. */
  requesterName: string;
  itemName: string;
  /** Full office name, e.g. "Sports Development Office". */
  officeName: string;
  /** Long date the borrower asked to return the item, e.g. "October 1, 2026". */
  dueDate: string;
  /** Absolute link to the admin Requests page. */
  requestsUrl: string;
}

export function buildNewRequestAlertEmail(data: NewRequestAlertData): EmailContent {
  return renderEmail({
    subject: `New borrow request: ${data.itemName}`,
    label: "Action Required",
    tone: "action",
    preheader: `${data.requesterName} requested ${data.itemName}.`,
    greeting: `Hello ${data.adminFirstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          `**${data.requesterName}** has requested to borrow ` +
          `**${data.itemName}** from the ${data.officeName}.`,
      },
      {
        type: "details",
        rows: [
          { label: "Borrower", value: data.requesterName },
          { label: "Item", value: data.itemName },
          { label: "Requested return date", value: data.dueDate },
        ],
      },
    ],
    button: { text: "Review request", url: data.requestsUrl },
  });
}