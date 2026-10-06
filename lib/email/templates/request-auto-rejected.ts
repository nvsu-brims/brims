// Real path: lib/email/templates/request-auto-rejected.ts
//
// E5 - Request auto-rejected. Sent to a borrower whose PENDING request was
// rejected by the system, not by an admin. Called by
// notifyRequestsAutoRejected() in notify.ts. Two causes exist in the app:
//   - "borrowed_by_other": another request for the same item was approved
//     (BUG-12, "Item was borrowed by another request");
//   - "item_unavailable": an admin marked the item unavailable
//     ("Item marked unavailable by admin").
// Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export type AutoRejectCause = "borrowed_by_other" | "item_unavailable";

export interface RequestAutoRejectedData {
  firstName: string;
  itemName: string;
  cause: AutoRejectCause;
  /** Absolute link to the borrower's catalog. */
  catalogUrl: string;
}

export function buildRequestAutoRejectedEmail(
  data: RequestAutoRejectedData,
): EmailContent {
  const explanation =
    data.cause === "item_unavailable"
      ? `Your pending request for **${data.itemName}** could not be approved ` +
        "because the item is currently unavailable."
      : `Your pending request for **${data.itemName}** could not be approved ` +
        "because the item was borrowed by another request.";

  const followUp =
    "You can submit a new request once the item is available again, or " +
    "browse other items.";

  return renderEmail({
    subject: `"${data.itemName}" is no longer available for your request`,
    label: "Request Update",
    tone: "neutral",
    greeting: `Hello ${data.firstName},`,
    blocks: [
      { type: "paragraph", text: explanation },
      { type: "paragraph", text: followUp },
    ],
    button: { text: "Browse items", url: data.catalogUrl },
  });
}