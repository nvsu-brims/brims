// Real path: lib/email/templates/request-rejected.ts
//
// E4 - Borrow request rejected. Sent to the borrower when an admin rejects
// their request. Called by notifyRequestRejected() in notify.ts.
//
// The reason comes from the request's `remarks`: the first line is the reason
// picked from REJECT_REASONS, and when the reason is "Other" a second part
// carries the admin's note (split in notify.ts). Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface RequestRejectedData {
  firstName: string;
  itemName: string;
  /** The reason picked by the admin, e.g. "Item under maintenance or repair". */
  reason: string;
  /** The admin's note. Empty unless the reason is "Other". */
  note: string;
  /** Absolute link to the borrower's catalog. */
  catalogUrl: string;
}

export function buildRequestRejectedEmail(data: RequestRejectedData): EmailContent {
  const note = data.note.trim();
  const reasonText = note ? `${data.reason}\n${note}` : data.reason;

  return renderEmail({
    subject: `Your request for "${data.itemName}" was not approved`,
    label: "Request Update",
    tone: "neutral",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text: `Your request to borrow **${data.itemName}** was not approved.`,
      },
      { type: "callout", title: "Reason", text: reasonText },
      {
        type: "paragraph",
        text:
          "You are welcome to submit a new request, or browse other " +
          "available items.",
      },
    ],
    button: { text: "Browse items", url: data.catalogUrl },
  });
}