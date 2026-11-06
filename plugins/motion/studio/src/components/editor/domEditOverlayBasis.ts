/**
 * The iframe→overlay coordinate basis: everything needed to map a rect measured
 * inside the preview document into the Studio overlay's own coordinates.
 *
 * It is a property of the COMPOSITION and the canvas zoom, not of any element,
 * so a caller measuring many elements in one synchronous pass resolves it once
 * and threads it through the geometry functions in `domEditOverlayGeometry`.
 * Resolved per element it costs a `querySelector("[data-composition-id]")` plus
 * three layout reads each.
 *
 * Its own module because it is the one piece of that file every other piece
 * depends on and nothing in it is about a single element's geometry.
 */

/** iframe→overlay mapping basis shared by every overlay-geometry function. */
export interface OverlayRootScale {
  iframeRect: DOMRect;
  overlayRect: DOMRect;
  rootScaleX: number;
  rootScaleY: number;
}

export function readPositiveDimension(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The composition root element inside the preview doc (or null when absent). */
function findOverlayRootElement(doc: Document | null): HTMLElement | null {
  return doc?.querySelector<HTMLElement>("[data-composition-id]") ?? doc?.documentElement ?? null;
}

/**
 * The root's effective width/height for scaling: prefer the composition's
 * declared dimensions (data-width/data-height), which stay fixed while GSAP
 * transforms mutate the measured rect; fall back to the measured rect. Null when
 * unmeasurable.
 */
function resolveRootDimensions(root: HTMLElement | null): { width: number; height: number } | null {
  if (!root) return null;
  const rootRect = root.getBoundingClientRect();
  const width = readPositiveDimension(root.getAttribute("data-width")) ?? rootRect.width;
  const height = readPositiveDimension(root.getAttribute("data-height")) ?? rootRect.height;
  if (!width || !height) return null;
  return { width, height };
}

/**
 * The iframe/overlay client rects and the iframe→root scale factors. Uses the
 * composition's declared dimensions (data-width/data-height) for the scale
 * instead of rootRect.width/height: when GSAP applies transforms (scale,
 * translate) to the root, rootRect dimensions change but the composition's
 * canonical size stays fixed, and using rootRect misaligns the overlay during
 * animated playback. Returns null when the geometry is unmeasurable.
 */
export function computeOverlayRootScale(
  overlayEl: HTMLDivElement,
  iframe: HTMLIFrameElement,
  doc: Document | null,
): OverlayRootScale | null {
  const iframeRect = iframe.getBoundingClientRect();
  const overlayRect = overlayEl.getBoundingClientRect();
  const dims = resolveRootDimensions(findOverlayRootElement(doc));
  if (!dims) return null;
  return {
    iframeRect,
    overlayRect,
    rootScaleX: iframeRect.width / dims.width,
    rootScaleY: iframeRect.height / dims.height,
  };
}
