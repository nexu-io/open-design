import { describe, expect, it } from 'vitest';
import {
  MANUAL_EDIT_MIN_GESTURE_SIZE,
  manualEditActionBarTop,
  manualEditClampedCenter,
  manualEditGestureRect,
  manualEditMovePreviewTransform,
  manualEditMoveStyles,
  manualEditResizeStyles,
  manualEditSpaceScale,
  snapManualEditGestureRect,
} from '../../src/edit-mode/gestures';
import { emptyManualEditStyles } from '../../src/edit-mode/types';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

function positionStyles(position: string, left = '', top = '') {
  return { ...emptyManualEditStyles(), position, left, top };
}

describe('manual edit gesture rects', () => {
  it('moves the whole rect by the pointer delta', () => {
    expect(manualEditGestureRect('move', rect(10, 20, 100, 40), 5, -8)).toEqual(rect(15, 12, 100, 40));
  });

  it('resizes from the right edge and clamps to the minimum width', () => {
    expect(manualEditGestureRect('resize-right', rect(10, 20, 100, 40), 30, 0)).toEqual(rect(10, 20, 130, 40));
    expect(manualEditGestureRect('resize-right', rect(10, 20, 100, 40), -500, 0).width).toBe(MANUAL_EDIT_MIN_GESTURE_SIZE);
  });

  it('resizes from the left edge keeping the right edge anchored', () => {
    const resized = manualEditGestureRect('resize-left', rect(10, 20, 100, 40), 30, 0);
    expect(resized).toEqual(rect(40, 20, 70, 40));
    expect(resized.x + resized.width).toBe(110);
    const clamped = manualEditGestureRect('resize-left', rect(10, 20, 100, 40), 500, 0);
    expect(clamped.width).toBe(MANUAL_EDIT_MIN_GESTURE_SIZE);
    expect(clamped.x + clamped.width).toBe(110);
  });
});

describe('manual edit gesture snapping', () => {
  it('snaps a moved rect to a sibling edge within the threshold and emits a guide', () => {
    const sibling = rect(200, 0, 80, 40);
    const snap = snapManualEditGestureRect('move', rect(197, 100, 100, 40), [sibling]);

    // Left edge 197 is 3px from sibling left 200 → snaps to 200.
    expect(snap.rect.x).toBe(200);
    expect(snap.guides.some((guide) => guide.orientation === 'vertical' && guide.position === 200)).toBe(true);
    // Guide spans both rects.
    const guide = snap.guides.find((item) => item.orientation === 'vertical')!;
    expect(guide.start).toBe(0);
    expect(guide.end).toBe(140);
  });

  it('snaps centers, not just edges', () => {
    const sibling = rect(100, 0, 100, 40); // centerX = 150
    const snap = snapManualEditGestureRect('move', rect(103, 100, 100, 40), [sibling]); // centerX = 153

    expect(snap.rect.x).toBe(100);
  });

  it('leaves the rect alone outside the threshold', () => {
    const snap = snapManualEditGestureRect('move', rect(150, 100, 100, 40), [rect(0, 0, 40, 40)]);

    expect(snap.rect).toEqual(rect(150, 100, 100, 40));
    expect(snap.guides).toHaveLength(0);
  });

  it('resize snapping only adjusts the dragged edge', () => {
    const sibling = rect(0, 0, 204, 40); // right edge 204
    const snap = snapManualEditGestureRect('resize-right', rect(100, 100, 101, 40), [sibling]); // right edge 201

    expect(snap.rect.x).toBe(100);
    expect(snap.rect.width).toBe(104);
  });
});

describe('manual edit gesture style resolution', () => {
  it('turns a flow-element move into a relative offset', () => {
    expect(manualEditMoveStyles(positionStyles('static'), 12, -6)).toEqual({
      position: 'relative',
      left: '12px',
      top: '-6px',
    });
  });

  it('accumulates offsets for already-relative elements', () => {
    expect(manualEditMoveStyles(positionStyles('relative', '10px', '4px'), 5, 5)).toEqual({
      position: 'relative',
      left: '15px',
      top: '9px',
    });
  });

  it('moves absolute elements via left/top and pins right/bottom to auto', () => {
    expect(manualEditMoveStyles(positionStyles('absolute', '100px', '50px'), -20, 10)).toEqual({
      left: '80px',
      top: '60px',
      right: 'auto',
      bottom: 'auto',
    });
  });

  it('treats auto offsets as zero', () => {
    expect(manualEditMoveStyles(positionStyles('absolute', 'auto', 'auto'), 8, 8)).toEqual({
      left: '8px',
      top: '8px',
      right: 'auto',
      bottom: 'auto',
    });
  });

  // An auto-width absolute element shrinks to fit the space right of `left`;
  // without the width pin a rightward move reflows it narrower on release and
  // a translate(-50%) centering makes the element visibly jump.
  it('pins the start width when moving out-of-flow elements', () => {
    expect(manualEditMoveStyles(positionStyles('absolute', '516px', '210px'), 76, 46, 516)).toEqual({
      left: '592px',
      top: '256px',
      right: 'auto',
      bottom: 'auto',
      width: '516px',
    });
    // Flow elements keep their layout slot — no width pin.
    expect(manualEditMoveStyles(positionStyles('static'), 10, 0, 300).width).toBeUndefined();
  });

  it('right-edge resize only writes width', () => {
    expect(
      manualEditResizeStyles('resize-right', positionStyles('static'), rect(10, 10, 100, 40), rect(10, 10, 130, 40)),
    ).toEqual({ width: '130px' });
  });

  it('left-edge resize pairs width with a horizontal shift and no vertical offset', () => {
    const resolved = manualEditResizeStyles(
      'resize-left',
      positionStyles('static'),
      rect(10, 10, 100, 40),
      rect(30, 10, 80, 40),
    );

    expect(resolved.width).toBe('80px');
    expect(resolved.position).toBe('relative');
    expect(resolved.left).toBe('20px');
    expect(resolved.top).toBeUndefined();
  });

  // display:inline elements (spans, links) ignore `width`; without the
  // inline-block upgrade the committed width persists to source but the user
  // sees nothing change — the "drag left/right does nothing" bug.
  it('upgrades inline elements to inline-block so the resized width applies', () => {
    const inline = { ...positionStyles('static'), display: 'inline' };
    expect(
      manualEditResizeStyles('resize-right', inline, rect(10, 10, 100, 40), rect(10, 10, 130, 40)),
    ).toEqual({ width: '130px', display: 'inline-block' });

    const left = manualEditResizeStyles('resize-left', inline, rect(10, 10, 100, 40), rect(30, 10, 80, 40));
    expect(left.display).toBe('inline-block');
    expect(left.width).toBe('80px');
  });

  it('leaves non-inline displays untouched on resize', () => {
    for (const display of ['block', 'inline-block', 'flex', 'inline-flex', 'grid', '']) {
      const resolved = manualEditResizeStyles(
        'resize-right',
        { ...positionStyles('static'), display },
        rect(10, 10, 100, 40),
        rect(10, 10, 130, 40),
      );
      expect(resolved.display).toBeUndefined();
    }
  });
});

describe('manual edit move preview transform', () => {
  // An inline `translate(dx,dy)` alone would override an authored transform
  // (e.g. translate(-50%,-50%) centering) — the element would jump at drag
  // start and again at release when the authored transform came back.
  it('prepends the drag offset to the authored transform', () => {
    expect(manualEditMovePreviewTransform(12, -6, 'translate(-50%, -50%)'))
      .toBe('translate(12px, -6px) translate(-50%, -50%)');
    expect(manualEditMovePreviewTransform(0.5, 0, 'matrix(1, 0, 0, 1, -190, -95)'))
      .toBe('translate(0.5px, 0px) matrix(1, 0, 0, 1, -190, -95)');
  });

  it('drops a none/empty authored transform', () => {
    expect(manualEditMovePreviewTransform(5, 5, 'none')).toBe('translate(5px, 5px)');
    expect(manualEditMovePreviewTransform(5, 5, '')).toBe('translate(5px, 5px)');
    expect(manualEditMovePreviewTransform(5, 5, undefined)).toBe('translate(5px, 5px)');
  });
});

// A deck stage fits its 1920x1080 slides by scaling a wrapper, so a slide
// element's rect is measured in screen pixels while its left/top/width are
// authored in unscaled slide pixels. Writing the screen delta straight into
// those styles moves the element by only `scale` of what the user dragged —
// it trails the cursor and lands short of the drop point — and a widened text
// box never gets wide enough to pull its text onto one line.
describe('manual edit gestures in a scaled coordinate space', () => {
  const half = { x: 0.5, y: 0.5 };

  it('converts a move delta into the element own pixel space', () => {
    expect(manualEditMoveStyles(positionStyles('absolute', '100px', '50px'), 200, 80, undefined, half))
      .toEqual({ left: '500px', top: '210px', right: 'auto', bottom: 'auto' });
    expect(manualEditMoveStyles(positionStyles('static'), 200, 80, undefined, half))
      .toEqual({ position: 'relative', left: '400px', top: '160px' });
  });

  it('unscales the pinned width so an absolute element does not shrink on release', () => {
    expect(manualEditMoveStyles(positionStyles('absolute', '0px', '0px'), 0, 0, 300, half).width)
      .toBe('600px');
  });

  it('unscales a resize so the box reaches the width the handle was dragged to', () => {
    // Handle dragged out to 880 screen px on a half-scale stage: the element
    // needs 1760 of its own pixels, not 880, to reflow onto one line.
    expect(manualEditResizeStyles(
      'resize-right',
      positionStyles('static'),
      rect(0, 0, 400, 200),
      rect(0, 0, 880, 200),
      half,
    )).toEqual({ width: '1760px' });
  });

  it('unscales the offset a left-edge resize commits alongside the width', () => {
    expect(manualEditResizeStyles(
      'resize-left',
      positionStyles('absolute', '200px', '40px'),
      rect(100, 0, 400, 200),
      rect(40, 0, 460, 200),
      half,
    )).toEqual({ left: '80px', right: 'auto', width: '920px' });
  });

  it('previews the move with the same unscaled offset the commit will write', () => {
    expect(manualEditMovePreviewTransform(200, 80, 'none', half))
      .toBe('translate(400px, 160px)');
    expect(manualEditMovePreviewTransform(200, 80, 'translate(-50%, -50%)', half))
      .toBe('translate(400px, 160px) translate(-50%, -50%)');
  });

  it('leaves an unscaled space untouched', () => {
    expect(manualEditMoveStyles(positionStyles('static'), 12, -6, undefined, { x: 1, y: 1 }))
      .toEqual(manualEditMoveStyles(positionStyles('static'), 12, -6));
  });

  it('degrades a missing or nonsense scale to 1 instead of teleporting', () => {
    expect(manualEditSpaceScale(undefined)).toEqual({ x: 1, y: 1 });
    expect(manualEditSpaceScale({ x: 0, y: Number.NaN })).toEqual({ x: 1, y: 1 });
    expect(manualEditSpaceScale({ x: 1e6, y: -3 })).toEqual({ x: 1, y: 1 });
    expect(manualEditSpaceScale({ x: 0.625, y: 0.625 })).toEqual({ x: 0.625, y: 0.625 });
  });
});

describe('manual edit floating bar clamping', () => {
  it('keeps a translateX(-50%) bar fully inside the canvas', () => {
    // Bar of 200px in a 1000px canvas: center must stay in [106, 894].
    expect(manualEditClampedCenter(30, 200, 1000)).toBe(106);
    expect(manualEditClampedCenter(500, 200, 1000)).toBe(500);
    expect(manualEditClampedCenter(990, 200, 1000)).toBe(894);
  });

  it('centers the bar when the canvas is narrower than the bar', () => {
    expect(manualEditClampedCenter(10, 400, 300)).toBe(150);
  });

  it('only guards the left edge when the canvas size is unknown', () => {
    expect(manualEditClampedCenter(-50, 200, undefined)).toBe(106);
    expect(manualEditClampedCenter(800, 200, undefined)).toBe(800);
  });
});

describe('manual edit action bar vertical placement', () => {
  const BAR = 34;
  const GAP = 8;

  it('sits above the frame when there is room, clearing the move pill', () => {
    // Frame at y=300 in an 800px canvas: bar goes above with the gap.
    expect(manualEditActionBarTop(300, 80, BAR, GAP, 800)).toEqual({
      top: 300 - BAR - GAP,
      placement: 'above',
    });
  });

  it('flips below when the element hugs the top edge', () => {
    // Frame at y=6: no room for the bar above, so drop it under the frame.
    expect(manualEditActionBarTop(6, 40, BAR, GAP, 800)).toEqual({
      top: 6 + 40 + GAP,
      placement: 'below',
    });
  });

  it('clamps inside the canvas when the element is taller than either side allows', () => {
    // Frame fills the canvas top-to-bottom: neither above nor below fits, so
    // keep the bar on-canvas biased to the top rather than off-screen.
    const placement = manualEditActionBarTop(2, 780, BAR, GAP, 800);
    expect(placement.placement).toBe('above');
    expect(placement.top).toBeGreaterThanOrEqual(4);
    expect(placement.top).toBeLessThanOrEqual(800 - 4 - BAR);
  });

  it('still flips below rather than covering the element when canvas height is unknown', () => {
    expect(manualEditActionBarTop(5, 40, BAR, GAP, undefined)).toEqual({
      top: 5 + 40 + GAP,
      placement: 'below',
    });
  });
});

// Corner anchors scale an image from any corner while the OPPOSITE corner
// stays anchored, so "drag a corner to make it bigger/smaller" behaves like
// every canvas tool the user already knows. The ratio is locked — an image
// never distorts mid-gesture.
describe('manual edit corner gestures (aspect-locked scaling)', () => {
  it('scales from the se corner anchored at the top-left, keeping the ratio', () => {
    expect(manualEditGestureRect('resize-se', rect(10, 20, 200, 100), 100, 0))
      .toEqual(rect(10, 20, 300, 150));
  });

  it('scales from the nw corner anchored at the bottom-right', () => {
    const resized = manualEditGestureRect('resize-nw', rect(10, 20, 200, 100), -100, 0);
    expect(resized.width).toBe(300);
    expect(resized.height).toBe(150);
    expect(resized.x + resized.width).toBe(210);
    expect(resized.y + resized.height).toBe(120);
  });

  it('lets the dominant axis drive the scale so vertical drags work too', () => {
    const resized = manualEditGestureRect('resize-se', rect(0, 0, 200, 100), 0, 50);
    expect(resized.width).toBe(300);
    expect(resized.height).toBe(150);
  });

  it('floors the LARGER dimension at the minimum size with the ratio intact', () => {
    const resized = manualEditGestureRect('resize-se', rect(0, 0, 200, 100), -1000, 0);
    expect(resized.width).toBe(MANUAL_EDIT_MIN_GESTURE_SIZE);
    expect(resized.height).toBe(MANUAL_EDIT_MIN_GESTURE_SIZE / 2);
  });

  it('never snaps a corner gesture — snapping one edge would break the ratio', () => {
    const snap = snapManualEditGestureRect('resize-se', rect(0, 0, 199, 100), [rect(200, 0, 50, 40)]);
    expect(snap.rect).toEqual(rect(0, 0, 199, 100));
    expect(snap.guides).toHaveLength(0);
  });

  it('persists width AND height for a corner resize', () => {
    expect(
      manualEditResizeStyles('resize-se', positionStyles('static'), rect(10, 10, 200, 100), rect(10, 10, 300, 150)),
    ).toEqual({ width: '300px', height: '150px' });
  });

  it('shifts the element when a north/west corner moves the origin', () => {
    const resolved = manualEditResizeStyles(
      'resize-nw',
      positionStyles('absolute', '100px', '50px'),
      rect(100, 50, 200, 100),
      rect(50, 25, 250, 125),
    );
    expect(resolved.width).toBe('250px');
    expect(resolved.height).toBe('125px');
    expect(resolved.left).toBe('50px');
    expect(resolved.top).toBe('25px');
  });

  it('unscales corner dimensions into the element own pixel space', () => {
    expect(manualEditResizeStyles(
      'resize-se',
      positionStyles('static'),
      rect(0, 0, 200, 100),
      rect(0, 0, 300, 150),
      { x: 0.5, y: 0.5 },
    )).toEqual({ width: '600px', height: '300px' });
  });
});

// white-space: nowrap keeps text on one line no matter how narrow the box
// gets — a narrowed heading just overflowed its own new width (the "拖拽边框
// 内容没有换行" report). Resizing declares "content should flow inside THIS
// box", so the gesture unlocks wrapping alongside the width.
describe('manual edit resize wrap unlocking', () => {
  it('turns nowrap into normal so narrowed text wraps instead of overflowing', () => {
    const nowrap = { ...positionStyles('static'), whiteSpace: 'nowrap' };
    expect(
      manualEditResizeStyles('resize-right', nowrap, rect(10, 10, 200, 40), rect(10, 10, 120, 40)).whiteSpace,
    ).toBe('normal');
    const left = manualEditResizeStyles('resize-left', nowrap, rect(10, 10, 200, 40), rect(90, 10, 120, 40));
    expect(left.whiteSpace).toBe('normal');
  });

  it('softens pre to pre-wrap and leaves wrapping values untouched', () => {
    const pre = { ...positionStyles('static'), whiteSpace: 'pre' };
    expect(
      manualEditResizeStyles('resize-right', pre, rect(0, 0, 200, 40), rect(0, 0, 120, 40)).whiteSpace,
    ).toBe('pre-wrap');
    for (const value of ['normal', 'pre-wrap', 'pre-line', '']) {
      const styles = { ...positionStyles('static'), whiteSpace: value };
      expect(
        manualEditResizeStyles('resize-right', styles, rect(0, 0, 200, 40), rect(0, 0, 120, 40)).whiteSpace,
      ).toBeUndefined();
    }
  });
});
