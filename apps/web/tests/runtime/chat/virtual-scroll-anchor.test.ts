import { describe, expect, it } from 'vitest';
import {
  captureVirtualScrollAnchor,
  scrollTopForVirtualScrollAnchor,
} from '../../../src/runtime/chat/virtual-scroll-anchor';

const items = Array.from({ length: 100 }, (_, index) => ({ key: `message:${index}` }));

describe('measured chat virtual-window anchoring', () => {
  it('preserves the first-visible key and clipped offset when earlier rows remeasure', () => {
    const oldOffsets = items.map((_, index) => index * 100);
    const oldSizes = items.map(() => 100);
    const anchor = captureVirtualScrollAnchor(items, oldOffsets, oldSizes, 5_250);

    expect(anchor).toEqual({ key: 'message:52', offset: -50 });

    // Ten earlier rows grew by 12px each after async media/tool content
    // measured. message:52 should remain clipped by the same 50px.
    const newOffsets = items.map((_, index) => index * 100 + Math.min(index, 10) * 12);
    expect(scrollTopForVirtualScrollAnchor(anchor!, items, newOffsets, 9_720)).toBe(5_370);
  });

  it('does not move when only rows below the first-visible key change', () => {
    const offsets = items.map((_, index) => index * 100);
    const sizes = items.map(() => 100);
    const anchor = captureVirtualScrollAnchor(items, offsets, sizes, 5_250);
    const offsetsWithLaterGrowth = offsets.map((offset, index) =>
      index > 60 ? offset + (index - 60) * 50 : offset,
    );

    expect(scrollTopForVirtualScrollAnchor(anchor!, items, offsetsWithLaterGrowth, 12_000)).toBe(
      5_250,
    );
  });

  it('clamps the restored position when content shrink moves the natural bottom upward', () => {
    const offsets = items.map((_, index) => index * 100);
    const sizes = items.map(() => 100);
    const anchor = captureVirtualScrollAnchor(items, offsets, sizes, 9_450);

    expect(scrollTopForVirtualScrollAnchor(anchor!, items, offsets, 9_200)).toBe(9_200);
  });
});
