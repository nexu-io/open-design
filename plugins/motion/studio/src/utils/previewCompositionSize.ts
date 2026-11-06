export interface PreviewCompositionSize {
  width: number;
  height: number;
}

/** The root composition's authored size, read from the preview document itself. */
// fallow-ignore-next-line complexity
export function readPreviewCompositionSize(
  iframe: HTMLIFrameElement | null,
): PreviewCompositionSize | null {
  try {
    const doc = iframe?.contentDocument;
    const root =
      doc?.querySelector("[data-composition-id][data-width][data-height]") ??
      doc?.querySelector("[data-width][data-height]");
    if (!root) return null;
    const width = Number.parseInt(root.getAttribute("data-width") ?? "", 10);
    const height = Number.parseInt(root.getAttribute("data-height") ?? "", 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}
