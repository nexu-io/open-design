/**
 * Pointer capture for a lane gesture. Its own module only because both gesture
 * hooks need it and `automationLaneGeometry` is deliberately DOM-free.
 */

/**
 * Keep the rest of a gesture even if the pointer leaves the lane. Without it a
 * drag that strays outside the svg stops sending moves and the point sticks.
 *
 * Captured on the svg the handler is bound to, NOT on `e.target`: the target is
 * whatever child the press happened to land on — a breakpoint circle, a
 * selection line — and a child that unmounts mid-drag takes the capture with it,
 * silently and with no `pointercancel` to notice it by. The svg outlives every
 * gesture on it.
 *
 * Structurally typed so this stays testable without React's event types.
 */
export function capturePointer(e: { currentTarget: Element; pointerId: number }): void {
  e.currentTarget.setPointerCapture?.(e.pointerId);
}
