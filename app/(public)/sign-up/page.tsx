"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLLEGES, getOrganizations } from "@/data/colleges";
import {
  ID_NUMBER_LENGTH,
  ID_NUMBER_PLACEHOLDER,
  formatIdNumber,
} from "@/lib/id-number";
import {
  CONTACT_NUMBER_LENGTH,
  CONTACT_NUMBER_PLACEHOLDER,
  CONTACT_NUMBER_PREFIX,
  formatContactNumber,
} from "@/lib/contact-number";
import { signUpAction, type SignUpState } from "./actions";

// ---------------------------------------------------------------------------
// Wired to signUpAction (./actions.ts): it validates everything on the server,
// hashes the password with bcrypt and writes a borrower with signUpStatus
// "pending". An admin approves or rejects it at /admin/sign-up-requests, and
// only then can the borrower sign in. A rejected sign-up can be resubmitted
// with the same ID number.
//
// Colleges and organizations come from data/colleges.ts (hardcoded on
// purpose, not a database table). The dropdowns show and submit CODES, which
// is exactly what the database stores; the action re-checks the pair with
// isValidCollegeOrganization().
//
// The text fields are controlled, so a failed attempt keeps what was typed.
// The password fields stay uncontrolled on purpose: React resets them after
// every submit, so they come back empty (the PHP never repopulated them).
//
// Still TODO: react-hook-form + zod for client-side validation, matching the
// shared Form component in MIGRATION_PLAN.md §7. The server-side checks above
// are the real ones either way.
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "rounded-md! border-white/30 bg-black/20 text-gray-50 placeholder:text-white/80 focus-visible:border-gray-50 focus-visible:ring-white/30";

const SELECT_TRIGGER_CLASS =
  "w-full rounded-md! border-white/30 bg-black/20 text-gray-50 focus-visible:border-gray-50 focus-visible:ring-white/30 disabled:opacity-75 [&>span]:text-white/80 [&_svg]:text-slate-50 [&_svg]:opacity-100 data-[state=open]:text-gray-50";

const LABEL_CLASS = "font-semibold text-gray-50";

const INITIAL_STATE: SignUpState = { status: "idle", message: null };

export default function SignUpPage() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [college, setCollege] = React.useState<string>("");
  const [organization, setOrganization] = React.useState<string>("");
  const [fields, setFields] = React.useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    email: "",
    // Pre-filled with "09 " so the borrower only types the remaining digits.
    contactNumber: CONTACT_NUMBER_PREFIX,
  });
  const [passwordsMismatch, setPasswordsMismatch] = React.useState(false);

  const [state, formAction, pending] = React.useActionState<
    SignUpState,
    FormData
  >(signUpAction, INITIAL_STATE);

  const organizationOptions = getOrganizations(college);

  function handleFieldChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  }

  // Format the ID number as "000-0000": the hyphen is inserted automatically
  // and anything that is not a digit (or is past the 7th digit) is dropped, so the field
  // can never hold "0000-0000" or "000000". See lib/id-number.ts.
  function handleIdNumberChange(event: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatIdNumber(event.target.value);
    setFields((current) => ({ ...current, idNumber: formatted }));
  }

  // Format the contact number as "09XX XXX XXXX" while keeping "09" locked.
  // Only the digits after "09" are user-editable; the prefix is always kept.
  // The rule lives in lib/contact-number.ts, shared with the admin forms and
  // the server actions.
  function handleContactNumberChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const formatted = formatContactNumber(event.target.value);
    setFields((current) => ({ ...current, contactNumber: formatted }));
  }

  // The password fields are uncontrolled, so read them from the form when
  // either one changes to show the mismatch hint while the user types.
  function handleFormChange(event: React.ChangeEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const password = String(data.get("pass") ?? "");
    const confirm = String(data.get("confirmPass") ?? "");
    setPasswordsMismatch(confirm !== "" && password !== confirm);
  }

  const shell = (children: React.ReactNode) => (
    <div
      className={cn(
        "relative flex flex-1 items-center justify-center overflow-hidden",
        "bg-green-700",
        "min-h-[calc(100dvh-64px)] px-4 py-8"
      )}
    >
      {/* Decorative circles — same treatment as the home page hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-16 hidden size-64 rounded-full bg-white/10 md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/2 hidden size-96 -translate-y-1/2 rounded-full bg-white/10 md:block"
      />
      {children}
    </div>
  );

  if (state.status === "success") {
    return shell(
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-white/10 p-6 text-center shadow-2xl backdrop-blur-md md:p-10">
        <CheckCircle2 className="mx-auto mb-3 size-12 text-gray-50" />
        <h2 className="mb-2 text-2xl font-semibold text-gray-50">
          Sign-up submitted
        </h2>
        <p className="mb-6 text-sm text-white/80">
          Your account is waiting for approval. Once an administrator approves
          it, you can sign in with your ID number and password.
        </p>
        <Link
          href="/sign-in"
          className={cn(
            buttonVariants(),
            "w-full rounded-lg bg-gray-50 font-semibold text-green-700 hover:bg-gray-50/90"
          )}
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  return shell(
    <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-md md:p-10">
      <div className="mb-6 text-center">
        <h2 className="mb-1 text-2xl font-semibold text-gray-50">Sign Up</h2>
        <p className="mb-0 text-sm text-white/70">
          Register a borrower account for your organization
        </p>
      </div>

      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300/30 bg-red-500/20 px-3 py-2 text-sm text-red-100"
        >
          {state.message}
        </div>
      )}

      <form
        action={formAction}
        onChange={handleFormChange}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName" className={LABEL_CLASS}>
              First Name
            </Label>
            <Input
              id="firstName"
              name="firstName"
              type="text"
              value={fields.firstName}
              onChange={handleFieldChange}
              placeholder="Juan"
              autoComplete="given-name"
              required
              maxLength={100}
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName" className={LABEL_CLASS}>
              Last Name
            </Label>
            <Input
              id="lastName"
              name="lastName"
              type="text"
              value={fields.lastName}
              onChange={handleFieldChange}
              placeholder="Dela Cruz"
              autoComplete="family-name"
              required
              maxLength={100}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="idNumber" className={LABEL_CLASS}>
            ID Number
          </Label>
          <Input
            id="idNumber"
            name="idNumber"
            type="text"
            value={fields.idNumber}
            onChange={handleIdNumberChange}
            placeholder={ID_NUMBER_PLACEHOLDER}
            autoComplete="username"
            inputMode="numeric"
            pattern="\d{3}-\d{4}"
            title="ID number must be in the format 000-0000"
            required
            maxLength={ID_NUMBER_LENGTH}
            className={INPUT_CLASS}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email" className={LABEL_CLASS}>
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={fields.email}
              onChange={handleFieldChange}
              placeholder="name@example.com"
              autoComplete="email"
              required
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactNumber" className={LABEL_CLASS}>
              Contact Number
            </Label>
            <Input
              id="contactNumber"
              name="contactNumber"
              type="tel"
              value={fields.contactNumber}
              onChange={handleContactNumberChange}
              // Prevent the borrower from deleting the locked "09" prefix.
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (
                  (e.key === "Backspace" || e.key === "Delete") &&
                  el.selectionStart !== null &&
                  el.selectionEnd !== null &&
                  el.selectionStart <= 2 &&
                  el.selectionEnd <= 2
                ) {
                  e.preventDefault();
                }
              }}
              placeholder={CONTACT_NUMBER_PLACEHOLDER}
              autoComplete="tel"
              inputMode="numeric"
              maxLength={CONTACT_NUMBER_LENGTH}
              pattern="09\d{2} \d{3} \d{4}"
              title="Contact number must be 11 digits starting with 09, like 0917 384 6215"
              required
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className={LABEL_CLASS}>College</Label>
            <Select
              value={college}
              onValueChange={(value) => {
                setCollege(value ?? "");
                setOrganization("");
              }}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Select college" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {COLLEGES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The Select isn't a native field, so submit its value explicitly. */}
            <input type="hidden" name="college" value={college} />
          </div>

          <div className="space-y-2">
            <Label className={LABEL_CLASS}>Organization</Label>
            <Select
              value={organization}
              onValueChange={(value) => setOrganization(value ?? "")}
              disabled={!college}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue
                  placeholder={
                    college ? "Select organization" : "Select a college first"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {organizationOptions.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="organization" value={organization} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pass" className={LABEL_CLASS}>
              Password
            </Label>
            <div className="relative">
              <Input
                id="pass"
                name="pass"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
                className={cn(INPUT_CLASS, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/70 hover:text-gray-50"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPass" className={LABEL_CLASS}>
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPass"
                name="confirmPass"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
                aria-invalid={passwordsMismatch}
                className={cn(INPUT_CLASS, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/70 hover:text-gray-50"
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {passwordsMismatch && (
              <p role="alert" className="mb-0 text-xs text-red-100">
                Passwords do not match.
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          disabled={pending || !college || !organization}
          className="mt-2 w-full rounded-lg bg-gray-50 font-semibold text-green-700 hover:bg-gray-50/90"
        >
          {pending ? "Submitting..." : "Sign Up"}
        </Button>
      </form>

      <footer className="mt-6 text-center">
        <p className="mb-0 text-sm text-white/70">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-auto p-0 text-sm font-semibold text-gray-50 underline underline-offset-4 hover:text-white/80"
            )}
          >
            Sign In here
          </Link>
        </p>
      </footer>
    </div>
  );
}