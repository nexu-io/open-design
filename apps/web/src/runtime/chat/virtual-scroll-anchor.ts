export interface VirtualScrollAnchor {
  key: string;
  /** Row top relative to the viewport top. Negative means partly clipped. */
  offset: number;
}

/** Capture the first row that still has visible pixels in the viewport. */
export function captureVirtualScrollAnchor<T extends { key: string }>(
  items: readonly T[],
  offsets: readonly number[],
  sizes: readonly number[],
  scrollTop: number,
): VirtualScrollAnchor | null {
  if (items.length === 0) return null;
  let index = 0;
  while (
    index < items.length - 1
    && (offsets[index] ?? 0) + (sizes[index] ?? 0) <= scrollTop
  ) {
    index += 1;
  }
  const item = items[index];
  if (!item) return null;
  return {
    key: item.key,
    offset: (offsets[index] ?? 0) - scrollTop,
  };
}

/** Restore the captured row to the same viewport offset after remeasurement. */
export function scrollTopForVirtualScrollAnchor<T extends { key: string }>(
  anchor: VirtualScrollAnchor,
  items: readonly T[],
  offsets: readonly number[],
  maxScrollTop: number,
): number | null {
  const index = items.findIndex((item) => item.key === anchor.key);
  if (index < 0) return null;
  return Math.min(
    Math.max(0, maxScrollTop),
    Math.max(0, (offsets[index] ?? 0) - anchor.offset),
  );
}
