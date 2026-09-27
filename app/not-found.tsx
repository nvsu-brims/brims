import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

// ---------------------------------------------------------------------------
// Global 404 page.
//
// Real path: app/not-found.tsx
//
// Why this exists (BUG-21): without it Next.js serves its bare default 404,
// which has no link anywhere. When /api/session-expired 404'd (its route file
// was missing from the repo), a user with a revoked session was left on that
// blank page with no way back except clearing the browser's cookies by hand.
//
// Any URL that matches no route now lands here, inside the root layout.
//
// "Back to home" always ends on the landing page ("/"), never on the last page
// the user was on, and it ends their session like the sign-out button does.
// It is a plain <form method="post"> to /api/back-to-home, which runs the
// existing signOutAction and redirects to "/". So a signed-in user who reaches
// a 404 and clicks the button IS signed out (on every device, because sign-out
// revokes the account's sessions). That is intended.
//
// A form and a route instead of a Server Action or a client onClick: an action
// posts to the URL the user is on, and on a 404 that URL matches no route.
// The route always matches and the form works without JavaScript.
//
// A Server Component with no hooks, so it needs no "use client".
// ---------------------------------------------------------------------------
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white">
        <EmptyState
          variant="no-data"
          icon={Compass}
          title="Page not found"
          description="The page you're looking for doesn't exist or may have been moved."
          action={
            <form action="/api/back-to-home" method="post">
              <Button
                type="submit"
                className="bg-green-700 px-6 text-white hover:bg-green-700/90"
              >
                Back to home
              </Button>
            </form>
          }
        />
      </div>
    </main>
  );
}