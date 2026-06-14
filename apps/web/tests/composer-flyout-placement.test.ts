// Regression test for the composer plugins-flyout side placement.
//
// Reviewer comment on PR #4000 (nettee/looper): the placement reserve
// (PLUS_MENU_PLUGIN_FLYOUT_WIDTH) was 560 while the rendered flyout is 466px
// wide, so panes with ~664-757px of side room fell back to the contained
// layout and silently dropped the side-by-side preview column. These pin the
// boundary so the constant can't drift away from the CSS width again.

import { describe, expect, it } from 'vitest';
import { resolveFlyoutSide } from '../src/components/composer-flyout-placement';

// Mirror the real call site's fixed inputs.
const MENU_WIDTH = 190;
const GAP = 8;
const PLUGIN_FLYOUT_WIDTH = 466; // must equal PLUS_MENU_PLUGIN_FLYOUT_WIDTH / CSS

describe('resolveFlyoutSide', () => {
  it('places to the right when the rendered width fits', () => {
    // menuLeft 100: needs 100 + 190 + 8 + 466 = 764 <= boundaryRight.
    expect(
      resolveFlyoutSide({
        menuLeft: 100,
        menuWidth: MENU_WIDTH,
        flyoutWidth: PLUGIN_FLYOUT_WIDTH,
        gap: GAP,
        boundaryLeft: 0,
        boundaryRight: 800,
      }),
    ).toBe('right');
  });

  it('does NOT over-reserve: a pane that fits 466 but not 560 still gets the side layout', () => {
    // boundaryRight 770: 466-reserve needs 764 (fits) → right.
    // The old 560 reserve would have needed 858 (miss) → contained (the bug).
    const input = {
      menuLeft: 100,
      menuWidth: MENU_WIDTH,
      gap: GAP,
      boundaryLeft: 0,
      boundaryRight: 770,
    };
    expect(resolveFlyoutSide({ ...input, flyoutWidth: 466 })).toBe('right');
    expect(resolveFlyoutSide({ ...input, flyoutWidth: 560 })).toBe('contained');
  });

  it('flips to the left when the right side does not fit but the left does', () => {
    expect(
      resolveFlyoutSide({
        menuLeft: 600,
        menuWidth: MENU_WIDTH,
        flyoutWidth: PLUGIN_FLYOUT_WIDTH,
        gap: GAP,
        boundaryLeft: 0,
        boundaryRight: 820, // 600+190+8+466=1264 > 820 → not right
      }),
    ).toBe('left'); // 600-8-466=126 >= 0
  });

  it('falls back to contained when neither side fits', () => {
    expect(
      resolveFlyoutSide({
        menuLeft: 300,
        menuWidth: MENU_WIDTH,
        flyoutWidth: PLUGIN_FLYOUT_WIDTH,
        gap: GAP,
        boundaryLeft: 280,
        boundaryRight: 760,
      }),
    ).toBe('contained');
  });
});
