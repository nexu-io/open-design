export interface ComposerPlusFlyoutRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ComposerPlusFlyoutSize {
  width: number;
  height: number;
}

export interface ComposerPlusFlyoutViewport {
  width: number;
  height: number;
}

export interface ComposerPlusFlyoutPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'right' | 'left';
}

const EDGE_MARGIN = 8;
const FLYOUT_GAP = 4;
const TOP_OFFSET = 5;

export function computeComposerPlusFlyoutPosition(
  anchor: ComposerPlusFlyoutRect,
  size: ComposerPlusFlyoutSize,
  viewport: ComposerPlusFlyoutViewport,
): ComposerPlusFlyoutPosition {
  const availableWidth = Math.max(0, viewport.width - EDGE_MARGIN * 2);
  const width = Math.min(size.width, availableWidth);
  const rightSpace = viewport.width - anchor.right - FLYOUT_GAP - EDGE_MARGIN;
  const leftSpace = anchor.left - FLYOUT_GAP - EDGE_MARGIN;
  const placement = rightSpace >= width || rightSpace >= leftSpace ? 'right' : 'left';

  const rawLeft =
    placement === 'right'
      ? anchor.right + FLYOUT_GAP
      : anchor.left - FLYOUT_GAP - width;
  const maxLeft = viewport.width - EDGE_MARGIN - width;
  const left = clamp(rawLeft, EDGE_MARGIN, Math.max(EDGE_MARGIN, maxLeft));

  const viewportMaxHeight = Math.max(0, viewport.height - EDGE_MARGIN * 2);
  const wantedHeight = Math.min(size.height, viewportMaxHeight);
  const rawTop = anchor.top - TOP_OFFSET;
  const maxTop = viewport.height - EDGE_MARGIN - wantedHeight;
  const top = clamp(rawTop, EDGE_MARGIN, Math.max(EDGE_MARGIN, maxTop));
  const maxHeight = Math.max(0, viewport.height - EDGE_MARGIN - top);

  return { left, top, width, maxHeight, placement };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
