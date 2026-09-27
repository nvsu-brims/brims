"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// FormDialogShell — the reusable chrome shared by every Add/Edit form
// dialog in the admin dashboard (currently: Add Item, Edit Item, Add User,
// Edit User, all inlined directly in admin/items/page.tsx and
// admin/users/page.tsx rather than as their own standalone dialog
// components — this shell is the only piece actually factored out).
//
// It owns just the frame: the Dialog/DialogContent wrapper, an optional
// icon+title+description header (matching admin_dashboard.php's
// #addItemModal-style header — icon chip, bold title, muted description),
// a scrollable body for form fields, and a footer for action buttons. It
// does NOT own any form state, fields, or submit logic — every field,
// every conditional branch, and every payload shape stays with the page
// that renders it, since Item fields and User fields share nothing beyond
// this chrome.
//
// Two footer shapes exist across the four current forms — Add Item uses
// one full-width submit button (no Cancel), while Edit Item/Add User/Edit
// User use a right-aligned Cancel + Submit pair — so `footer` is a plain
// ReactNode slot rather than a fixed Cancel/Submit prop pair, letting each
// page render whichever shape its own PHP source used.
// ---------------------------------------------------------------------------

interface FormDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Optional icon chip shown to the left of the title (Add Item's
   *  green-tinted box icon, for example). Omit for the simpler
   *  title-only header used by Edit Item / Add User / Edit User. */
  icon?: ReactNode;
  /** "sm" (Edit Item's compact 3-field form) | "lg" (the wider 2-column
   *  forms: Add Item, Add User, Edit User). Controls DialogContent's
   *  max-width only. */
  size?: "sm" | "lg";
  /** The <form> element itself, including its id and onSubmit — the
   *  shell renders it directly so the submit button in `footer` can
   *  target it via a matching `form="..."` attribute, exactly like each
   *  page already does. */
  children: ReactNode;
  footer: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<FormDialogShellProps["size"]>, string> = {
  sm: "max-w-sm",
  lg: "max-w-2xl!",
};

export function FormDialogShell({
  open,
  onOpenChange,
  title,
  description,
  icon,
  size = "lg",
  children,
  footer,
}: FormDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 border-0 p-0 shadow-md",
          SIZE_CLASSES[size],
        )}
      >
        {icon ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-800">
              {icon}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-green-800">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-sm text-muted-foreground">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
        )}

        {children}

        {footer}
      </DialogContent>
    </Dialog>
  );
}