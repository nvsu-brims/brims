"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ID_NUMBER_LENGTH,
  ID_NUMBER_PLACEHOLDER,
  formatIdNumber,
} from "@/lib/id-number";
import { signInAction, type SignInState } from "./actions";

// ---------------------------------------------------------------------------
// Wired to signInAction (./actions.ts): it checks the credentials against the
// users table (bcrypt hash; approved, not deactivated), then redirects by role
// and admin type (super / SDO / UCAO -> /admin, borrower -> /borrower — see
// lib/roles.ts). Every failure shows the PHP's single generic error, so
// nothing reveals which accounts exist.
//
// A redirect from the route guard (proxy.ts) arrives as
// `?reason=signin-required` and shows the PHP's flash text, "Please sign in
// to continue." (sign_in.php's `sign_in_flash`) in the same alert. Add any
// other one-time notice to SIGN_IN_NOTICES below.
//
// Still TODO (see MIGRATION_PLAN.md §8, §11 step 2):
// - Protected pages must be dynamic / no-store so the back button after
//   sign-out can't show cached content (sign_in.php reloads on bfcache
//   restore).
// - CSRF: Server Actions get same-origin protection for free, so there is no
//   manual csrf_token field (unlike the PHP version's hidden input).
// - Consider react-hook-form + zod for client-side validation.
// ---------------------------------------------------------------------------

// One-time notices shown above the form, keyed by the `reason` query param.
const SIGN_IN_NOTICES: Record<string, string> = {
  "signin-required": "Please sign in to continue.",
};

function SignInForm() {
  const [showPassword, setShowPassword] = React.useState(false);
  // The User ID field is controlled. It used to be uncontrolled with
  // `defaultValue={state.idNumber}` (the action echoed the ID back after a
  // failed attempt), and changing an uncontrolled field's default value after
  // mount makes Base UI's FieldControl log "changing the default value state
  // of an uncontrolled FieldControl". Held in state, the field keeps what the
  // user typed with nothing to sync. The password field stays uncontrolled on
  // purpose: React resets it after every submit, so it comes back empty, as in
  // the PHP (which never repopulated passwords).
  const [idNumber, setIdNumber] = React.useState("");

  const [state, formAction, pending] = React.useActionState<
    SignInState,
    FormData
  >(signInAction, { error: null, idNumber: "" });
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = SIGN_IN_NOTICES[searchParams.get("reason") ?? ""] ?? null;
  // A failed attempt's error replaces the notice, like the PHP's $error.
  const error = state.error ?? notice;

  // The action doesn't redirect itself (it just returns the target path) —
  // navigate here once a sign-in succeeds. `replace`, not `push`, so the
  // sign-in page isn't left in the history: Back after signing in would only
  // return here and get bounced to the dashboard again by proxy.ts.
  React.useEffect(() => {
    if (state.redirectTo) {
      router.replace(state.redirectTo);
    }
  }, [state.redirectTo, router]);

  return (
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

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-md md:p-10">
        <div className="mb-6 text-center">
          <h2 className="mb-1 text-2xl font-semibold text-gray-50">
            Sign In
          </h2>
          <p className="mb-0 text-sm text-white/70">
            Enter your account details to continue
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300/30 bg-red-500/20 px-3 py-2 text-sm text-red-100"
          >
            {error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id" className="font-semibold text-gray-50">
              User ID
            </Label>
            <Input
              id="id"
              name="id"
              type="text"
              value={idNumber}
              onChange={(event) =>
                setIdNumber(formatIdNumber(event.target.value))
              }
              placeholder={ID_NUMBER_PLACEHOLDER}
              inputMode="numeric"
              autoComplete="username"
              maxLength={ID_NUMBER_LENGTH}
              required
              className="rounded-md! border-white/30 bg-black/20 text-gray-50 placeholder:text-white/80 focus-visible:border-gray-50 focus-visible:ring-white/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pass" className="font-semibold text-gray-50">
              Password
            </Label>
            <div className="relative">
              <Input
                id="pass"
                name="pass"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                required
                className="rounded-md! border-white/30 bg-black/20 pr-11 text-gray-50 placeholder:text-white/80 focus-visible:border-gray-50 focus-visible:ring-white/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/70 hover:text-gray-50"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="mt-2 w-full rounded-lg bg-gray-50 font-semibold text-green-700 hover:bg-gray-50/90"
          >
            {pending ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <footer className="mt-6 text-center">
          <p className="mb-0 text-sm text-white/70">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "link" }),
                "h-auto px-0 py-2 text-sm font-semibold text-gray-50 underline underline-offset-4 hover:text-white/80"
              )}
            >
              Sign Up here
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

// useSearchParams() needs a Suspense boundary when the page is prerendered.
export default function SignInPage() {
  return (
    <React.Suspense fallback={null}>
      <SignInForm />
    </React.Suspense>
  );
}