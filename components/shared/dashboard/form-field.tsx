"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

// Reusable label + spacing wrapper for dashboard Add/Edit form fields.
// Owns only the label and its spacing — no state, validation, or field type.
// The field itself (Input, Select, Textarea, etc.) is passed as `children`.
// Works in any form, not just inside FormDialogShell (form-dialog.tsx).

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  /** Rendered inline after the label — e.g. a required suffix or hint. */
  labelSuffix?: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  children,
  labelSuffix,
}: FormFieldProps) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
        {label}
        {labelSuffix}
      </Label>
      {children}
    </div>
  );
}

// Shared emerald focus-ring + rounded-md! for all dashboard form inputs
// (Inputs, Selects, Textareas inside Add/Edit dialogs).
export const FIELD_FOCUS_RING_CLASSES =
  "rounded-md! hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30";

// Same treatment for filter-bar SelectTriggers and search Inputs in
// every admin table. Keep in sync with FIELD_FOCUS_RING_CLASSES above.
export const FILTER_BAR_CLASSES =
  "rounded-md! hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30";