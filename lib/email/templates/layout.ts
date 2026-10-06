// Real path: lib/email/templates/layout.ts
//
// The shared NVSU-BRIMS email frame: header, status label, greeting, body
// blocks, optional button, footer. Every template (sign-up-approved.ts, ...)
// describes its message as data and calls renderEmail(); none of them write
// HTML. That keeps the header and footer identical in all 11 emails, and gives
// every email an HTML version AND a plain-text version from one description.
//
// Pure functions only: no environment, no database, nothing is sent here.
//
// Email-client rules this file follows, so the message looks right in Gmail,
// Outlook and phone apps: table layout, inline styles only, web-safe fonts,
// no images (no logo to host or to get blocked), and a plain-text fallback.
//
// Wording of each email lives in EMAIL-TEMPLATES.md.

/** What every template returns. send.ts takes these three fields. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Colour of the small status label under the header. */
export type EmailTone =
  | "success" // approved, returned, welcome
  | "info" // neutral good news / information
  | "action" // something needs the reader's attention
  | "danger" // overdue
  | "security" // password / account security
  | "neutral"; // rejected / declined (calm, not alarming)

export type EmailBlock =
  /** A paragraph. `**bold**` is supported. */
  | { type: "paragraph"; text: string }
  /** A small "label: value" list (item, office, return date...). */
  | { type: "details"; rows: Array<{ label: string; value: string }> }
  /** A highlighted box, e.g. the rejection reason. "\n" becomes a line break. */
  | { type: "callout"; title?: string; text: string };

export interface EmailLayoutInput {
  subject: string;
  /** Short label under the header, e.g. "Request Approved". */
  label: string;
  tone: EmailTone;
  /** e.g. "Hello Juan," */
  greeting: string;
  blocks: EmailBlock[];
  /** One call-to-action button. Must be an http(s) link. */
  button?: { text: string; url: string };
  /** Hidden preview line shown next to the subject in some inboxes. */
  preheader?: string;
}

// ---------------------------------------------------------------------------
// Brand + footer constants (from the About / FAQ pages)
// ---------------------------------------------------------------------------

export const BRAND_NAME = "NVSU-BRIMS";
export const UNIVERSITY_NAME = "Nueva Vizcaya State University";
export const SYSTEM_NAME =
  "Borrowing and Returning Items & Equipment Management System";
export const OFFICE_ADDRESS =
  "Quezon Street, Bayombong, Nueva Vizcaya, Philippines";
export const OFFICE_EMAIL = "brims@nvsu.edu.ph";
export const OFFICE_PHONE = "(078) 321-2027";

const FOOTER_NOTE =
  "This is an automated message from NVSU-BRIMS. Please do not reply to " +
  "this email. For questions, contact the office using the details above.";

const BRAND_GREEN = "#15803d"; // Tailwind green-700, as used by the app
const FONT = "Arial, Helvetica, sans-serif";

const TONES: Record<EmailTone, { bg: string; fg: string }> = {
  success: { bg: "#dcfce7", fg: "#166534" },
  info: { bg: "#e0f2fe", fg: "#075985" },
  action: { bg: "#fef3c7", fg: "#92400e" },
  danger: { bg: "#fee2e2", fg: "#991b1b" },
  security: { bg: "#e0e7ff", fg: "#3730a3" },
  neutral: { bg: "#f3f4f6", fg: "#374151" },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped HTML with `**bold**` and line breaks. */
function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br>");
}

/** Plain text with the `**` markers removed. */
function inlineText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Only real web links may become buttons. */
function isWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

// ---------------------------------------------------------------------------
// HTML pieces
// ---------------------------------------------------------------------------

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case "paragraph":
      return (
        `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:#1f2937;">` +
        `${inlineHtml(block.text)}</p>`
      );

    case "details": {
      const rows = block.rows
        .map(
          (row) =>
            `<tr>` +
            `<td style="padding:6px 12px 6px 0;font:14px/1.5 ${FONT};color:#6b7280;` +
            `white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>` +
            `<td style="padding:6px 0;font:14px/1.5 ${FONT};color:#111827;` +
            `font-weight:bold;vertical-align:top;">${inlineHtml(row.value)}</td>` +
            `</tr>`,
        )
        .join("");
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="margin:0 0 16px;background:#f9fafb;border:1px solid #e5e7eb;` +
        `border-radius:6px;width:100%;"><tr><td style="padding:10px 16px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
        `${rows}</table></td></tr></table>`
      );
    }

    case "callout": {
      const title = block.title
        ? `<div style="font:bold 13px/1.4 ${FONT};color:#374151;margin:0 0 4px;">` +
          `${escapeHtml(block.title)}</div>`
        : "";
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
        `style="margin:0 0 16px;width:100%;"><tr>` +
        `<td style="border-left:4px solid ${BRAND_GREEN};background:#f0fdf4;` +
        `padding:10px 14px;font:15px/1.6 ${FONT};color:#1f2937;">` +
        `${title}${inlineHtml(block.text)}</td></tr></table>`
      );
    }
  }
}

function buttonHtml(button: { text: string; url: string }): string {
  const url = escapeHtml(button.url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:8px 0 20px;"><tr>` +
    `<td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:6px;">` +
    `<a href="${url}" target="_blank" ` +
    `style="display:inline-block;padding:12px 22px;font:bold 15px/1 ${FONT};` +
    `color:#ffffff;text-decoration:none;border-radius:6px;">` +
    `${escapeHtml(button.text)}</a></td></tr></table>` +
    `<p style="margin:0 0 8px;font:12px/1.5 ${FONT};color:#6b7280;">` +
    `If the button does not work, copy this link into your browser:<br>` +
    `<a href="${url}" target="_blank" style="color:${BRAND_GREEN};word-break:break-all;">` +
    `${url}</a></p>`
  );
}

// ---------------------------------------------------------------------------
// renderEmail
// ---------------------------------------------------------------------------

/** Wraps a message in the shared header/footer and returns subject, html, text. */
export function renderEmail(input: EmailLayoutInput): EmailContent {
  const tone = TONES[input.tone];
  const button =
    input.button && isWebUrl(input.button.url) ? input.button : undefined;

  // --- HTML -----------------------------------------------------------------
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;` +
      `font-size:1px;line-height:1px;color:#f3f4f6;">` +
      `${escapeHtml(input.preheader)}</div>`
    : "";

  const header =
    `<tr><td style="background:${BRAND_GREEN};padding:22px 28px;">` +
    `<div style="font:bold 22px/1.3 ${FONT};color:#ffffff;">` +
    `${UNIVERSITY_NAME}</div>` +
    `<div style="font:13px/1.5 ${FONT};color:#dcfce7;margin-top:4px;">` +
    `${escapeHtml(SYSTEM_NAME)}</div>` +
    `</td></tr>`;

  const label =
    `<tr><td style="padding:20px 28px 0;">` +
    `<span style="display:inline-block;padding:4px 12px;border-radius:999px;` +
    `background:${tone.bg};color:${tone.fg};font:bold 12px/1.4 ${FONT};` +
    `text-transform:uppercase;letter-spacing:0.6px;">${escapeHtml(input.label)}</span>` +
    `</td></tr>`;

  const body =
    `<tr><td style="padding:18px 28px 8px;">` +
    `<p style="margin:0 0 16px;font:16px/1.5 ${FONT};color:#111827;">` +
    `${escapeHtml(input.greeting)}</p>` +
    input.blocks.map(blockHtml).join("") +
    (button ? buttonHtml(button) : "") +
    `</td></tr>`;

  const footer =
    `<tr><td style="padding:18px 28px 24px;border-top:1px solid #e5e7eb;` +
    `background:#f9fafb;">` +
    `<p style="margin:0 0 6px;font:12px/1.6 ${FONT};color:#374151;">` +
    `<strong>${BRAND_NAME}</strong> &middot; ${escapeHtml(OFFICE_ADDRESS)}<br>` +
    `<a href="mailto:${OFFICE_EMAIL}" style="color:${BRAND_GREEN};">${OFFICE_EMAIL}</a>` +
    ` &middot; ${escapeHtml(OFFICE_PHONE)}</p>` +
    `<p style="margin:0;font:12px/1.6 ${FONT};color:#6b7280;">${escapeHtml(FOOTER_NOTE)}</p>` +
    `</td></tr>`;

  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<title>${escapeHtml(input.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;">` +
    preheader +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;` +
    `border-radius:8px;overflow:hidden;">` +
    header +
    label +
    body +
    footer +
    `</table></td></tr></table></body></html>`;

  // --- Plain text -----------------------------------------------------------
  const textBlocks = input.blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return inlineText(block.text);
      case "details":
        return block.rows
          .map((row) => `- ${row.label}: ${inlineText(row.value)}`)
          .join("\n");
      case "callout":
        return (
          (block.title ? `${block.title}\n` : "") +
          inlineText(block.text)
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        );
    }
  });

  const text = [
    UNIVERSITY_NAME,
    SYSTEM_NAME,
    "",
    `[${input.label.toUpperCase()}]`,
    "",
    input.greeting,
    "",
    textBlocks.join("\n\n"),
    ...(button ? ["", `${button.text}: ${button.url}`] : []),
    "",
    "--",
    `${BRAND_NAME} | ${OFFICE_ADDRESS}`,
    `${OFFICE_EMAIL} | ${OFFICE_PHONE}`,
    "",
    FOOTER_NOTE,
  ].join("\n");

  return { subject: input.subject, html, text };
}