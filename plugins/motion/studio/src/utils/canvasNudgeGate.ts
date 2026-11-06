/**
 * Arrow-key ownership gate between the canvas nudge (DomEditOverlay) and the
 * playback frame-step shortcuts (usePlaybackKeyboard). Both listen for arrow
 * keys with window capture listeners, and their relative order depends on
 * mount order (DomEditOverlay remounts when caption edit mode toggles), so
 * `event.defaultPrevented` alone can't arbitrate. While a nudgeable canvas
 * selection holds a claim, the playback handler skips ArrowLeft/ArrowRight.
 */

let claims = 0;

/** Claim the arrow keys for canvas nudging. Returns an idempotent release. */
export function acquireCanvasNudgeKeys(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

/** True while a nudgeable canvas selection owns the arrow keys. */
export function canvasNudgeKeysClaimed(): boolean {
  return claims > 0;
}

/** Test-only: reset the module-level claim counter so leaked claims from one test
 *  can't bleed into the next (call in a `beforeEach`). */
export function __resetForTests(): void {
  claims = 0;
}
