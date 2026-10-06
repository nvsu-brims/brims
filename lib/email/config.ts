// Real path: lib/email/config.ts
//
// Reads and validates the email settings from the environment, once, and hands
// the rest of lib/email a single typed object. Nothing else in lib/email should
// touch process.env.
//
// Env vars (put them in .env.local, never in a NEXT_PUBLIC_ variable):
//
//   RESEND_API_KEY     Resend API key.                        Required.
//   EMAIL_FROM         Sender, e.g. "BRIMS <no-reply@your-domain>".
//                      Dev default: "BRIMS <onboarding@resend.dev>".
//                      Required in production.
//   EMAIL_SANDBOX      "true" | "false". When true, every email is sent to
//                      EMAIL_SANDBOX_TO instead of the real recipient.
//                      Default: true outside production, false in production.
//   EMAIL_SANDBOX_TO   Where sandbox emails go. Default: delivered@resend.dev
//                      (Resend's test address; use your own Resend account
//                      email to see the email in a real inbox).
//   APP_BASE_URL       Site address used for links inside emails.
//                      Dev default: http://localhost:3000.
//                      Required in production.
//
// BEFORE GOING TO PRODUCTION: sandbox mode and the test sender are for local
// development only. Set EMAIL_SANDBOX=false, a verified-domain EMAIL_FROM,
// the real APP_BASE_URL and a production RESEND_API_KEY on the host. The full
// checklist is at the top of lib/email/send.ts.
//
// Validated on first use, not on import, so `next build` still works with none
// of these set (same approach as lib/session-config.ts).
//
// getEmailConfig() THROWS when a required value is missing or unsafe. The
// caller (lib/email/send.ts) must catch it, log email_send_failed, and carry
// on, because an email problem must never break the action that triggered it.

/** Resend's test address: always "delivered", has no inbox. */
export const SANDBOX_FALLBACK_TO = "delivered@resend.dev";

/** Sender used in development when EMAIL_FROM is not set. */
const DEV_DEFAULT_FROM = "BRIMS <onboarding@resend.dev>";

/** Site address used in development when APP_BASE_URL is not set. */
const DEV_DEFAULT_BASE_URL = "http://localhost:3000";

export type EmailConfig = {
  /** Resend API key. */
  apiKey: string;
  /** Sender, as "Name <address>". */
  from: string;
  /** True when every email must be redirected to `sandboxTo`. */
  sandbox: boolean;
  /** Sandbox destination. Only used when `sandbox` is true. */
  sandboxTo: string;
  /** Site address with no trailing slash, e.g. "https://brims.example.edu". */
  appBaseUrl: string;
};

let cached: EmailConfig | null = null;

/** Trimmed env value, or undefined when missing or blank. */
function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * The validated email settings. Throws a descriptive error when something
 * required is missing, or when a development-only value would be used in
 * production.
 */
export function getEmailConfig(): EmailConfig {
  if (cached) return cached;

  const isProduction = process.env.NODE_ENV === "production";

  // --- API key -------------------------------------------------------------
  const apiKey = read("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local and restart the server.",
    );
  }

  // --- Sandbox -------------------------------------------------------------
  // Safe default: sandbox ON everywhere except production, so a dev machine
  // cannot email real borrowers by accident. Set EMAIL_SANDBOX="false"
  // explicitly to turn real sending on.
  const sandboxRaw = read("EMAIL_SANDBOX")?.toLowerCase();
  if (sandboxRaw && sandboxRaw !== "true" && sandboxRaw !== "false") {
    throw new Error(
      `EMAIL_SANDBOX must be "true" or "false" (got "${sandboxRaw}").`,
    );
  }
  const sandbox = sandboxRaw ? sandboxRaw === "true" : !isProduction;

  const sandboxTo = read("EMAIL_SANDBOX_TO") ?? SANDBOX_FALLBACK_TO;

  // --- Sender --------------------------------------------------------------
  const from = read("EMAIL_FROM") ?? (isProduction ? undefined : DEV_DEFAULT_FROM);
  if (!from) {
    throw new Error(
      'EMAIL_FROM is not set. In production use a verified domain, e.g. "BRIMS <no-reply@your-domain>".',
    );
  }
  // onboarding@resend.dev is Resend's test-only sender. In production it can
  // only reach the account owner, so treat it as a misconfiguration.
  if (isProduction && from.toLowerCase().includes("@resend.dev")) {
    throw new Error(
      "EMAIL_FROM uses @resend.dev (test sender) in production. Verify a domain in Resend and use it instead.",
    );
  }

  // --- Base URL ------------------------------------------------------------
  const baseUrlRaw =
    read("APP_BASE_URL") ?? (isProduction ? undefined : DEV_DEFAULT_BASE_URL);
  if (!baseUrlRaw) {
    throw new Error(
      "APP_BASE_URL is not set. Emails need it to build links (e.g. https://your-site).",
    );
  }
  if (!/^https?:\/\//i.test(baseUrlRaw)) {
    throw new Error(
      `APP_BASE_URL must start with http:// or https:// (got "${baseUrlRaw}").`,
    );
  }
  const appBaseUrl = baseUrlRaw.replace(/\/+$/, "");

  // In production a sandbox redirect would silently swallow every real email,
  // so make it loud once at startup of the first send.
  if (isProduction && sandbox) {
    console.warn(
      "[email] EMAIL_SANDBOX is true in production: every email is being redirected to " +
        sandboxTo +
        ". Set EMAIL_SANDBOX=false to send to real recipients.",
    );
  }

  cached = { apiKey, from, sandbox, sandboxTo, appBaseUrl };
  return cached;
}

/**
 * Absolute link for use inside an email, e.g. appUrl("/sign-in") ->
 * "http://localhost:3000/sign-in". Throws like getEmailConfig() when
 * APP_BASE_URL is missing in production.
 */
export function appUrl(path: string): string {
  const { appBaseUrl } = getEmailConfig();
  return `${appBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}