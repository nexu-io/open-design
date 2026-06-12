// Regression test for the design-toolbox hover-detail panel position.
//
// Reviewer comment on PR #4000 (nettee/looper) flagged that on a narrow pane
// the left-side fallback (rect.left - gap - detailWidth) was never clamped, so
// a row near the left edge — or a viewport narrower than detailWidth + gap*2 —
// produced a negative `left` and pushed the position:fixed panel off-screen
// and out of reach. These pin the clamp so a future refactor can't regress it.

import { describe, expect, it } from 'vitest';
import { computeToolboxDetailPosition } from '../src/components/composer-detail-position';

const OPTS = { detailWidth: 264, gap: 8, margin: 8, estimatedHeight: 340 };

describe('computeToolboxDetailPosition', () => {
  it('places the panel to the right of the row when it fits', () => {
    const { left } = computeToolboxDetailPosition(
      { left: 300, right: 540, top: 200 },
      { width: 1440, height: 900 },
      OPTS,
    );
    expect(left).toBe(540 + OPTS.gap); // toRight
  });

  it('flips to the left side when the right side overflows', () => {
    // right edge near the viewport edge → no room on the right.
    const { left } = computeToolboxDetailPosition(
      { left: 900, right: 1300, top: 200 },
      { width: 1440, height: 900 },
      OPTS,
    );
    expect(left).toBe(900 - OPTS.gap - OPTS.detailWidth); // 628, still on-screen
  });

  it('never returns a negative left for a row near the left edge', () => {
    // Right overflows → left fallback would be 20 - 8 - 264 = -252.
    const { left } = computeToolboxDetailPosition(
      { left: 20, right: 1400, top: 200 },
      { width: 1440, height: 900 },
      OPTS,
    );
    expect(left).toBe(OPTS.margin); // clamped to 8, not negative
    expect(left).toBeGreaterThanOrEqual(OPTS.margin);
  });

  it('clamps into a viewport narrower than the panel itself', () => {
    const viewport = { width: 200, height: 600 };
    const { left } = computeToolboxDetailPosition(
      { left: 40, right: 160, top: 100 },
      viewport,
      OPTS,
    );
    // max(8, min(preferred, 200 - 8 - 264)) → max(8, min(_, -72)) → 8.
    expect(left).toBe(OPTS.margin);
    expect(left + OPTS.detailWidth).toBeGreaterThan(viewport.width); // honestly overflows, but stays anchored at the left margin
  });

  it('clamps the top so a tall panel does not spill past the viewport bottom', () => {
    const { top } = computeToolboxDetailPosition(
      { left: 300, right: 540, top: 850 },
      { width: 1440, height: 900 },
      OPTS,
    );
    expect(top).toBe(900 - OPTS.margin - OPTS.estimatedHeight); // 552
  });

  it('keeps the top at the row when there is room', () => {
    const { top } = computeToolboxDetailPosition(
      { left: 300, right: 540, top: 120 },
      { width: 1440, height: 900 },
      OPTS,
    );
    expect(top).toBe(120);
  });
});
