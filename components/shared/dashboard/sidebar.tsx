"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  LogOut,
  PanelLeft,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ConfirmDialog } from "./confirm-dialog";
import {
  ProfileDialog,
  type DashboardProfileInfo,
} from "./profile-dialog";

// ---------------------------------------------------------------------------
// Desktop sidebar shared by both dashboards (dashboard/admin, dashboard/
// borrower) — per the layout decision to use a sidebar everywhere inside
// dashboard/ rather than admin-sidebar/borrower-navbar, ported from
// dashboard_header.php's `$navLayout === 'sidebar'` branch (previously
// admin-only in the PHP app).
//
// Built on shadcn/ui's actual Sidebar primitives (components/ui/sidebar.tsx
// — SidebarProvider/Sidebar/SidebarHeader/SidebarContent/SidebarMenu/
// SidebarMenuButton/SidebarFooter/useSidebar) rather than a hand-rolled
// <aside>. `collapsible="icon"` gives the collapse-to-icons behavior;
// SidebarMenuButton's `tooltip` prop shows the icon-only tooltip
// automatically (no manual Tooltip wrapping needed anymore).
// `<SidebarProvider>` is expected to already wrap this component from
// dashboard/{admin,borrower}/layout.tsx per shadcn's usage pattern — this
// file assumes that provider is in place and only renders what goes inside
// it. Green/gray-50 theme applied directly on the primitives (not through
// the --sidebar-* CSS vars) to match the rest of this app's styling
// approach.
//
// Each dashboard's layout.tsx owns its own `navItems` list (different
// items, different badges, different office-scoping rules per Migration
// Plan) and passes it in here — this component only renders, it doesn't
// decide what belongs in the list. Profile and Sign Out are NOT part of
// navItems anymore — they live in the footer's avatar dropdown instead,
// so layouts should pass `profile` + `onSignOut` separately rather than
// adding them back to navItems. Profile opens ProfileDialog (see
// profile-dialog.tsx) instead of navigating — there's no
// app/(dashboard)/{admin,borrower}/profile/page.tsx anymore.
//
// Real <Link> routes replace dashboard-nav.js's showSection()/hidden-div
// toggling, since every nav item is now a real Next.js route rather than a
// section within one page. Active state comes from usePathname() instead
// of a client-side "current section" state var.
//
// TODO: collapsed state is local-only (React state, via SidebarProvider's
// internal state / cookie) for now — same open question as before: the
// original PHP resolved $sidebarCollapsed server-side from a cookie so
// there was no flash of the wrong state on refresh. shadcn's
// SidebarProvider does persist to a cookie client-side already, which
// narrows this gap, but full SSR-correct initial state still needs the
// dashboard layouts to be real Server Components reading that cookie.
//
// TODO: mobile gets its own top bar + Sheet nav, not this component — see
// components/shared/dashboard/header.tsx.
// ---------------------------------------------------------------------------

export type DashboardNavItem =
  | {
      kind: "link";
      href: string;
      label: string;
      icon: LucideIcon;
      /** Sidebar-only badge count. Omit/0 renders no badge at all, same as
       *  dashboard_header.php's sidebar branch (`empty(!$navItem['badge'])`). */
      badge?: number;
    }
  | {
      kind: "action";
      label: string;
      icon: LucideIcon;
      onClick: () => void;
    };

interface DashboardSidebarProps {
  brandTitle?: string;
  brandHref: string;
  navItems: DashboardNavItem[];
  profile: DashboardProfileInfo;
  onSignOut: () => void | Promise<void>;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function DashboardSidebar({
  brandTitle = "NVSU-BRIMS",
  brandHref,
  navItems,
  profile,
  onSignOut,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  // The footer shows profile.displayName when set (admins: "Super Admin" /
  // "SDO Admin" / "UCAO Admin"); otherwise the real full name.
  const fullName =
    profile.displayName ?? `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <Sidebar
      collapsible="icon"
      className="border-gray-50/50 bg-green-700 text-gray-50 **:data-[slot=sidebar-container]:bg-green-700 **:data-[slot=sidebar-inner]:border-gray-50/50! **:data-[slot=sidebar-inner]:bg-green-700!"
    >
      <SidebarHeader
        className={cn(
          "flex-row items-center border-b border-gray-50/50 px-4 py-4",
          collapsed ? "justify-center" : "justify-between gap-2"
        )}
      >
        {!collapsed && (
          <Link
            href={brandHref}
            className="truncate text-lg font-semibold text-gray-50"
          >
            {brandTitle}
          </Link>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-gray-50"
        >
          <PanelLeft className="size-4" />
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-1 overflow-y-auto p-3">
        <SidebarMenu className="gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.kind === "action") {
              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    onClick={item.onClick}
                    tooltip={{
                      children: item.label,
                      className:
                        "border-none bg-green-600 text-gray-50 [&_.fill-foreground]:bg-green-600! [&_.fill-foreground]:fill-green-600!",
                    }}
                    className="text-white/85 hover:bg-white/10 hover:text-gray-50 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }

            const isActive = pathname === item.href;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={{
                    children: item.badge
                      ? `${item.label} (${item.badge})`
                      : item.label,
                    className:
                      "border-none bg-green-600 text-gray-50 [&_.fill-foreground]:bg-green-600! [&_.fill-foreground]:fill-green-600!",
                  }}
                  className={cn(
                    "text-white/85 hover:bg-white/10 hover:text-gray-50 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!",
                  )}
                >
                  <Link href={item.href}>
                    <Icon className="size-5 shrink-0" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
                {!collapsed && item.badge ? (
                  <SidebarMenuBadge className="min-w-5 justify-center rounded-full bg-gray-50 px-1.5 text-green-800 peer-data-[active=true]/menu-button:bg-gray-100 peer-data-[active=true]/menu-button:text-green-800">
                    {item.badge > 99 ? "99+" : item.badge}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer — avatar dropdown replacing the old Profile/Sign Out nav
          rows. `profile` is built from the session by each dashboard's
          layout.tsx. */}
      <SidebarFooter className="border-t border-gray-50/50 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={{
                    children: fullName,
                    className:
                      "border-none bg-green-600 text-gray-50 [&_.fill-foreground]:bg-green-600! [&_.fill-foreground]:fill-green-600!",
                  }}
                  className="text-gray-50 hover:bg-white/10 hover:text-gray-50 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-gray-50 text-sm font-semibold text-green-800">
                      {getInitials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-gray-50">
                          {fullName}
                        </p>
                        <p className="truncate text-xs text-white/70">
                          {profile.email}
                        </p>
                      </div>
                      <ChevronsUpDown className="size-4 shrink-0 text-white/70" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <div className="truncate px-2 py-1.5 text-sm font-normal text-muted-foreground">
                  {profile.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <UserRound className="mr-2 size-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSignOutOpen(true)}
                  className="text-red-600 focus:text-red-600"
                >
                  <LogOut className="mr-2 size-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

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
    </Sidebar>
  );
}