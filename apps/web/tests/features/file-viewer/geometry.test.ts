import { describe, expect, it } from 'vitest';

import {
  rgbToHex,
  pxToNumber,
  clamp,
  isClosedLoop,
  rectContains,
  pathIntersectsRect,
  pointInPolygon,
} from '../../../src/features/file-viewer/rules';
import type { StrokePoint } from '../../../src/features/file-viewer/types';

describe('rgbToHex', () => {
  it('defaults to black for missing/empty input', () => {
    expect(rgbToHex(undefined)).toBe('#000000');
    expect(rgbToHex('')).toBe('#000000');
  });

  it('passes through a 6-digit hex verbatim', () => {
    expect(rgbToHex('#1a2b3c')).toBe('#1a2b3c');
  });

  it('expands a 3-digit hex to 6 digits', () => {
    expect(rgbToHex('#abc')).toBe('#aabbcc');
  });

  it('converts rgb()/rgba() to #rrggbb and clamps out-of-range channels', () => {
    expect(rgbToHex('rgb(40, 50, 60)')).toBe('#28323c');
    expect(rgbToHex('rgba(300, 5, 128, 0.5)')).toBe('#ff0580');
  });

  it('returns black for an unrecognized value', () => {
    expect(rgbToHex('not-a-color')).toBe('#000000');
    expect(rgbToHex('#12')).toBe('#000000');
  });
});

describe('pxToNumber', () => {
  it('returns 0 for missing input', () => {
    expect(pxToNumber(undefined)).toBe(0);
    expect(pxToNumber('')).toBe(0);
  });

  it('parses a leading non-negative number, ignoring the unit', () => {
    expect(pxToNumber('12px')).toBe(12);
    expect(pxToNumber('  3.5rem ')).toBe(3.5);
  });

  it('rejects a negative or non-numeric leading value', () => {
    expect(pxToNumber('-12px')).toBe(0);
    expect(pxToNumber('auto')).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps to the [lo, hi] range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('isClosedLoop', () => {
  it('requires at least 4 points', () => {
    expect(isClosedLoop([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }])).toBe(false);
  });

  it('is closed when the endpoints are within 28px', () => {
    const pts: StrokePoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 5, y: 5 },
    ];
    expect(isClosedLoop(pts)).toBe(true);
  });

  it('is open when the endpoints are far apart', () => {
    const pts: StrokePoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 200, y: 200 },
    ];
    expect(isClosedLoop(pts)).toBe(false);
  });
});

describe('rectContains', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  it('is true when inner is fully inside outer', () => {
    expect(rectContains(outer, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
  });

  it('is false when inner spills past any edge', () => {
    expect(rectContains(outer, { x: -1, y: 10, width: 20, height: 20 })).toBe(false);
    expect(rectContains(outer, { x: 90, y: 10, width: 20, height: 20 })).toBe(false);
  });
});

describe('pathIntersectsRect', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };

  it('is false for an empty path', () => {
    expect(pathIntersectsRect([], rect)).toBe(false);
  });

  it('is true when a vertex lands inside the rect', () => {
    expect(pathIntersectsRect([{ x: 50, y: 50 }], rect)).toBe(true);
  });

  it('is true when a segment crosses an edge without any vertex inside', () => {
    // A single segment passing straight through the box, endpoints outside.
    expect(pathIntersectsRect([{ x: -50, y: 50 }, { x: 150, y: 50 }], rect)).toBe(true);
  });

  it('is false when the whole path clears the rect', () => {
    expect(pathIntersectsRect([{ x: 200, y: 200 }, { x: 300, y: 300 }], rect)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  const square: StrokePoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('is true for a point inside the polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  it('is false for a point outside the polygon', () => {
    expect(pointInPolygon({ x: 20, y: 5 }, square)).toBe(false);
  });
});
