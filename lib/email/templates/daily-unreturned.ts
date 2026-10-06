// Real path: lib/email/templates/daily-unreturned.ts
//
// E6 - Daily unreturned-item notice. Sent to the borrower every day at
// 8:00 AM (Philippine time) from the due date until the item is marked
// returned. Called by notifyDailyUnreturned() in notify.ts.
//
// Two wordings, chosen by `daysOverdue`:
//   0   -> the due date itself: "Due today" reminder (item not yet overdue)
//   1+  -> after the due date: "Overdue" notice with the number of days
// Builds the message only.

import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";

export interface DailyUnreturnedData {
  firstName: string;
  itemName: string;
  /** Full office name, e.g. "Sports Development Office". */
  officeName: string;
  /** Long date the item was due, e.g. "October 1, 2026". */
  dueDate: string;
  /** Whole days past the due date. 0 on the due date itself. */
  daysOverdue: number;
  /** Absolute link to the borrower's Borrowed Items page. */
  borrowedItemsUrl: string;
}

export function buildDailyUnreturnedEmail(data: DailyUnreturnedData): EmailContent {
  const days = Math.max(0, Math.floor(data.daysOverdue));

  // --- Due today ---------------------------------------------------------
  if (days === 0) {
    return renderEmail({
      subject: `Due today: please return ${data.itemName}`,
      label: "Reminder",
      tone: "action",
      preheader: `${data.itemName} is due for return today.`,
      greeting: `Hello ${data.firstName},`,
      blocks: [
        {
          type: "paragraph",
          text:
            `This is a reminder that **${data.itemName}** is due for return ` +
            `**today, ${data.dueDate}**.`,
        },
        {
          type: "paragraph",
          text:
            `Please return it to the ${data.officeName} today. If you have ` +
            "already returned it, please let the office know so it can be " +
            "recorded.",
        },
      ],
      button: { text: "View my borrowed items", url: data.borrowedItemsUrl },
    });
  }

  // --- Overdue -----------------------------------------------------------
  const dayWord = days === 1 ? "1 day" : `${days} days`;
  return renderEmail({
    subject: `Overdue: ${data.itemName} was due on ${data.dueDate}`,
    label: "Overdue",
    tone: "danger",
    preheader: `${data.itemName} is overdue by ${dayWord}.`,
    greeting: `Hello ${data.firstName},`,
    blocks: [
      {
        type: "paragraph",
        text:
          `**${data.itemName}** was due on **${data.dueDate}** and is now ` +
          `overdue by **${dayWord}**.`,
      },
      {
        type: "paragraph",
        text:
          `Please return it to the ${data.officeName} as soon as possible. ` +
          "You will keep receiving this reminder each day until the item is " +
          "returned.",
      },
    ],
    button: { text: "View my borrowed items", url: data.borrowedItemsUrl },
  });
}