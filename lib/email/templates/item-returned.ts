// Real path: lib/email/templates/item-returned.ts
//
// E7 - Item marked returned (receipt). Sent to the borrower when an admin
// marks the item as returned. Called by notifyItemReturned() in notify.ts.
// Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface ItemReturnedData {
  firstName: string;
  itemName: string;
  /** Long date the item was returned, e.g. "October 1, 2026". */
  returnedDate: string;
  /** Absolute link to the borrower's History page. */
  historyUrl: string;
}

export function buildItemReturnedEmail(data: ItemReturnedData): EmailContent {
  return renderEmail({
    subject: `We received your returned item: ${data.itemName}`,
    label: "Item Returned",
    tone: "success",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          `This confirms that **${data.itemName}** has been marked as ` +
          "returned. Thank you for returning it.",
      },
      {
        type: "details",
        rows: [
          { label: "Item", value: data.itemName },
          { label: "Returned on", value: data.returnedDate },
        ],
      },
      { type: "paragraph", text: "You can view this in your borrow history." },
    ],
    button: { text: "View borrow history", url: data.historyUrl },
  });
}