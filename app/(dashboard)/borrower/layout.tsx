"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { Home, LayoutGrid, Hourglass, Package, History } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DashboardSidebar,
  type DashboardNavItem,
} from "@/components/shared/dashboard/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from "@/components/shared/dashboard/header";
import type { DashboardProfileInfo } from "@/components/shared/dashboard/profile-dialog";
import { signOutAction } from "@/app/(public)/sign-out/actions";
import type { SessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// Borrower dashboard layout. Session comes from GET /api/me (reads the JWT
// cookie server-side and returns the user fields as JSON). Replaces the
// buildBorrowerProfile(undefined) stub that was never wired to a real session.
// ---------------------------------------------------------------------------

function buildBorrowerNavItems(
  borrowedItemsCount: number
): DashboardNavItem[] {
  return [
    { kind: "link", href: "/borrower", label: "Home", icon: Home },
    {
      kind: "link",
      href: "/borrower/catalog",
      label: "Borrow Items",
      icon: LayoutGrid,
    },
    {
      kind: "link",
      href: "/borrower/requests",
      label: "Borrow Requests",
      icon: Hourglass,
    },
    {
      kind: "link",
      href: "/borrower/borrowed-items",
      label: "Borrowed Items",
      icon: Package,
      badge: borrowedItemsCount || undefined,
    },
    {
      kind: "link",
      href: "/borrower/history",
      label: "Borrow History",
      icon: History,
    },
  ];
}

const BORROWER_PROFILE_FALLBACK: DashboardProfileInfo = {
  firstName: "Borrower",
  lastName: "User",
  idNumber: "—",
  email: "—",
  contactNumber: "—",
  middleFields: [
    { label: "College", value: "—" },
    { label: "Organization Name", value: "—" },
  ],
  memberSince: "—",
  lastPasswordChangeAt: null,
};

function buildBorrowerProfile(
  user: SessionUser | null,
  lastPasswordChangeAt: string | null
): DashboardProfileInfo {
  if (!user) return BORROWER_PROFILE_FALLBACK;

  return {
    firstName: user.firstName,
    lastName: user.lastName,
    idNumber: user.idNumber,
    email: user.email ?? "—",
    contactNumber: user.contactNumber ?? "—",
    middleFields: [
      { label: "College", value: user.college ?? "—" },
      { label: "Organization Name", value: user.organization ?? "—" },
    ],
    memberSince: user.createdAt,
    lastPasswordChangeAt,
  };
}

export default function BorrowerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [lastPasswordChangeAt, setLastPasswordChangeAt] = useState<
    string | null
  >(null);
  const pathname = usePathname();
  const router = useRouter();

  // Fetch session user once on mount from /api/me (reads the JWT cookie
  // server-side). Falls back to the placeholder profile until resolved. The
  // same response carries the last password change date (read from the
  // activity log) for the profile dialog's footer.
  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        setSessionUser(data.user ?? null);
        setLastPasswordChangeAt(data.lastPasswordChangeAt ?? null);
      })
      .catch(() => {
        setSessionUser(null);
        setLastPasswordChangeAt(null);
      });
  }, []);

  const borrowerProfile = buildBorrowerProfile(
    sessionUser,
    lastPasswordChangeAt
  );

  // Backs the "Borrowed Items" sidebar badge — refetched on mount and on
  // every pathname change (so returning from e.g. Borrow Requests picks up
  // a newly-approved item). Unlike admin-layout.tsx's badge counts, this
  // one can't also listen for the shared pending-counts event: that event
  // is same-tab only, and the only actions that change this count (an
  // admin approving a request or marking an item returned) happen in the
  // admin's own browser tab, not the borrower's — see BUGS.md BUG-27.
  const [borrowedItemsCount, setBorrowedItemsCount] = useState(0);
  const refetchBorrowedItemsCount = React.useCallback(() => {
    if (!sessionUser) return;
    fetch("/api/borrower-borrowed-items-count")
      .then((res) => res.json())
      .then((data) => setBorrowedItemsCount(data.count ?? 0))
      .catch(() => setBorrowedItemsCount(0));
  }, [sessionUser]);

  useEffect(() => {
    refetchBorrowedItemsCount();
  }, [refetchBorrowedItemsCount, pathname]);

  const borrowerNavItems = React.useMemo(
    () => buildBorrowerNavItems(borrowedItemsCount),
    [borrowedItemsCount]
  );

  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return; // ignore double-clicks on the confirm button
    setSigningOut(true);
    try {
      const result = await signOutAction();
      if (!result.ok) {
        // The server could not clear the session cookie, so the user is still
        // signed in. Stay on the page and say so, instead of navigating away.
        toast.error("Couldn't sign out. Please try again.");
        setSigningOut(false);
        return;
      }
      // Only clear client state once the server has cleared the session cookie.
      // BRIMS stores nothing in localStorage or sessionStorage, and .clear()
      // would wipe every key on the origin (other apps sharing it, e.g. other
      // projects on localhost), so only the sidebar's own cookie is removed.
      document.cookie = "sidebar_state=; path=/; max-age=0";
      router.replace(result.redirectTo);
    } catch {
      // The request itself failed. Stay signed in and tell the user, so the
      // dialog doesn't just appear to do nothing.
      toast.error("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <SidebarProvider
        className="min-h-0 w-auto"
        style={{ "--sidebar-width-icon": "76px" } as React.CSSProperties}
      >
        <DashboardSidebar
          navItems={borrowerNavItems}
          brandHref="/borrower"
          profile={borrowerProfile}
          onSignOut={handleSignOut}
        />
      </SidebarProvider>
      <div className="flex min-h-dvh flex-1 flex-col">
        <DashboardHeader
          navItems={borrowerNavItems}
          brandHref="/borrower"
          profile={borrowerProfile}
          onSignOut={handleSignOut}
        />
        <main className="flex flex-1 flex-col p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}