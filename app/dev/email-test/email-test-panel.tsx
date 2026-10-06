"use client";

// TEMPORARY - DELETE BEFORE PRODUCTION.
// Real path: app/dev/email-test/email-test-panel.tsx
//
// The buttons for the email test page. See page.tsx.

import { useState, useTransition } from "react";

import {
  previewEmailAction,
  runRealNotifyAction,
  sendSampleEmailAction,
  type ActionResult,
  type PreviewResult,
} from "@/app/dev/email-test/actions";

export interface EmailTestKind {
  kind:
    | "sign_up_approved"
    | "sign_up_rejected"
    | "request_approved"
    | "request_rejected"
    | "request_auto_rejected"
    | "daily_unreturned"
    | "item_returned"
    | "new_request_alert"
    | "new_sign_up_alert"
    | "password_reset"
    | "account_created";
  code: string;
  title: string;
  /** What the id field means for the "real record" test. */
  idLabel: string;
}

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50";

function EmailRow({ item }: { item: EmailTestKind }) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [showText, setShowText] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [id, setId] = useState("");

  const run = (task: () => Promise<void>) => startTransition(task);

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">
        <span className="mr-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
          {item.code}
        </span>
        {item.title}
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={`${BUTTON} border-slate-300 bg-white text-slate-800`}
          onClick={() =>
            run(async () => {
              setResult(null);
              setPreview(await previewEmailAction(item.kind));
            })
          }
        >
          Preview
        </button>

        <button
          type="button"
          disabled={pending}
          className={`${BUTTON} border-green-700 bg-green-700 text-white`}
          onClick={() =>
            run(async () => {
              setResult(await sendSampleEmailAction(item.kind));
            })
          }
        >
          Send sample via Resend
        </button>

        <span className="mx-1 text-slate-300">|</span>

        <input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder={item.idLabel}
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          aria-label={item.idLabel}
        />
        <button
          type="button"
          disabled={pending || id.trim() === ""}
          className={`${BUTTON} border-slate-300 bg-slate-800 text-white`}
          onClick={() =>
            run(async () => {
              setResult(await runRealNotifyAction(item.kind, Number(id)));
            })
          }
        >
          Run real record
        </button>

        {pending && <span className="text-sm text-slate-500">Working...</span>}
      </div>

      {result && (
        <p
          className={
            result.ok
              ? "rounded-md bg-green-50 p-2 text-sm text-green-900"
              : "rounded-md bg-red-50 p-2 text-sm text-red-900"
          }
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      {preview &&
        (preview.ok ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Subject:</span> {preview.subject}
            </p>
            <button
              type="button"
              className="text-sm text-green-800 underline"
              onClick={() => setShowText((v) => !v)}
            >
              {showText ? "Show HTML version" : "Show plain-text version"}
            </button>
            {showText ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-slate-100 p-3 text-xs text-slate-800">
                {preview.text}
              </pre>
            ) : (
              <iframe
                title={`${item.code} preview`}
                srcDoc={preview.html}
                sandbox=""
                className="h-160 w-full rounded-md border border-slate-200 bg-white"
              />
            )}
          </div>
        ) : (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-900">
            {preview.error}
          </p>
        ))}
    </section>
  );
}

export function EmailTestPanel({ kinds }: { kinds: EmailTestKind[] }) {
  return (
    <div className="space-y-4">
      {kinds.map((item) => (
        <EmailRow key={item.kind} item={item} />
      ))}
    </div>
  );
}