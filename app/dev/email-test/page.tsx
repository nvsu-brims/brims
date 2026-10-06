// TEMPORARY - DELETE BEFORE PRODUCTION.
// Real path: app/dev/email-test/page.tsx
//
// A dev-only page to try every email without clicking through the app. Open
// http://localhost:3000/dev/email-test while signed in as an admin.
//
// To remove it: delete the app/dev/email-test folder (page.tsx,
// email-test-panel.tsx, actions.ts). Nothing else depends on it.
//
// It returns a 404 in production, and the actions refuse to send unless
// EMAIL_SANDBOX is true. proxy.ts does not guard /dev, so this page checks the
// session itself.

import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/require-admin";
import { getEmailConfig } from "@/lib/email/config";
import {
  EmailTestPanel,
  type EmailTestKind,
} from "@/app/dev/email-test/email-test-panel";

export const dynamic = "force-dynamic";

const KINDS: EmailTestKind[] = [
  { kind: "sign_up_approved", code: "E1", title: "Sign-up approved", idLabel: "User id" },
  { kind: "sign_up_rejected", code: "E2", title: "Sign-up rejected", idLabel: "User id" },
  { kind: "request_approved", code: "E3", title: "Borrow request approved", idLabel: "Request id" },
  { kind: "request_rejected", code: "E4", title: "Borrow request rejected", idLabel: "Request id" },
  { kind: "request_auto_rejected", code: "E5", title: "Request auto-rejected", idLabel: "Item id" },
  { kind: "daily_unreturned", code: "E6", title: "Daily unreturned-item notice", idLabel: "Request id" },
  { kind: "item_returned", code: "E7", title: "Item returned", idLabel: "Request id" },
  { kind: "new_request_alert", code: "E8", title: "New request alert (admins)", idLabel: "Request id" },
  { kind: "new_sign_up_alert", code: "E9", title: "New sign-up alert (super admins)", idLabel: "User id" },
  { kind: "password_reset", code: "E10", title: "Password reset", idLabel: "User id" },
  { kind: "account_created", code: "E11", title: "Account created", idLabel: "User id" },
];

export default async function EmailTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireAdmin();

  // Show the email setup so a wrong .env.local is obvious.
  let status: { ok: true; sandbox: boolean; sandboxTo: string; from: string } | { ok: false; error: string };
  try {
    const config = getEmailConfig();
    status = { ok: true, sandbox: config.sandbox, sandboxTo: config.sandboxTo, from: config.from };
  } catch (error) {
    status = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Email test page</h1>
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Temporary dev tool.</strong> Delete the{" "}
          <code>app/dev/email-test</code> folder before going to production.
        </p>

        {status.ok ? (
          <p
            className={
              status.sandbox
                ? "rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900"
                : "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            }
          >
            {status.sandbox ? (
              <>
                Sandbox is <strong>ON</strong>: every email goes to{" "}
                <strong>{status.sandboxTo}</strong>. Sender: {status.from}
              </>
            ) : (
              <>
                Sandbox is <strong>OFF</strong>: sending from this page is
                blocked. Set <code>EMAIL_SANDBOX=&quot;true&quot;</code> in
                .env.local and restart the server.
              </>
            )}
          </p>
        ) : (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            Email is not configured: {status.error}
          </p>
        )}
      </header>

      <EmailTestPanel kinds={KINDS} />
    </main>
  );
}