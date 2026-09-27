// Same-tab event bus for the admin sidebar's pending-count badges.
//
// admin-layout.tsx refetches counts on mount and on `pathname` change, but an
// approve/reject Server Action on the same page doesn't change `pathname`, so
// the badge went stale until the next navigation. Call
// notifyPendingCountsChanged() after such an action resolves; admin-layout.tsx
// listens and refetches immediately.

export const PENDING_COUNTS_CHANGED_EVENT = "brims:pending-counts-changed";

export function notifyPendingCountsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PENDING_COUNTS_CHANGED_EVENT));
}