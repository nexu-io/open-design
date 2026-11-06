import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Shared dismiss logic for context menus: closes on ANY pointerdown outside the
 * menu (mouse, pen, or touch), or Escape.
 *
 * Two failure modes this guards against, both seen in the canvas editor:
 *
 * 1. The menu lives inside DomEditOverlay, whose own pointer handlers call
 *    `event.stopPropagation()` on several branches (marquee start, shift-select).
 *    A bubble-phase `mousedown`/`pointerdown` listener on `document` never fires
 *    for those events — the overlay eats them first — so the menu stayed open.
 *    Listening in the CAPTURE phase runs this dismiss BEFORE any bubble-phase
 *    stopPropagation, so an outside press always closes the menu.
 *
 * 2. `mousedown` alone misses pointer/touch-only gestures. `pointerdown` is the
 *    superset (fires for mouse, pen, and touch) and is exactly the event the
 *    overlay itself acts on, so hooking it here dismisses on the same press that
 *    starts a canvas gesture — no second click required.
 */
export function useContextMenuDismiss(onClose: () => void): RefObject<HTMLDivElement | null> {
  const menuRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(
    (e: PointerEvent | MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") onClose();
        return;
      }
      // Any press inside the menu is a menu interaction — leave it open (the
      // item's own handler will close it after acting).
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    // Capture phase so overlay/iframe-side handlers that stopPropagation on the
    // bubble phase can't swallow the dismiss. `pointerdown` covers mouse + touch
    // + pen; keep `mousedown` too for any synthetic-mouse path that skips it.
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("keydown", dismiss);
    };
  }, [dismiss]);

  return menuRef;
}
