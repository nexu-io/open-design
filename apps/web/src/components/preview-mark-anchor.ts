// Content anchoring for preview annotation marks (issue #6361).
//
// A mark stored as a fraction of the preview frame silently changes meaning
// whenever the artifact re-lays-out under it. Changing the app's UI zoom does
// exactly that: the frame's CSS width shrinks, the artifact reflows, and every
// block below the reflow point shifts. Measured on the reported artifact, one
// zoom step moved a marked band 19.5px — enough to land the mark between two
// bands and send the agent to the wrong element.
//
// No frame-level geometry can predict that shift, because it depends on the
// content. So a mark records *which element it was drawn on* plus where it sat
// within that element's box, and is re-projected from the element's current
// position whenever the frame is measured again. This mirrors how preview
// comments already survive edits (see `comments.ts`), and reuses the same
// `data-od-id` element identity the preview bridge publishes.

/** An element's box in preview-frame CSS pixels, as the bridge reports it. */
export interface AnchorTarget {
  elementId: string;
  selector: string;
  position: { x: number; y: number; width: number; height: number };
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSize {
  w: number;
  h: number;
}

/**
 * A mark bound to artifact content. `rel` is the mark's rect expressed in units
 * of the anchor element's own box, so re-projecting it only needs that
 * element's current position. Values outside 0..1 are legitimate: a mark may
 * extend past the element it is anchored to.
 */
export interface MarkAnchor {
  elementId: string;
  selector: string;
  rel: NormalizedRect;
}

function center(rect: NormalizedRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function area(t: AnchorTarget) {
  return Math.max(0, t.position.width) * Math.max(0, t.position.height);
}

/**
 * Pick the element a mark belongs to: the smallest target whose box contains
 * the mark's center. Smallest wins because targets nest — a band sits inside a
 * <main> inside <body>, and the band is the element the user meant. Falls back
 * to the target whose center is nearest when the mark lands in a gap (padding,
 * margins) that belongs to no annotated element.
 */
export function chooseAnchorTarget(
  markFrameRect: NormalizedRect,
  frame: FrameSize,
  targets: readonly AnchorTarget[],
): AnchorTarget | null {
  if (targets.length === 0 || frame.w <= 0 || frame.h <= 0) return null;
  const c = center(markFrameRect);
  const px = c.x * frame.w;
  const py = c.y * frame.h;

  let containing: AnchorTarget | null = null;
  for (const t of targets) {
    const p = t.position;
    if (p.width <= 0 || p.height <= 0) continue;
    const inside = px >= p.x && px <= p.x + p.width && py >= p.y && py <= p.y + p.height;
    if (!inside) continue;
    if (!containing || area(t) < area(containing)) containing = t;
  }
  if (containing) return containing;

  let nearest: AnchorTarget | null = null;
  let nearestDist = Infinity;
  for (const t of targets) {
    const p = t.position;
    if (p.width <= 0 || p.height <= 0) continue;
    const dx = p.x + p.width / 2 - px;
    const dy = p.y + p.height / 2 - py;
    const dist = dx * dx + dy * dy;
    if (dist < nearestDist) {
      nearest = t;
      nearestDist = dist;
    }
  }
  return nearest;
}

/**
 * Express a frame-normalized mark relative to its anchor element, so it can be
 * re-projected after the element moves.
 */
export function anchorMark(
  markFrameRect: NormalizedRect,
  frame: FrameSize,
  target: AnchorTarget,
): MarkAnchor | null {
  const p = target.position;
  if (p.width <= 0 || p.height <= 0 || frame.w <= 0 || frame.h <= 0) return null;
  return {
    elementId: target.elementId,
    selector: target.selector,
    rel: {
      x: (markFrameRect.x * frame.w - p.x) / p.width,
      y: (markFrameRect.y * frame.h - p.y) / p.height,
      width: (markFrameRect.width * frame.w) / p.width,
      height: (markFrameRect.height * frame.h) / p.height,
    },
  };
}

/**
 * Re-project an anchored mark onto the current frame. Returns null when the
 * anchor element is no longer present, which is the caller's signal to keep the
 * mark's last known frame-relative position rather than guess.
 */
export function resolveAnchor(
  anchor: MarkAnchor,
  frame: FrameSize,
  targets: readonly AnchorTarget[],
): NormalizedRect | null {
  if (frame.w <= 0 || frame.h <= 0) return null;
  const target =
    targets.find((t) => t.elementId === anchor.elementId) ??
    targets.find((t) => t.selector === anchor.selector);
  if (!target) return null;
  const p = target.position;
  if (p.width <= 0 || p.height <= 0) return null;
  return {
    x: (p.x + anchor.rel.x * p.width) / frame.w,
    y: (p.y + anchor.rel.y * p.height) / frame.h,
    width: (anchor.rel.width * p.width) / frame.w,
    height: (anchor.rel.height * p.height) / frame.h,
  };
}
