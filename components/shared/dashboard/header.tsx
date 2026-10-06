"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "./confirm-dialog";
import type { DashboardNavItem } from "./sidebar";
import { ProfileDialog, type DashboardProfileInfo } from "./profile-dialog";

// ---------------------------------------------------------------------------
// Mobile-only top bar + offcanvas Sheet nav — companion to sidebar.tsx,
// shown below md while the sidebar is hidden (sidebar.tsx is `hidden
// md:flex`). Ports dashboard_header.php's sidebar-mode mobile branch
// (topbar + offcanvas) — now shared by both dashboards per the layout
// decision to use a sidebar everywhere inside dashboard/, rather than
// admin-only.
//
// Same DashboardNavItem list as the desktop sidebar (sections only —
// Profile/Sign Out are NOT in navItems, see sidebar.tsx's comment) — this
// component doesn't decide what belongs in the nav, it just renders it.
// The footer below mirrors the sidebar's avatar dropdown, but as plain
// rows instead of a nested dropdown, since there's no collapsed state to
// economize for here and a popover-inside-a-Sheet is an awkward stack on
// touch. Profile opens ProfileDialog instead of navigating — there's no
// app/(dashboard)/{admin,borrower}/profile/page.tsx anymore.
// ---------------------------------------------------------------------------

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

interface DashboardHeaderProps {
  brandTitle?: string;
  brandHref: string;
  navItems: DashboardNavItem[];
  profile: DashboardProfileInfo;
  onSignOut: () => void | Promise<void>;
}

export function DashboardHeader({
  brandTitle = "NVSU-BRIMS",
  brandHref,
  navItems,
  profile,
  onSignOut,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  // The footer shows profile.displayName when set (admins: "Super Admin" /
  // "SDO Admin" / "UCAO Admin"); otherwise the real full name.
  const fullName =
    profile.displayName ?? `${profile.firstName} ${profile.lastName}`.trim();

  // Publishes this header's real rendered height as --dashboard-header-height
  // on the root element, the same pattern app/(public)/layout.tsx uses for
  // --header-height. Dashboard sticky filter bars (admin/borrower tables)
  // read this var to sit flush below the header instead of guessing a fixed
  // top offset. This header is md:hidden (see file comment — sidebar.tsx
  // takes over at md+), so the var is reset to "0px" whenever the header
  // itself isn't rendered/visible, letting consumers safely write
  // var(--dashboard-header-height, 0px) without a stale mobile value
  // leaking into the desktop sidebar layout.
  const headerRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const node = headerRef.current;
    const root = document.documentElement;

    if (!node) return;

    function setHeightVar() {
      // getComputedStyle handles the md:hidden case: a display:none header
      // reports height 0, which is exactly the "no offset needed" value.
      const height =
        node && getComputedStyle(node).display !== "none"
          ? node.getBoundingClientRect().height
          : 0;
      root.style.setProperty("--dashboard-header-height", `${height}px`);
    }

    setHeightVar();

    const observer = new ResizeObserver(setHeightVar);
    observer.observe(node);

    // display:none doesn't fire ResizeObserver, so the md breakpoint
    // crossing (header appearing/disappearing) needs its own listener.
    const mql = window.matchMedia("(min-width: 768px)");
    mql.addEventListener("change", setHeightVar);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", setHeightVar);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-green-700 px-4 py-3 md:hidden"
    >
      <Link
        href={brandHref}
        className="truncate text-lg font-semibold text-gray-50"
      >
        {brandTitle}
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "text-gray-50 hover:bg-white/10 hover:text-gray-50"
          )}
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-full! max-w-full! border-none bg-green-700 p-0 text-gray-50"
        >
          <SheetHeader className="border-b border-white/10">
            <SheetTitle className="text-lg font-semibold text-gray-50">
              {brandTitle}
            </SheetTitle>
          </SheetHeader>

          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;

              if (item.kind === "action") {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/85 hover:bg-white/10 hover:text-gray-50"
                  >
                    <Icon className="size-5 shrink-0" />
                    {item.label}
                  </button>
                );
              }

              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-white/15 text-gray-50"
                      : "text-white/85 hover:bg-white/10 hover:text-gray-50"
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-green-800">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {/* Profile/Sign Out stay in the same list as the sections
                above, directly after the last nav item (e.g. Activity
                Logs / Borrow History) — not split into the footer below. */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setProfileOpen(true);
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/85 hover:bg-white/10 hover:text-gray-50"
            >
              <UserRound className="size-5 shrink-0" />
              Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSignOutOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-100 hover:bg-red-500/20 hover:text-gray-50"
            >
              <LogOut className="size-5 shrink-0" />
              Sign Out
            </button>
          </nav>

          {/* Footer — just the avatar/name/email, separated from the nav
              list above by a divider. Profile/Sign Out are NOT here; they
              live in the nav list itself (see above). */}
          <div className="mt-auto flex items-center gap-3 border-t border-white/10 p-4">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-gray-50 text-sm font-semibold text-green-800">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-50">
                {fullName}
              </p>
              <p className="truncate text-xs text-white/70">
                {profile.email}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
      />

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Confirm Sign Out"
        description="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        variant="danger"
        onConfirm={onSignOut}
      />
    </header>
  );
}