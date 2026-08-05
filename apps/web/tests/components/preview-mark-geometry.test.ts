import { describe, expect, it } from 'vitest';

import {
  reanchorNormalizedPoint,
  reanchorNormalizedRect,
  shouldReanchorMarks,
} from '../../src/components/preview-mark-geometry';

// Issue #6361. See preview-mark-geometry.ts for why the two axes differ.

describe('shouldReanchorMarks', () => {
  it('re-anchors only when the frame actually changed height', () => {
    expect(shouldReanchorMarks({ w: 692, h: 666 }, { w: 804, h: 744 })).toBe(true);
    // A pure width change leaves every vertical offset where it is.
    expect(shouldReanchorMarks({ w: 692, h: 666 }, { w: 804, h: 666 })).toBe(false);
    expect(shouldReanchorMarks({ w: 692, h: 666 }, { w: 692, h: 666 })).toBe(false);
  });

  it('treats a frame with no measured height as nothing to convert from', () => {
    // The first resize pass runs before any mark exists; there is no prior
    // frame to preserve pixel offsets against.
    expect(shouldReanchorMarks({ w: 0, h: 0 }, { w: 804, h: 744 })).toBe(false);
    expect(shouldReanchorMarks({ w: 692, h: 666 }, { w: 0, h: 0 })).toBe(false);
    expect(shouldReanchorMarks({ w: 692, h: Number.NaN }, { w: 804, h: 744 })).toBe(false);
  });
});

describe('reanchorNormalizedRect', () => {
  it('keeps the marked band on the same artifact pixels', () => {
    // The measured repro: a 322..362px band marked in a 666px-tall frame, then
    // the frame is restored to 744px.
    const marked = { x: 0.058, y: 322 / 666, width: 0.809, height: 40 / 666 };
    const moved = reanchorNormalizedRect(marked, { w: 692, h: 666 }, { w: 804, h: 744 });

    expect(moved.y * 744).toBeCloseTo(322, 5);
    expect(moved.height * 744).toBeCloseTo(40, 5);
  });

  it('leaves the horizontal axis alone, because a block box tracks the frame width', () => {
    const marked = { x: 0.25, y: 0.5, width: 0.5, height: 0.1 };
    const moved = reanchorNormalizedRect(marked, { w: 692, h: 666 }, { w: 804, h: 744 });

    expect(moved.x).toBe(0.25);
    expect(moved.width).toBe(0.5);
  });

  it('is reversible across a zoom in / zoom out round trip', () => {
    const small = { w: 692, h: 666 };
    const large = { w: 804, h: 744 };
    const marked = { x: 0.1, y: 0.4, width: 0.5, height: 0.08 };

    const out = reanchorNormalizedRect(marked, small, large);
    const back = reanchorNormalizedRect(out, large, small);

    expect(back.y).toBeCloseTo(marked.y, 10);
    expect(back.height).toBeCloseTo(marked.height, 10);
  });

  it('clamps a mark that a shrinking frame would push past its bottom edge', () => {
    const marked = { x: 0, y: 0.9, width: 1, height: 0.1 };
    const moved = reanchorNormalizedRect(marked, { w: 800, h: 1000 }, { w: 800, h: 400 });

    expect(moved.y).toBe(1);
    expect(moved.height).toBe(0);
    expect(moved.y + moved.height).toBeLessThanOrEqual(1);
  });

  it('returns the mark untouched when there is nothing to convert', () => {
    const marked = { x: 0.1, y: 0.4, width: 0.5, height: 0.08 };
    expect(reanchorNormalizedRect(marked, { w: 692, h: 666 }, { w: 804, h: 666 })).toBe(marked);
  });
});

describe('reanchorNormalizedPoint', () => {
  it('preserves a pen points pixel offset from the top of the frame', () => {
    const moved = reanchorNormalizedPoint({ x: 0.3, y: 500 / 666 }, { w: 692, h: 666 }, { w: 804, h: 744 });

    expect(moved.x).toBe(0.3);
    expect(moved.y * 744).toBeCloseTo(500, 5);
  });

  it('clamps rather than letting a point escape the frame', () => {
    const moved = reanchorNormalizedPoint({ x: 0.3, y: 0.95 }, { w: 800, h: 1000 }, { w: 800, h: 500 });
    expect(moved.y).toBe(1);
  });
});
