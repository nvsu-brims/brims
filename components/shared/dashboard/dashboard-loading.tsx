// Shared loading screen for the admin and borrower sections (components/shared/dashboard).
// Used by each section's loading.tsx, which Next.js shows while a page loads its data.
export function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
    >
      <div className="size-10 animate-spin rounded-full border-4 border-green-700/20 border-t-green-700" />
      <p className="text-sm font-medium text-slate-600">Loading…</p>
    </div>
  );
}