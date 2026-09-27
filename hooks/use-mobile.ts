// Real path: hooks/use-mobile.ts
//
// Replaces the shadcn-generated version, which called setState inside a
// useEffect (lint: react-hooks/set-state-in-effect). Same export
// (`useIsMobile`) and same 768px breakpoint, so callers such as the shadcn
// sidebar don't change. Built on useMediaQuery; false until the browser
// reports otherwise, exactly like the original's initial `undefined` → false.
import { useMediaQuery } from "@/hooks/use-media-query";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}