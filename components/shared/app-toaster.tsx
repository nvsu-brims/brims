"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Toaster as SonnerToaster } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";

// Sonner positions its close button with inline styles (position/top/right/
// left/transform), which no amount of Tailwind classes — even with `!` —
// can override, since inline styles always win over stylesheet rules of
// equal or lower specificity. This is the one part of the toast that needs
// a plain CSS override with `!important` instead of toastOptions.classNames.
const CLOSE_BUTTON_OVERRIDE = `
  [data-sonner-toast] [data-close-button] {
    position: static !important;
    inset: auto !important;
    top: auto !important;
    right: auto !important;
    left: auto !important;
    bottom: auto !important;
    transform: none !important;
    margin: 0 0 0 0.25rem !important;
    order: 9999 !important;
  }
`;

// ---------------------------------------------------------------------------
// App-wide toast host, mounted once in app/layout.tsx.
//
// Position is responsive: small screens get a full-width-feeling top-center
// toast (matches the single-column layout the borrower catalog/requests
// pages collapse to on mobile); md and up get the more conventional
// dashboard placement, top-right, so it never sits over page content that's
// centered on desktop.
//
// Branding: sonner's own CSS-variable API (see
// https://sonner.emilkowal.ski/styling) is themed here to the app's
// existing status palette (green success / red error / neutral slate
// default), instead of sonner's stock colors. `richColors` is intentionally
// OFF — richColors overrides these custom toastOptions classNames with its
// own palette, so hand-rolled branding and richColors don't mix.
//
// Layout: no status icon (the tinted background alone carries success/
// error/etc), text-xs, left-aligned, with the close button pushed to the
// far right via justify-between on the toast row. Message text should
// stay short (a few words) so it fits on one line — see the
// toast.success/toast.error call sites in the borrower catalog/requests
// views.
//
// Close button: swapped for a custom lucide X (sonner's own default close
// icon can't be resized past its built-in svg via classNames alone).
// Sonner also *positions* the button with inline styles, which classNames
// can never beat (see CLOSE_BUTTON_OVERRIDE above) — once freed from that
// absolute corner position, it takes its place in the toast's normal flex
// row, after the message. The toast itself shrinks to its content width
// (`w-auto max-w-*`) instead of sonner's default fixed width, so the row
// stays a single line.
//
// Every toast auto-dismisses after 3s (`duration={3000}`) and always shows
// the close button so a borrower doesn't have to wait out the timer to
// dismiss a notice they've already read.
// ---------------------------------------------------------------------------

const MOBILE_QUERY = "(min-width: 768px)";

export function AppToaster() {
  const isDesktop = useMediaQuery(MOBILE_QUERY);

  return (
    <>
      <style>{CLOSE_BUTTON_OVERRIDE}</style>
      <SonnerToaster
        position={isDesktop ? "top-right" : "top-center"}
        duration={3000}
        icons={{
          close: <X className="size-4" />,
        }}
        closeButton
        gap={10}
        toastOptions={{
          classNames: {
            toast:
              "relative! w-auto! max-w-[calc(100vw-2rem)]! sm:max-w-xs! rounded-lg! border! shadow-lg! font-sans! flex! flex-row! items-center! justify-between! px-2! py-2! gap-2.5!",
            content: "flex-1! min-w-0! text-left!",
            title: "text-xs! pl-3! text-left!",
            description: "text-xs! text-left!",
            icon: "hidden!",
            closeButton:
              "shrink-0! size-6! flex! items-center! justify-center! border-0! bg-transparent! text-inherit! opacity-60! hover:opacity-100!",
            default: "bg-white! border-slate-200! text-slate-900!",
            success: "bg-green-50! border-green-200! text-green-800!",
            error: "bg-red-50! border-red-200! text-red-700!",
            info: "bg-blue-50! border-blue-200! text-blue-700!",
            warning: "bg-amber-50! border-amber-200! text-amber-800!",
          },
        }}
      />
    </>
  );
}