"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/dates";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { changePasswordAction } from "@/app/(dashboard)/actions";
import { FIELD_FOCUS_RING_CLASSES } from "@/components/shared/dashboard/form-field";

export interface ProfileField {
  label: string;
  value: string;
}

export interface DashboardProfileInfo {
  firstName: string;
  lastName: string;
  /** Optional label shown INSTEAD of "firstName lastName" in the sidebar and
   *  mobile-header footers (e.g. "SDO Admin" for an admin). The profile
   *  dialog itself still shows the real full name. */
  displayName?: string;
  idNumber: string;
  email: string;
  contactNumber: string;
  /** Role-specific extra fields, ported from profile_section.php's
   *  $middle_fields contract: 0 fields for a super admin (no equivalent
   *  scoping field at all), 1 field (Office) for a scoped admin, or 2
   *  fields (College, Organization Name) for a borrower. Two fields
   *  render side by side in one row; a single field takes the full row.
   *  Each dashboard layout decides what goes here. */
  middleFields: ProfileField[];
  /** ISO date string. Rendered in the dialog footer as "Member since". */
  memberSince: string;
  /** ISO date string, or null if the password has never been changed
   *  since account creation. Rendered in the dialog footer as "Last
   *  password change". */
  lastPasswordChangeAt: string | null;
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: DashboardProfileInfo;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

// ---------------------------------------------------------------------------
// Profile as a Dialog instead of a route — app/(dashboard)/{admin,borrower}/
// profile/page.tsx were removed in favor of this. Ported from the shared
// includes/components/profile_section.php partial that admin_dashboard.php
// and borrower_dashboard.php both included via #profileSection: same two
// parts, same field contract, just rendered on top of whatever section the
// user is already on instead of navigating to a separate page.
//
//   1. Account Information — read-only (ID Number, Contact Number, plus the
//      0/1/2 "middle fields" described on DashboardProfileInfo above). Full
//      Name and Email are shown once, in the dialog header, rather than
//      repeated here.
//   2. Change Password — Old/New/Confirm fields with the same show/hide
//      toggle pattern as sign-in/sign-up. The PHP partial told
//      admin_dashboard.php and borrower_dashboard.php's submissions apart
//      via a hidden `password_field_name` input
//      (`update_admin_password` / `update_password`) posting back to the
//      same page. Here both dashboards share one Server Action,
//      changePasswordAction (app/(dashboard)/actions.ts): it only ever
//      changes the signed-in user's OWN password, so no per-dashboard
//      variant is needed. The result (success or error) shows as a toast
//      through AppToaster, not an inline banner: a banner rendered under
//      the form pushed the dialog's layout around when it appeared. The
//      fields clear on success. "Last password change" has no dedicated
//      column: the layouts load it once on mount from GET /api/me, which
//      reads the latest password_changed_by_self / password_reset_by_admin
//      activity-log row (getLastPasswordChangeAt). changePasswordAction
//      returns the new timestamp on success so the footer updates
//      immediately, since the layout's copy can't reflect a change made
//      mid-session. Not built: the "Password Changed" email.
// ---------------------------------------------------------------------------
export function ProfileDialog({
  open,
  onOpenChange,
  profile,
}: ProfileDialogProps) {
  const [showOld, setShowOld] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isUpdating, startTransition] = React.useTransition();
  // Set synchronously when a submit starts. `isUpdating` is state, so it only
  // reflects a submit after React re-renders; this ref closes that gap so two
  // submits in quick succession (double click, or Enter plus a click) can't
  // send two requests. The second would fail with "current password is
  // incorrect" because the first had already changed it.
  const submittingRef = React.useRef(false);

  // The layout loads lastPasswordChangeAt once, from /api/me on mount, so it
  // won't reflect a change made in this same session. `profile` is already
  // the source of truth for every render; the only thing this component adds
  // is a same-session override once the Server Action itself reports a new
  // timestamp, so there's no need to mirror the prop into state (which is
  // what needed the effect). `null` here means "no override yet" — genuinely
  // clearing the footer is never a thing this dialog does — so the derived
  // value below falls back to the prop until a successful password change
  // sets the override.
  const [lastPasswordChangeOverride, setLastPasswordChangeOverride] =
    React.useState<string | null>(null);
  const lastPasswordChangeAt =
    lastPasswordChangeOverride ?? profile.lastPasswordChangeAt;

  function resetPasswordForm() {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
  }

  function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (isUpdating || submittingRef.current) return;

    // Quick checks so an obvious mistake doesn't need a round trip; the
    // Server Action repeats every rule (and adds the 72-byte maximum and the
    // "different from current password" rule).
    if (newPassword === "") {
      toast.error("New password cannot be empty.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation must match.");
      return;
    }
    // Same minimum the Server Action enforces (PASSWORD_MIN in
    // dashboard-actions.ts), so this mistake doesn't cost a round trip.
    if (newPassword.length < 8) {
      toast.error("Your new password must be at least 8 characters.");
      return;
    }

    submittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await changePasswordAction({
          currentPassword: oldPassword,
          newPassword,
          confirmPassword,
        });
        if (result.ok) {
          toast.success(result.message);
          setLastPasswordChangeOverride(result.passwordChangedAt);
          setOldPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else {
          toast.error(result.error);
        }
      } catch {
        // The request itself failed (network drop, server restart), so the
        // outcome is unknown: the server may have saved the change already.
        toast.error("No response from the server. Your password may have changed.");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Never leave typed passwords behind in a closed dialog.
        if (!nextOpen) resetPasswordForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-3xl! gap-0 border-0 p-0 shadow-md">
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className="bg-green-700 text-sm font-semibold text-gray-50">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-semibold text-slate-900">
              {fullName || "Profile"}
            </DialogTitle>
            <DialogDescription className="truncate text-sm text-muted-foreground">
              {profile.email}
            </DialogDescription>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-5 py-5 md:grid-cols-2">
          {/* Account Information — read-only, mirrors profile_section.php's
              Account Information card. */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Account Information
            </h3>
            <div className="space-y-3">
              <ReadOnlyField label="ID Number" value={profile.idNumber} />

              {profile.middleFields.length > 0 && (
                <div
                  className={cn(
                    "grid grid-cols-1 gap-3",
                    profile.middleFields.length > 1 && "grid-cols-2"
                  )}
                >
                  {profile.middleFields.map((field) => (
                    <ReadOnlyField
                      key={field.label}
                      label={field.label}
                      value={field.value}
                    />
                  ))}
                </div>
              )}

              <ReadOnlyField
                label="Contact Number"
                value={profile.contactNumber}
              />
            </div>
          </section>

          {/* Change Password — submits through changePasswordAction. */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Change Password
            </h3>
            <form className="space-y-3" onSubmit={handleUpdatePassword}>
              <PasswordField
                id="oldPassword"
                label="Old Password"
                show={showOld}
                onToggle={() => setShowOld((v) => !v)}
                value={oldPassword}
                onChange={setOldPassword}
                autoComplete="current-password"
              />
              <PasswordField
                id="newPassword"
                label="New Password"
                show={showNew}
                onToggle={() => setShowNew((v) => !v)}
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirmPassword"
                label="Confirm New Password"
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />

              <Button
                type="submit"
                disabled={isUpdating}
                className="h-auto! w-full rounded-lg bg-green-700 py-2 text-gray-50 hover:bg-green-800"
              >
                {isUpdating ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-1 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Member since {formatLongDate(profile.memberSince, "Never")}</span>
          <span>
            Last password change: {formatLongDate(lastPasswordChangeAt, "Never")}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      <Input
        value={value || "—"}
        disabled
        readOnly
        className={cn(FIELD_FOCUS_RING_CLASSES, "h-auto! py-2", "disabled:opacity-100")}
      />
    </div>
  );
}

function PasswordField({
  id,
  label,
  show,
  onToggle,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className={cn(FIELD_FOCUS_RING_CLASSES, "h-auto! py-2 pr-10")}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-green-700 hover:text-green-800"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}