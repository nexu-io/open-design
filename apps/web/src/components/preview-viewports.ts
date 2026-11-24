import type { CSSProperties } from 'react';

export type PreviewViewportCategory = 'mobile' | 'tablet' | 'desktop';

export type PreviewViewportId =
  | 'desktop'
  | 'iphone-se'
  | 'android-compact'
  | 'mobile'
  | 'pixel-8'
  | 'iphone-15-pro-max'
  | 'ipad-mini'
  | 'tablet'
  | 'ipad-pro'
  | 'laptop'
  | 'macbook'
  | 'full-hd';

export type PreviewViewportState = {
  id: PreviewViewportId;
  rotated: boolean;
};

export type PreviewViewportInput = PreviewViewportId | PreviewViewportState;

export type PreviewCanvasSize = {
  width: number;
  height: number;
  scrollLeft?: number;
  scrollTop?: number;
};

export type CommentPreviewCanvasOptions = {
  boardMode: boolean;
  sidePanelCollapsed: boolean;
  viewport?: PreviewViewportInput;
};

export type PreviewScaleOptions = {
  canvasPadding?: number;
};

export type PreviewViewportPreset = {
  id: PreviewViewportId;
  category: PreviewViewportCategory;
  label: string;
  width: number | null;
  height: number | null;
};

export type FixedPreviewViewportPreset = PreviewViewportPreset & {
  width: number;
  height: number;
};

export type PreviewViewportGroup = {
  category: PreviewViewportCategory;
  labelKey:
    | 'fileViewer.viewportGroupMobile'
    | 'fileViewer.viewportGroupTablet'
    | 'fileViewer.viewportGroupDesktop';
  presets: FixedPreviewViewportPreset[];
};

export type PreviewOverlayTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_PREVIEW_VIEWPORT_STATE: PreviewViewportState = {
  id: 'desktop',
  rotated: false,
};

export const FLUID_DESKTOP_VIEWPORT_PRESET: PreviewViewportPreset = {
  id: 'desktop',
  category: 'desktop',
  label: 'Desktop',
  width: null,
  height: null,
};

export const PREVIEW_VIEWPORT_GROUPS: PreviewViewportGroup[] = [
  {
    category: 'mobile',
    labelKey: 'fileViewer.viewportGroupMobile',
    presets: [
      { id: 'iphone-se', category: 'mobile', label: 'iPhone SE', width: 375, height: 667 },
      { id: 'android-compact', category: 'mobile', label: 'Android Compact', width: 360, height: 800 },
      { id: 'mobile', category: 'mobile', label: 'iPhone 15', width: 390, height: 844 },
      { id: 'pixel-8', category: 'mobile', label: 'Pixel 8', width: 412, height: 915 },
      { id: 'iphone-15-pro-max', category: 'mobile', label: 'iPhone 15 Pro Max', width: 430, height: 932 },
    ],
  },
  {
    category: 'tablet',
    labelKey: 'fileViewer.viewportGroupTablet',
    presets: [
      { id: 'ipad-mini', category: 'tablet', label: 'iPad Mini', width: 744, height: 1133 },
      { id: 'tablet', category: 'tablet', label: 'iPad Air', width: 820, height: 1180 },
      { id: 'ipad-pro', category: 'tablet', label: 'iPad Pro', width: 1024, height: 1366 },
    ],
  },
  {
    category: 'desktop',
    labelKey: 'fileViewer.viewportGroupDesktop',
    presets: [
      { id: 'laptop', category: 'desktop', label: 'Laptop', width: 1366, height: 768 },
      { id: 'macbook', category: 'desktop', label: 'MacBook', width: 1440, height: 900 },
      { id: 'full-hd', category: 'desktop', label: 'Full HD', width: 1920, height: 1080 },
    ],
  },
];

export const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  FLUID_DESKTOP_VIEWPORT_PRESET,
  ...PREVIEW_VIEWPORT_GROUPS.flatMap((group) => group.presets),
];

const PRESET_BY_ID = new Map<PreviewViewportId, PreviewViewportPreset>(
  PREVIEW_VIEWPORT_PRESETS.map((preset) => [preset.id, preset]),
);

const COMMENT_SIDE_DOCK_WIDTH = 320;
const COMMENT_SIDE_DOCK_RAIL_WIDTH = 42;
const COMMENT_SIDE_DOCK_GAP = 12;
const COMMENT_SIDE_DOCK_PADDING = 8;
const COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING = 24;
const COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH = 280;
const COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT = 220;
const COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT = 48;
const COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT;
const COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT;

export function findPreviewViewportPreset(id: PreviewViewportId): PreviewViewportPreset {
  return PRESET_BY_ID.get(id) ?? FLUID_DESKTOP_VIEWPORT_PRESET;
}

export function normalizePreviewViewportState(viewport?: PreviewViewportInput): PreviewViewportState {
  if (!viewport) return DEFAULT_PREVIEW_VIEWPORT_STATE;
  const rawId = typeof viewport === 'string' ? viewport : viewport.id;
  const preset = findPreviewViewportPreset(rawId);
  if (preset.width === null || preset.height === null) {
    return DEFAULT_PREVIEW_VIEWPORT_STATE;
  }
  return {
    id: preset.id,
    rotated: typeof viewport === 'string' ? false : Boolean(viewport.rotated),
  };
}

export function isFluidDesktopViewport(viewport?: PreviewViewportInput): boolean {
  const state = normalizePreviewViewportState(viewport);
  return findPreviewViewportPreset(state.id).width === null;
}

export function resolvePreviewViewportDimensions(
  viewport?: PreviewViewportInput,
): { width: number; height: number } | null {
  const state = normalizePreviewViewportState(viewport);
  const preset = findPreviewViewportPreset(state.id);
  if (preset.width == null || preset.height == null) return null;
  return state.rotated
    ? { width: preset.height, height: preset.width }
    : { width: preset.width, height: preset.height };
}

export function selectPreviewViewportPreset(id: PreviewViewportId): PreviewViewportState {
  const preset = findPreviewViewportPreset(id);
  return { id: preset.id, rotated: false };
}

export function togglePreviewViewportRotation(viewport: PreviewViewportInput): PreviewViewportState {
  const state = normalizePreviewViewportState(viewport);
  if (isFluidDesktopViewport(state)) return DEFAULT_PREVIEW_VIEWPORT_STATE;
  return { id: state.id, rotated: !state.rotated };
}

export function previewViewportIcon(viewport: PreviewViewportInput): string {
  const state = normalizePreviewViewportState(viewport);
  const preset = findPreviewViewportPreset(state.id);
  if (preset.category === 'tablet') return 'tablet-line';
  if (preset.category === 'mobile') return 'smartphone-line';
  return 'computer-line';
}

export function previewViewportContainerClass(viewport?: PreviewViewportInput): string {
  const state = normalizePreviewViewportState(viewport);
  const preset = findPreviewViewportPreset(state.id);
  if (preset.width === null) return 'preview-viewport-desktop';
  if (preset.category === 'desktop') return 'preview-viewport-fixed-desktop';
  return `preview-viewport-${preset.category}`;
}

export function formatPreviewViewportDimensions(width: number, height: number): string {
  return `${width} \u00d7 ${height}`;
}

export function previewViewportStyle(
  viewport: PreviewViewportInput,
  previewScale = 1,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): CSSProperties & Record<string, string | number> {
  const dims = resolvePreviewViewportDimensions(viewport);
  if (!dims) return {};
  const effectiveScale = effectivePreviewScale(viewport, previewScale, canvasSize, options);
  return {
    '--preview-viewport-width': `${dims.width}px`,
    '--preview-viewport-height': `${dims.height}px`,
    '--preview-scale': effectiveScale,
    '--preview-user-scale': previewScale,
  };
}

export function usesStackedCommentSideDock(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): boolean {
  if (!canvasSize || !options.boardMode) return false;
  const dockPadding = options.viewport && !isFluidDesktopViewport(options.viewport)
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  return dockedWidth < COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH;
}

export function commentPreviewCanvasSize(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): PreviewCanvasSize | undefined {
  if (!canvasSize || !options.boardMode) return canvasSize;
  const dockPadding = options.viewport && !isFluidDesktopViewport(options.viewport)
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  if (usesStackedCommentSideDock(canvasSize, options)) {
    const stackedHeightDeduction = options.sidePanelCollapsed
      ? COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION
      : COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION;
    return {
      width: Math.max(1, canvasSize.width - (COMMENT_SIDE_DOCK_PADDING * 2)),
      height: Math.max(1, canvasSize.height - stackedHeightDeduction),
    };
  }
  return {
    width: Math.max(1, dockedWidth),
    height: Math.max(1, canvasSize.height - (dockPadding * 2)),
  };
}

export function effectivePreviewScale(
  viewport: PreviewViewportInput,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): number {
  const dims = resolvePreviewViewportDimensions(viewport);
  if (!dims || !canvasSize?.width || !canvasSize.height) return previewScale;
  const canvasPadding = options?.canvasPadding ?? 48;
  const availableWidth = Math.max(1, canvasSize.width - canvasPadding);
  const availableHeight = Math.max(1, canvasSize.height - canvasPadding);
  const fitScale = Math.min(1, availableWidth / dims.width, availableHeight / dims.height);
  return Math.min(previewScale, fitScale);
}

export function desktopPreviewAutoFitZoomPercent(
  canvasSize: PreviewCanvasSize | undefined,
  contentWidth?: number | null,
): number {
  if (!canvasSize?.width || !Number.isFinite(canvasSize.width)) return 100;
  if (!contentWidth || !Number.isFinite(contentWidth) || contentWidth <= canvasSize.width) return 100;
  return Math.max(1, Math.min(100, (canvasSize.width / contentWidth) * 100));
}

export function resolveDesktopPreviewZoomPercent(params: {
  zoomMode: 'auto' | 'manual';
  viewport: PreviewViewportInput;
  isDeck: boolean;
  manualZoomPercent: number;
  canvasSize: PreviewCanvasSize | undefined;
  contentWidth?: number | null;
}): number {
  const { zoomMode, viewport, isDeck, manualZoomPercent, canvasSize, contentWidth } = params;
  if (zoomMode !== 'auto' || !isFluidDesktopViewport(viewport) || isDeck) return manualZoomPercent;
  return desktopPreviewAutoFitZoomPercent(canvasSize, contentWidth);
}

export function previewOverlayTransform(
  viewport: PreviewViewportInput,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
): PreviewOverlayTransform {
  const scale = effectivePreviewScale(viewport, previewScale, canvasSize);
  const dims = resolvePreviewViewportDimensions(viewport);
  if (!dims) return { scale, offsetX: 0, offsetY: 0 };
  const pad = 24;
  const availableWidth = Math.max(1, (canvasSize?.width ?? dims.width * scale + pad * 2) - pad * 2);
  const scaledWidth = dims.width * scale;
  return {
    scale,
    offsetX: pad + Math.max(0, (availableWidth - scaledWidth) / 2),
    offsetY: pad,
  };
}

export function previewScaleShellStyle(
  viewport: PreviewViewportInput,
  previewScale: number,
): CSSProperties & Record<string, string | number> {
  if (isFluidDesktopViewport(viewport)) {
    return {
      width: `${100 / previewScale}%`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return {
    width: 'var(--preview-viewport-width)',
    height: 'var(--preview-viewport-height)',
    transform: 'scale(var(--preview-scale, 1))',
    transformOrigin: '0 0',
  };
}

export function manualEditPreviewShellStyle(
  viewport: PreviewViewportInput,
  previewScale: number,
  frozenWidth: number | null,
): CSSProperties & Record<string, string | number> {
  if (isFluidDesktopViewport(viewport) && frozenWidth) {
    return {
      width: `${frozenWidth / previewScale}px`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return previewScaleShellStyle(viewport, previewScale);
}
