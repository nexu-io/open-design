// Resize/gesture diagnostics — grep [hf-resize]. Off by default; opt in per
// session with `localStorage.setItem("hf-resize-debug", "1")` (then reload).
// Granular per-move/per-gesture tracing for resize investigation.
import { makeStudioDebugLogger } from "./studioDebug";

export const logResize = makeStudioDebugLogger("resize");

let moveN = 0;

/** Per-pointermove logging, throttled: first move then every 8th. */
export function logResizeMove(data: Record<string, unknown>): void {
  logResize("move", () => {
    moveN += 1;
    return moveN % 8 === 1 ? { n: moveN, ...data } : null;
  });
}

export function resetResizeMoveLog(): void {
  moveN = 0;
}

/** Snapshot the element's live geometry now and again after 200ms (jump detector). */
export function logResizeSettle(el: HTMLElement, tag: string): void {
  const snapshot = (phase: string) => {
    const r = el.getBoundingClientRect();
    const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
    return {
      tag,
      phase,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      cssW: cs?.width,
      cssH: cs?.height,
      transform: cs?.transform,
      inlineStyle: el.getAttribute("style"),
    };
  };
  logResize("settle", () => {
    const current = snapshot("t0");
    el.ownerDocument.defaultView?.setTimeout(
      () => logResize("settle", () => snapshot("t200")),
      200,
    );
    return current;
  });
}
