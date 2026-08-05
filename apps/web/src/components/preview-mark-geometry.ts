// Geometry for preview annotation marks (issue #6361).
//
// Marks are stored normalized (0..1) against the preview frame, which lets them
// survive the `transform: scale()` device-frame shells without any bookkeeping:
// a scaled frame renders the *same* layout box larger, so a fraction of that box
// still lands on the same artifact pixels.
//
// That equivalence breaks the moment the frame's **layout** box changes size —
// UI zoom (Cmd +/-/0), a window resize, a sidebar toggle. The artifact inside
// the iframe then re-lays-out instead of scaling: block content keeps its CSS
// pixel offset from the top of the frame while the frame's height changes
// underneath it. A mark held at a fixed *fraction* of the frame therefore slides
// across the artifact — in the reported case a 666px-tall frame restored to
// 744px moved a band mark 40px down, onto the next band.
//
// So a resize of the layout box has to re-normalize the stored marks, and the
// two axes need different rules because CSS block layout treats them
// differently:
//
//   - width is fluid: a block's box tracks the frame's width, so a mark's
//     horizontal fraction already follows the content. Keep it.
//   - height is content-driven: a block sits at a fixed CSS pixel offset from
//     the top regardless of how tall the frame is. Preserve that pixel offset,
//     which means rescaling the fraction by the height ratio.

export interface FrameSize {
  w: number;
  h: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * True when re-anchoring would change anything: both heights must be real, and
 * the frame must actually have changed height. Same-height resizes (a pure
 * width change) leave every mark exactly where it is.
 */
export function shouldReanchorMarks(from: FrameSize, to: FrameSize): boolean {
  return (
    Number.isFinite(from.h) &&
    Number.isFinite(to.h) &&
    from.h > 0 &&
    to.h > 0 &&
    from.h !== to.h
  );
}

/**
 * The height ratio that converts a fraction of the old frame into the fraction
 * of the new frame that sits at the same CSS pixel offset from the frame's top.
 */
function heightRatio(from: FrameSize, to: FrameSize): number {
  return from.h / to.h;
}

/**
 * Re-anchor a normalized point so it keeps its CSS pixel offset from the top of
 * the frame after the frame's layout height changed.
 */
export function reanchorNormalizedPoint(
  point: NormalizedPoint,
  from: FrameSize,
  to: FrameSize,
): NormalizedPoint {
  if (!shouldReanchorMarks(from, to)) return point;
  return { x: point.x, y: clamp01(point.y * heightRatio(from, to)) };
}

/**
 * Re-anchor a normalized rect. Both the top edge and the height are converted,
 * so the rect keeps covering the same run of artifact pixels rather than the
 * same fraction of the frame.
 */
export function reanchorNormalizedRect(
  rect: NormalizedRect,
  from: FrameSize,
  to: FrameSize,
): NormalizedRect {
  if (!shouldReanchorMarks(from, to)) return rect;
  const ratio = heightRatio(from, to);
  const y = clamp01(rect.y * ratio);
  return {
    x: rect.x,
    y,
    width: rect.width,
    // A frame that shrank a lot can push the bottom edge past the frame; clamp
    // the height rather than let the rect describe pixels that no longer exist.
    height: Math.min(1 - y, Math.max(0, rect.height * ratio)),
  };
}
