export type PreviewViewportDevice = 'desktop' | 'tablet' | 'mobile' | 'custom';

export type PreviewViewportPresetId =
  | 'desktop'
  | 'desktop-1440'
  | 'desktop-1366'
  | 'tablet'
  | 'mobile';

export type PreviewViewportId = PreviewViewportPresetId | 'custom';

export interface PreviewViewport {
  id: PreviewViewportId;
  device: PreviewViewportDevice;
  width: number | null;
  height: number | null;
}

export type PreviewViewportPreset = PreviewViewport & {
  id: PreviewViewportPresetId;
};

export const PREVIEW_VIEWPORT_MIN_SIZE = 100;
export const PREVIEW_VIEWPORT_MAX_SIZE = 10_000;

export const PREVIEW_VIEWPORT_PRESETS: readonly PreviewViewportPreset[] = [
  { id: 'desktop', device: 'desktop', width: null, height: null },
  { id: 'desktop-1440', device: 'desktop', width: 1440, height: 900 },
  { id: 'desktop-1366', device: 'desktop', width: 1366, height: 768 },
  { id: 'tablet', device: 'tablet', width: 820, height: 1180 },
  { id: 'mobile', device: 'mobile', width: 390, height: 844 },
];

export const DEFAULT_PREVIEW_VIEWPORT = PREVIEW_VIEWPORT_PRESETS[0]!;

export function previewViewportPreset(id: PreviewViewportPresetId): PreviewViewportPreset {
  return PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_PREVIEW_VIEWPORT;
}

export function isFixedPreviewViewport(
  viewport: PreviewViewport,
): viewport is PreviewViewport & { width: number; height: number } {
  return viewport.width !== null && viewport.height !== null;
}

export function customPreviewViewport(width: number, height: number): PreviewViewport {
  return {
    id: 'custom',
    device: 'custom',
    width,
    height,
  };
}

export function swapPreviewViewportOrientation(viewport: PreviewViewport): PreviewViewport {
  if (!isFixedPreviewViewport(viewport)) return viewport;
  return {
    ...viewport,
    width: viewport.height,
    height: viewport.width,
  };
}

export function isValidPreviewViewportDimension(value: number): boolean {
  return Number.isInteger(value)
    && value >= PREVIEW_VIEWPORT_MIN_SIZE
    && value <= PREVIEW_VIEWPORT_MAX_SIZE;
}
