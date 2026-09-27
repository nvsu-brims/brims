"use client";

import * as React from "react";
import type { ReactNode } from "react";
import {
  Home,
  Boxes,
  ClipboardCheck,
  Package,
  History,
  Users,
  UserCheck,
  ClipboardList,
} from "lucide-react";
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
import { getAdminLabel, isSuperAdmin, OFFICE_LABELS } from "@/lib/roles";
import { PENDING_COUNTS_CHANGED_EVENT } from "@/lib/pending-counts";
import type { SessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// Admin dashboard layout. Session comes from GET /api/me (reads the JWT
// cookie server-side and returns the user fields as JSON) — same pattern
// as the pending-count fetches already used here.
// ---------------------------------------------------------------------------

function buildAdminNavItems(
  office: SessionUser["office"] | undefined,
  pendingSignUpCount: number,
  pendingRequestCount: number,
  borrowedItemsCount: number
): DashboardNavItem[] {
  const superAdmin = isSuperAdmin(office);

  return [
    { kind: "link", href: "/admin", label: "Home", icon: Home },
    {
      kind: "link",
      href: "/admin/items",
      label: "Inventory Management",
      icon: Boxes,
    },
    {
      kind: "link",
      href: "/admin/requests",
      label: "Borrower Requests",
      icon: ClipboardCheck,
      badge: pendingRequestCount || undefined,
    },
    {
      kind: "link",
      href: "/admin/borrowed-items",
      label: "Borrowed Items",
      icon: Package,
      badge: borrowedItemsCount || undefined,
    },
    {
      kind: "link",
      href: "/admin/history",
      label: "Borrower History",
      icon: History,
    },
    ...(superAdmin
      ? ([
          {
            kind: "link",
            href: "/admin/users",
            label: "User Management",
            icon: Users,
          },
          {
            kind: "link",
            href: "/admin/sign-up-requests",
            label: "Sign-Up Requests",
            icon: UserCheck,
            badge: pendingSignUpCount || undefined,
          },
        ] satisfies DashboardNavItem[])
      : []),
    {
      kind: "link",
      href: "/admin/logs",
      label: "Activity Logs",
      icon: ClipboardList,
    },
  ];
}

const ADMIN_PROFILE_FALLBACK: DashboardProfileInfo = {
  firstName: "Admin",
  lastName: "User",
  idNumber: "—",
  email: "—",
  contactNumber: "—",
  middleFields: [],
  memberSince: "—",
  lastPasswordChangeAt: null,
};

function buildAdminProfile(
  user: SessionUser | null,
  lastPasswordChangeAt: string | null
): DashboardProfileInfo {
  if (!user) return ADMIN_PROFILE_FALLBACK;

  return {
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: getAdminLabel(user.office),
    idNumber: user.idNumber,
    email: user.email ?? "—",
    contactNumber: user.contactNumber ?? "—",
    middleFields: user.office
      ? [{ label: "Office", value: OFFICE_LABELS[user.office] }]
      : [],
    memberSince: user.createdAt,
    lastPasswordChangeAt,
  };
}

export default function AdminDashboardLayout({
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
  // server-side). No sensitive data exposure — the endpoint only returns
  // what the session cookie already holds, plus the signed-in user's own last
  // password change date (read from the activity log) for the profile
  // dialog's footer.
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

  const adminProfile = buildAdminProfile(sessionUser, lastPasswordChangeAt);

  // A shared event, dispatched by any component after a Server Action that
  // changes pending counts (approve/reject a borrow request, approve/reject
  // a sign-up) succeeds. router.refresh() re-renders the current route's
  // server components (so the table's own rows update via revalidatePath),
  // but it does NOT re-run this layout's effects or touch pathname — so
  // without this event, the sidebar badge only caught up on the next full
  // navigation. See lib/pending-counts.ts.
  const [pendingSignUpCount, setPendingSignUpCount] = useState(0);
  const refetchSignUpCount = React.useCallback(() => {
    if (!isSuperAdmin(sessionUser?.office)) return;
    fetch("/api/pending-sign-ups-count")
      .then((res) => res.json())
      .then((data) => setPendingSignUpCount(data.count ?? 0))
      .catch(() => setPendingSignUpCount(0));
  }, [sessionUser?.office]);

  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const refetchRequestCount = React.useCallback(() => {
    if (!sessionUser) return;
    fetch("/api/pending-requests-count")
      .then((res) => res.json())
      .then((data) => setPendingRequestCount(data.count ?? 0))
      .catch(() => setPendingRequestCount(0));
  }, [sessionUser]);

  const [borrowedItemsCount, setBorrowedItemsCount] = useState(0);
  const refetchBorrowedItemsCount = React.useCallback(() => {
    if (!sessionUser) return;
    fetch("/api/borrowed-items-count")
      .then((res) => res.json())
      .then((data) => setBorrowedItemsCount(data.count ?? 0))
      .catch(() => setBorrowedItemsCount(0));
  }, [sessionUser]);

  useEffect(() => {
    refetchSignUpCount();
  }, [refetchSignUpCount]);

  useEffect(() => {
    refetchRequestCount();
  }, [refetchRequestCount, pathname]);

  useEffect(() => {
    refetchBorrowedItemsCount();
  }, [refetchBorrowedItemsCount, pathname]);

  useEffect(() => {
    const handler = () => {
      refetchSignUpCount();
      refetchRequestCount();
      refetchBorrowedItemsCount();
    };
    window.addEventListener(PENDING_COUNTS_CHANGED_EVENT, handler);
    return () =>
      window.removeEventListener(PENDING_COUNTS_CHANGED_EVENT, handler);
  }, [refetchSignUpCount, refetchRequestCount, refetchBorrowedItemsCount]);

  const adminNavItems = React.useMemo(
    () =>
      buildAdminNavItems(
        sessionUser?.office,
        pendingSignUpCount,
        pendingRequestCount,
        borrowedItemsCount
      ),
    [
      sessionUser?.office,
      pendingSignUpCount,
      pendingRequestCount,
      borrowedItemsCount,
    ]
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
          navItems={adminNavItems}
          brandHref="/admin"
          profile={adminProfile}
          onSignOut={handleSignOut}
        />
      </SidebarProvider>
      <div className="flex min-h-dvh flex-1 flex-col">
        <DashboardHeader
          navItems={adminNavItems}
          brandHref="/admin"
          profile={adminProfile}
          onSignOut={handleSignOut}
        />
        <main className="flex flex-1 flex-col p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}