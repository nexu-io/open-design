export interface PreviewZoomState {
  zoomPercent: number;
  panX: number;
  panY: number;
}

export const MIN_PREVIEW_ZOOM_PERCENT = 25;
export const MAX_PREVIEW_ZOOM_PERCENT = 400;
export const PREVIEW_PAN_SURFACE_SELECTOR = '[data-preview-pan-surface="true"]';
export const PREVIEW_PAN_OVERSCROLL_PX = 48;
export const DEFAULT_PREVIEW_ZOOM: PreviewZoomState = {
  zoomPercent: 100,
  panX: 0,
  panY: 0,
};

const ZOOM_SENSITIVITY = 0.007;
const MAX_DELTA = 10;

export const isFitZoom = (zoomPercent: number) => Math.abs(zoomPercent - 100) < 0.5;

export function isPreviewAtFit(state: PreviewZoomState): boolean {
  return isFitZoom(state.zoomPercent) && Math.abs(state.panX) < 0.1 && Math.abs(state.panY) < 0.1;
}

export function toDomPrecision(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function clampPreviewZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.min(MAX_PREVIEW_ZOOM_PERCENT, Math.max(MIN_PREVIEW_ZOOM_PERCENT, percent));
}

export function canStartPreviewPan(button: number): boolean {
  return button === 1;
}

export function ownsPreviewPanTarget(
  target: EventTarget | null,
  stage: HTMLElement | null,
): boolean {
  if (!(target instanceof Element)) return false;
  if (stage?.contains(target)) return true;
  return !!target.closest(PREVIEW_PAN_SURFACE_SELECTOR);
}

export function getPreviewWheelZoomPercent(deltaY: number, currentZoomPercent: number): number {
  if (!Number.isFinite(deltaY)) return clampPreviewZoomPercent(currentZoomPercent);
  const clamped = Math.abs(deltaY) > MAX_DELTA ? MAX_DELTA * Math.sign(deltaY) : deltaY;
  const step = -clamped * ZOOM_SENSITIVITY;
  const current = clampPreviewZoomPercent(currentZoomPercent);
  return clampPreviewZoomPercent(current * Math.exp(step));
}

export function getNextPreviewZoomPercent(
  direction: "in" | "out",
  currentZoomPercent: number,
): number {
  const current = clampPreviewZoomPercent(currentZoomPercent);
  const multiplier = direction === "in" ? 1.25 : 0.8;
  return clampPreviewZoomPercent(current * multiplier);
}

export function clampPreviewPan(input: {
  panX: number;
  panY: number;
  zoomPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth?: number;
  contentHeight?: number;
}): Pick<PreviewZoomState, "panX" | "panY"> {
  const scale = clampPreviewZoomPercent(input.zoomPercent) / 100;
  const contentWidth = input.contentWidth ?? input.viewportWidth;
  const contentHeight = input.contentHeight ?? input.viewportHeight;
  const maxPanX =
    Math.max(0, (contentWidth * scale - input.viewportWidth) / 2) + PREVIEW_PAN_OVERSCROLL_PX;
  const maxPanY =
    Math.max(0, (contentHeight * scale - input.viewportHeight) / 2) + PREVIEW_PAN_OVERSCROLL_PX;
  return {
    panX: Math.min(maxPanX, Math.max(-maxPanX, input.panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, input.panY)),
  };
}

function clampPreviewPanForZoom(
  panX: number,
  panY: number,
  zoomPercent: number,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): Pick<PreviewZoomState, "panX" | "panY"> {
  const scale = clampPreviewZoomPercent(zoomPercent) / 100;
  const maxPanX = Math.abs(contentWidth * scale - viewportWidth) / 2 + PREVIEW_PAN_OVERSCROLL_PX;
  const maxPanY = Math.abs(contentHeight * scale - viewportHeight) / 2 + PREVIEW_PAN_OVERSCROLL_PX;
  return {
    panX: Math.min(maxPanX, Math.max(-maxPanX, panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, panY)),
  };
}

export function resolvePreviewWheelZoom(input: {
  state: PreviewZoomState;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth?: number;
  contentHeight?: number;
  cursorX?: number;
  cursorY?: number;
}): PreviewZoomState {
  const oldZoom = clampPreviewZoomPercent(input.state.zoomPercent);
  const nextZoomPercent = getPreviewWheelZoomPercent(input.deltaY, oldZoom);
  const oldScale = oldZoom / 100;
  const newScale = nextZoomPercent / 100;

  let panX = input.state.panX;
  let panY = input.state.panY;

  if (input.cursorX !== undefined && input.cursorY !== undefined) {
    const ratio = newScale / oldScale;
    panX = input.cursorX * (1 - ratio) + panX * ratio;
    panY = input.cursorY * (1 - ratio) + panY * ratio;
  }

  const cw = input.contentWidth ?? input.viewportWidth;
  const ch = input.contentHeight ?? input.viewportHeight;
  const pan = clampPreviewPanForZoom(
    panX,
    panY,
    nextZoomPercent,
    input.viewportWidth,
    input.viewportHeight,
    cw,
    ch,
  );

  return {
    zoomPercent: nextZoomPercent,
    ...pan,
  };
}

export function resolvePreviewWheelPan(input: {
  state: PreviewZoomState;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth?: number;
  contentHeight?: number;
}): PreviewZoomState {
  const pan = clampPreviewPan({
    panX: input.state.panX - input.deltaX,
    panY: input.state.panY - input.deltaY,
    zoomPercent: input.state.zoomPercent,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    contentWidth: input.contentWidth,
    contentHeight: input.contentHeight,
  });

  return {
    zoomPercent: clampPreviewZoomPercent(input.state.zoomPercent),
    ...pan,
  };
}

export interface PreviewVisibleRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function resolvePreviewVisibleRegion(input: {
  state: PreviewZoomState;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}): PreviewVisibleRegion {
  const scale = clampPreviewZoomPercent(input.state.zoomPercent) / 100;
  const axis = (pan: number, view: number, content: number): [number, number] => {
    const size = content * scale;
    if (!(size > 0)) return [0, 1];
    const at = (edge: number) => Math.min(1, Math.max(0, (edge - pan + size / 2) / size));
    const start = at(-view / 2);
    return [start, at(view / 2) - start];
  };
  const [left, width] = axis(input.state.panX, input.viewportWidth, input.contentWidth);
  const [top, height] = axis(input.state.panY, input.viewportHeight, input.contentHeight);
  return { left, top, width, height };
}
