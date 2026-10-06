"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Shared across every (public) page — Home, Items & Equipment, About Us,
// FAQs, Sign In, Sign Up, Sign Out — replacing the near-identical header
// markup that index.php and sign_in.php/sign_up.php/sign_out.php each
// hand-rolled separately in the PHP app.
const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/items-equipment", label: "Items & Equipment" },
  { href: "/about", label: "About Us" },
  { href: "/faqs", label: "FAQs" },
] as const;

function NavLink({
  href,
  label,
  mobile = false,
  onNavigate,
}: {
  href: string;
  label: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "text-white/85 transition-colors hover:text-gray-50",
        mobile
          ? "rounded-md px-3 py-2 text-base font-medium"
          : "text-sm font-medium",
        isActive && "text-gray-50",
        isActive && !mobile && "underline underline-offset-4",
        isActive && mobile && "bg-white/10"
      )}
    >
      {label}
    </Link>
  );
}

function AuthButtons({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-2", mobile && "mt-2 flex-col")}>
      <Link
        href="/sign-up"
        onClick={onNavigate}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "border-white/70 bg-transparent px-3 py-1 text-gray-50 hover:bg-gray-50 hover:text-green-700",
          mobile && "w-full"
        )}
      >
        Sign Up
      </Link>
      <Link
        href="/sign-in"
        onClick={onNavigate}
        className={cn(
          buttonVariants(),
          "bg-gray-50 px-3 py-1 text-green-700 hover:bg-gray-50/90",
          mobile && "w-full"
        )}
      >
        Sign In
      </Link>
    </div>
  );
}

function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const headerRef = React.useRef<HTMLElement>(null);

  // Sets --header-height to the header's real rendered height, same intent
  // as index.php's setHeaderHeightVar() — anything that needs to sit flush
  // below the sticky header (e.g. the items-equipment filter bar) reads
  // this instead of guessing a pixel value that can drift out of sync with
  // the header's actual size.
  React.useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const setHeaderHeightVar = () => {
      document.documentElement.style.setProperty(
        "--header-height",
        `${header.offsetHeight}px`
      );
    };

    setHeaderHeightVar();
    window.addEventListener("resize", setHeaderHeightVar);
    return () => window.removeEventListener("resize", setHeaderHeightVar);
  }, []);

  return (
    <header
      ref={headerRef}
      id="siteHeader"
      // Flush with the page body (also green-700) — shadow-md provides the
      // visual separation instead of a color difference, since the header
      // no longer stands out as a distinct shade.
      className="sticky top-0 z-50 py-3 shadow-md bg-green-700"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-3">
          <h2 className="fs-fluid-brand mb-0 text-lg font-semibold text-gray-50">
            NVSU-BRIMS
          </h2>
        </Link>

        {/* Desktop nav — md and up */}
        <nav className="hidden flex-wrap items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <AuthButtons />
        </nav>

        {/* Mobile menu — below md */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-11 text-gray-50 hover:bg-white/10 hover:text-gray-50 md:hidden"
            )}
            aria-label="Open menu"
          >
            <Menu className="size-6" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-full! max-w-full! border-none bg-green-700 p-0"
          >
            <SheetHeader className="shadow-sm">
              <SheetTitle className="fs-fluid-brand text-lg font-semibold text-gray-50">
                NVSU-BRIMS
              </SheetTitle>
            </SheetHeader>

            <nav className="flex flex-col gap-1 p-4">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  mobile
                  onNavigate={() => setOpen(false)}
                />
              ))}
              <AuthButtons mobile onNavigate={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}