// Real path: lib/email/templates/request-approved.ts
//
// E3 - Borrow request approved. Sent to the borrower when an admin approves
// their request. Called by notifyRequestApproved() in notify.ts.
//
// NOTE: the app has no pickup-instructions field today, so the message tells
// the borrower to visit the office with their ID. If specific pickup details
// (a time, a place) are added to the app later, include them here.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface RequestApprovedData {
  firstName: string;
  itemName: string;
  /** Full office name, e.g. "Sports Development Office". */
  officeName: string;
  /** Long date, e.g. "October 1, 2026". */
  dueDate: string;
  /** Absolute link to the borrower's Borrowed Items page. */
  borrowedItemsUrl: string;
}

export function buildRequestApprovedEmail(data: RequestApprovedData): EmailContent {
  return renderEmail({
    subject: `Your request for "${data.itemName}" has been approved`,
    label: "Request Approved",
    tone: "success",
    preheader: `Please pick up ${data.itemName} at the ${data.officeName}.`,
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text: `Your request to borrow **${data.itemName}** has been approved.`,
      },
      {
        type: "details",
        rows: [
          { label: "Item", value: data.itemName },
          { label: "Office", value: data.officeName },
          { label: "Return by", value: data.dueDate },
        ],
      },
      {
        type: "paragraph",
        text:
          `Please visit the ${data.officeName} to pick up the item, and bring ` +
          `your ID. Return it in good condition on or before **${data.dueDate}**.`,
      },
    ],
    button: { text: "View my borrowed items", url: data.borrowedItemsUrl },
  });
}