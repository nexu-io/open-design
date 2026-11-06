import type { MouseEvent as ReactMouseEvent } from 'react';

const MIDDLE_BUTTON = 1;

/**
 * Element handlers that run `onMiddleClick` when the middle mouse button clicks
 * the element. Browsers report that click as `auxclick`, not `click`. The press
 * is default-prevented as well, because it would otherwise start Chromium's
 * middle-button autoscroll over a scrollable strip and move focus.
 */
export function middleClickHandlers(onMiddleClick: () => void) {
  return {
    onMouseDown(event: ReactMouseEvent) {
      if (event.button === MIDDLE_BUTTON) event.preventDefault();
    },
    onAuxClick(event: ReactMouseEvent) {
      if (event.button !== MIDDLE_BUTTON) return;
      event.preventDefault();
      onMiddleClick();
    },
  };
}
