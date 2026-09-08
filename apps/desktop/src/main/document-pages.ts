/** Runs inside the export renderer. Authored paper boundaries opt into PDF capture. */
export function measureDocumentPages(): Array<{ x: number; y: number; width: number; height: number }> {
  const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-od-document-page]'));
  if (pages.length > 100) throw new Error('Document export supports at most 100 pages');
  return pages.map((page) => {
    const rect = page.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 4096 || rect.height > 8192) {
      throw new Error('Invalid document page dimensions');
    }
    if (page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) {
      throw new Error('Document content exceeds its paper boundary; adjust the layout before exporting');
    }
    // Check descendants too: overflow:hidden must not turn a layout error into lost content.
    for (const child of Array.from(page.querySelectorAll<HTMLElement>('*'))) {
      if (child.closest('svg') || getComputedStyle(child).position === 'absolute') continue;
      const box = child.getBoundingClientRect();
      if (box.width && box.height && (box.bottom > rect.bottom + 1 || box.right > rect.right + 1)) {
        throw new Error('Document content exceeds its paper boundary; adjust the layout before exporting');
      }
    }
    return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
  });
}

/** Match the existing page/deck stitchers: never reserve more than 320 MiB of raw RGBA pixels. */
export const DOCUMENT_CAPTURE_MAX_BYTES = 320 * 1024 * 1024;

/**
 * CDP multiplies clip.scale by the renderer DPR. Cap the effective output at
 * two physical pixels per CSS pixel without double-scaling Retina displays.
 */
export function documentCaptureScale(devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(2, 2 / dpr);
}

/** Estimate the decoded RGBA footprint before asking Chromium to allocate screenshots. */
export function documentCaptureBytes(
  pages: Array<{ width: number; height: number }>,
  devicePixelRatio: number,
): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const pixelScale = dpr * documentCaptureScale(dpr);
  return pages.reduce((total, page) => {
    const width = Math.max(1, Math.ceil(page.width * pixelScale));
    const height = Math.max(1, Math.ceil(page.height * pixelScale));
    return total + width * height * 4;
  }, 0);
}
