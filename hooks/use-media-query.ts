// Real path: hooks/use-media-query.ts
"use client";

import * as React from "react";

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 *
 * Built on useSyncExternalStore (the supported way to read an external,
 * browser-owned value) instead of `useEffect` + `setState`, which the React
 * lint rule `react-hooks/set-state-in-effect` rejects. The server snapshot is
 * always `false`, so the first client render matches the server HTML and
 * there is no hydration mismatch; if the query matches, the value flips to
 * `true` right after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}