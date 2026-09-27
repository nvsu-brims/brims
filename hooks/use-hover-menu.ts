// Real path: hooks/use-hover-menu.ts
"use client";

import * as React from "react";

/**
 * Hover-to-open handlers for one dropdown, with a short delayed close that
 * is verified against the real cursor position before it actually closes.
 *
 * The dropdown menu (SelectContent) renders in a portal, so it isn't a DOM
 * child of the trigger wrapper — moving the cursor from the trigger into the
 * menu still fires the wrapper's onMouseLeave, which used to close the menu
 * out from under the cursor. Closing after 150ms (instead of instantly) gives
 * the menu's own onMouseEnter a chance to cancel the pending close.
 *
 * `enabled` should be true only on devices that can really hover (see
 * useMediaQuery); on touch devices the handlers do nothing and the dropdown
 * opens on tap.
 *
 * The pending-close timer lives in a ref INSIDE this hook and is only touched
 * in the event handlers, so no ref is passed around or read during render
 * (which the `react-hooks/refs` lint rule rejects).
 *
 * onMouseEnter/onMouseLeave are wrapped in useCallback (stable across
 * renders as long as `setOpen` and `enabled` don't change) rather than
 * returned as fresh closures every render. Without that, every setOpen()
 * call re-renders the parent, which re-invokes this hook and hands the
 * wrapper div and the portaled SelectContent brand-new onMouseEnter/
 * onMouseLeave function identities. React detaches and reattaches the DOM
 * listeners for both elements on every open/close, and SelectContent's
 * underlying Popper positioning can re-measure when its props change —
 * enough to shift the element under a stationary cursor and fire a
 * synthetic mouseleave/mouseenter pair, which calls setOpen again, which
 * repeats. That is a self-sustaining open/close/open/close loop that
 * doesn't need real mouse movement to keep going, and it reproduces on
 * every dropdown built from this hook (all six of the admin/public/
 * borrower filter bars) since they all share this file. Stable handler
 * identities mean React does not need to touch the listeners on every
 * state change, which breaks the loop at its source.
 *
 * That fixed the case where the LEAVE originates from a real cursor
 * movement crossing an unstable boundary. It does not cover a second,
 * separate case: the cursor sits fully still INSIDE the already-open
 * SelectContent (e.g. resting over an option), and the menu still
 * flickers. Radix's own internal item-highlight/positioning logic can
 * shift SelectContent's box by a sub-pixel amount under a genuinely
 * stationary cursor (its point-based collision handling re-measures
 * against the trigger's `--anchor-width` on internal state changes we
 * don't control), which makes the BROWSER fire a real native
 * mouseleave/mouseenter pair with no actual mouse movement involved.
 * `onMouseEnter`/`onMouseLeave` being stable doesn't help here, because
 * the leave event itself is genuine at the DOM level — cancelling on the
 * next enter (as before) still means the menu visibly blinks closed for
 * one frame before reopening.
 *
 * The fix: don't trust the leave event alone. When the close timer fires,
 * check the REAL cursor position (tracked on every mouseenter/mousemove
 * via clientX/clientY) against the actual current bounding boxes of the
 * trigger and content elements, via the refs returned below. If the
 * cursor is still geometrically inside either one, the close is a false
 * alarm from a phantom event and is skipped — the caller's `open` state
 * is left alone, so there is nothing to blink. This is verified against
 * live geometry at the moment of closing, not against which element most
 * recently fired an event, so it doesn't matter which internal Radix
 * mechanism caused the phantom leave.
 */
export function useHoverMenu(
  setOpen: (open: boolean) => void,
  enabled: boolean
) {
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Real DOM nodes for the trigger wrapper and the portaled content, set via
  // the ref callbacks returned below. Consumers attach these to the same
  // elements that already carry onMouseEnter/onMouseLeave. Refs (not state)
  // because they're only read inside the close-timer callback, never during
  // render.
  const triggerEl = React.useRef<HTMLElement | null>(null);
  const contentEl = React.useRef<HTMLElement | null>(null);
  // Last known real cursor position, updated on every enter/move over
  // either element. Used to check actual geometry when the close timer
  // fires, instead of trusting the leave event that scheduled it.
  const lastPoint = React.useRef<{ x: number; y: number } | null>(null);

  const setTriggerRef = React.useCallback((node: HTMLElement | null) => {
    triggerEl.current = node;
  }, []);

  const setContentRef = React.useCallback((node: HTMLElement | null) => {
    contentEl.current = node;
  }, []);

  const isPointInside = React.useCallback((el: HTMLElement | null) => {
    if (!el || !lastPoint.current) return false;
    const rect = el.getBoundingClientRect();
    const { x, y } = lastPoint.current;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  const onMouseEnter = React.useCallback(
    (e?: React.MouseEvent) => {
      if (!enabled) return;
      if (e) lastPoint.current = { x: e.clientX, y: e.clientY };
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setOpen(true);
    },
    [enabled, setOpen]
  );

  // Tracks the cursor while it moves within either element, so the point
  // checked at close-time reflects where the cursor actually is, not just
  // where it was when it first entered.
  const onMouseMove = React.useCallback((e: React.MouseEvent) => {
    lastPoint.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseLeave = React.useCallback(
    (e?: React.MouseEvent) => {
      if (!enabled) return;
      if (e) lastPoint.current = { x: e.clientX, y: e.clientY };
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        // Re-check real geometry before actually closing. If the cursor
        // is still inside the trigger or the content, this leave was a
        // phantom event (Radix repositioning under a stationary cursor,
        // most commonly) and the menu should stay exactly as it is.
        if (isPointInside(triggerEl.current) || isPointInside(contentEl.current)) {
          return;
        }
        setOpen(false);
      }, 150);
    },
    [enabled, setOpen, isPointInside]
  );

  return React.useMemo(
    () => ({ onMouseEnter, onMouseLeave, onMouseMove, setTriggerRef, setContentRef }),
    [onMouseEnter, onMouseLeave, onMouseMove, setTriggerRef, setContentRef]
  );
}