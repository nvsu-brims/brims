"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Shared confirm dialog: pass `description` for a plain "are you sure",
// or `children` for a custom body (e.g. a reason dropdown + note). Use
// `confirmDisabled` to gate the confirm button on caller-owned form state.
// variant="danger" (default) is red; "success" is green.

type ConfirmDialogVariant = "danger" | "success";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Body text for a plain "are you sure" confirm. Ignored if `children` is set. */
  description?: string;
  /** Custom body (form fields, etc.) — replaces `description` when set. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  /** Disables the confirm button without closing the dialog. */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

const CONFIRM_BUTTON_VARIANT_CLASSES: Record<ConfirmDialogVariant, string> = {
  danger: "bg-red-600! hover:bg-red-700!",
  success: "bg-green-600! hover:bg-green-700!",
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  confirmDisabled = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          "gap-0! border-0 p-0! shadow-md",
          children ? "max-w-md" : "max-w-sm",
        )}
      >
        <div className="m-0! flex items-center justify-between px-5 py-4">
          <AlertDialogTitle className="text-lg font-semibold text-slate-900">
            {title}
          </AlertDialogTitle>
          <AlertDialogCancel asChild>
            <button
              type="button"
              aria-label="Close"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          </AlertDialogCancel>
        </div>

        {children ? (
          <div className="m-0! space-y-4 px-5 py-4">{children}</div>
        ) : (
          <AlertDialogDescription className="m-0! px-5 py-5 text-sm text-slate-600">
            {description}
          </AlertDialogDescription>
        )}

        <AlertDialogFooter className="m-0! flex flex-row items-center justify-end gap-2 border-t-0! bg-popover px-5 py-4">
          <AlertDialogCancel asChild>
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {cancelLabel}
            </button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={(e) => {
                // AlertDialogAction closes the dialog by default on click.
                // Always prevent that here so a caller with its own
                // validation (e.g. the Reject dialog's reason dropdown)
                // can keep the dialog open on an invalid submit — it's
                // the caller's onConfirm/onOpenChange that decides when
                // to actually close.
                e.preventDefault();
                if (confirmDisabled) return;
                onConfirm();
              }}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium text-gray-50 disabled:cursor-not-allowed disabled:opacity-50",
                CONFIRM_BUTTON_VARIANT_CLASSES[variant],
              )}
            >
              {confirmLabel}
            </button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}