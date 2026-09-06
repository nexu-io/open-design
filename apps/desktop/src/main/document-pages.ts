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
