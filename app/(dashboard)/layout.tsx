import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Group layout for (dashboard). With the custom JWT session (lib/session.ts)
// there is no SessionProvider needed — each client layout (admin-layout.tsx,
// borrower-layout.tsx) fetches /api/me on mount independently. This file is
// now a clean pass-through; the real role guard is proxy.ts.
// ---------------------------------------------------------------------------
export default function DashboardGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}