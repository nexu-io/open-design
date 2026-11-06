import { useEffect, useRef, type RefObject } from 'react';

/**
 * A popover is dismissed by any interaction that is not aimed at it: a
 * pointerdown outside its container, or Escape.
 *
 * This is the dismissal shape already inlined across the viewer toolbars
 * (viewport switcher, zoom menu, deploy menu) and the design-files menus,
 * extracted so a new menu gets the behavior by wiring a ref instead of
 * re-deriving the listener pair — the variant that keys off a CSS class name
 * rather than a ref breaks silently when the class is renamed.
 *
 * `pointerdown` rather than `click`: the menu must be gone by the time the
 * user's press lands on whatever they aimed at, and a `click` handler
 * elsewhere that calls `stopPropagation` would never let a `click`-based
 * listener run at all.
 *
 * Only for popovers whose panel is a DOM descendant of `containerRef`. A
 * portaled panel lives outside that subtree, so `contains` reports every press
 * inside the panel as "outside" and the menu closes on its own items.
 */
export function useDismissOnOutsideInteraction(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  // Callers pass an inline arrow; keeping it in a ref means the listeners are
  // bound once per open rather than re-bound on every render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(event.target as Node)) onDismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, containerRef]);
}
