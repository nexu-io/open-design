// Pure positioning for the design-toolbox hover-detail / preview panel.
//
// The panel is `position: fixed`, so its left/top are viewport coordinates.
// Extracted from ChatComposer's showToolboxDetail closure so the narrow-pane
// clamp is unit-testable without a DOM: a row near the left edge (or a
// viewport narrower than detailWidth + gap*2) must NOT produce a negative
// left that pushes the panel off-screen — it must clamp back into view.

export interface DetailAnchorRect {
  left: number;
  right: number;
  top: number;
}

export interface DetailViewport {
  width: number;
  height: number;
}

export interface DetailPositionOptions {
  /** Panel width (px). */
  detailWidth: number;
  /** Gap between the row and the panel (px). */
  gap: number;
  /** Min distance kept from every viewport edge (px). */
  margin: number;
  /** Assumed panel height for the vertical clamp (px). */
  estimatedHeight: number;
}

/**
 * Place the detail panel beside the hovered row: to the right when it fits,
 * otherwise to the left — then clamp both axes into the viewport so the
 * fixed-positioned panel always stays reachable.
 */
export function computeToolboxDetailPosition(
  rect: DetailAnchorRect,
  viewport: DetailViewport,
  { detailWidth, gap, margin, estimatedHeight }: DetailPositionOptions,
): { left: number; top: number } {
  const toRight = rect.right + gap;
  const preferredLeft =
    toRight + detailWidth > viewport.width - margin
      ? rect.left - gap - detailWidth
      : toRight;
  const left = Math.max(
    margin,
    Math.min(preferredLeft, viewport.width - margin - detailWidth),
  );
  const top = Math.max(
    margin,
    Math.min(rect.top, viewport.height - margin - estimatedHeight),
  );
  return { left, top };
}
