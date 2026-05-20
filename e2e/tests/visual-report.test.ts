import { describe, expect, test } from 'vitest';

import { PNG } from 'pngjs';

import {
  assertPngPixels,
  diffBoxesFromMask,
  drawBox,
  mergeDiffBoxes,
  padBox,
  type DiffBox,
} from '../scripts/visual-report.js';

describe('visual report PNG sizing', () => {
  test('rejects normalized diff canvases that exceed the pixel ceiling', () => {
    expect(() => assertPngPixels(4_000, 900, 'main.png')).not.toThrow();
    expect(() => assertPngPixels(900, 4_000, 'pr.png')).not.toThrow();
    expect(() => assertPngPixels(4_000, 4_000, 'main.png vs pr.png normalized diff canvas')).toThrow(
      /maximum allowed is 4000000 pixels/,
    );
  });
});

describe('visual diff box extraction', () => {
  test('returns one box for a single contiguous region', () => {
    const mask = createMask(6, 5, [[1, 1], [2, 1], [2, 2], [3, 2]]);

    expect(diffBoxesFromMask(mask)).toEqual([{ minX: 1, minY: 1, maxX: 3, maxY: 2 }]);
  });

  test('returns distinct boxes for disjoint regions', () => {
    const mask = createMask(7, 5, [[0, 1], [1, 1], [5, 3], [5, 4]]);

    expect(diffBoxesFromMask(mask)).toEqual([
      { minX: 0, minY: 1, maxX: 1, maxY: 1 },
      { minX: 5, minY: 3, maxX: 5, maxY: 4 },
    ]);
  });

  test('returns no boxes for an empty mask', () => {
    expect(diffBoxesFromMask(createMask(3, 3, []))).toEqual([]);
  });

  test('collapses to the overall bounding box when region count exceeds the cap', () => {
    const pixels = Array.from({ length: 2_001 }, (_, index) => [index * 2, 0] as const);

    expect(diffBoxesFromMask(createMask(4_001, 1, pixels))).toEqual([{ minX: 0, minY: 0, maxX: 4_000, maxY: 0 }]);
  });
});

describe('visual diff box merging and drawing', () => {
  test('merges nearby regions into one box', () => {
    const boxes: DiffBox[] = [
      { minX: 1, minY: 1, maxX: 2, maxY: 2 },
      { minX: 12, minY: 1, maxX: 13, maxY: 2 },
    ];

    expect(mergeDiffBoxes(boxes, 10)).toEqual([{ minX: 1, minY: 1, maxX: 13, maxY: 2 }]);
  });

  test('keeps boxes separate when they are just beyond the merge distance', () => {
    const boxes: DiffBox[] = [
      { minX: 1, minY: 1, maxX: 2, maxY: 2 },
      { minX: 15, minY: 1, maxX: 16, maxY: 2 },
    ];

    expect(mergeDiffBoxes(boxes, 12)).toEqual(boxes);
  });

  test('pads boxes within image bounds', () => {
    expect(padBox({ minX: 2, minY: 3, maxX: 4, maxY: 5 }, 6, 8, 10)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 7,
      maxY: 9,
    });
  });

  test('draws a clamped stroke around the box', () => {
    const png = new PNG({ width: 4, height: 4 });

    drawBox(png, { minX: 1, minY: 1, maxX: 2, maxY: 2 }, 3);

    expect(redPixels(png).sort()).toEqual([
      '1,1',
      '1,2',
      '2,1',
      '2,2',
    ]);
  });
});

function createMask(width: number, height: number, pixels: ReadonlyArray<readonly [number, number]>): PNG {
  const png = new PNG({ width, height });
  for (const [x, y] of pixels) {
    const index = (png.width * y + x) << 2;
    png.data[index] = 255;
    png.data[index + 1] = 0;
    png.data[index + 2] = 0;
    png.data[index + 3] = 255;
  }
  return png;
}

function redPixels(png: PNG): string[] {
  const pixels: string[] = [];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2;
      if (
        png.data[index] === 255
        && png.data[index + 1] === 0
        && png.data[index + 2] === 0
        && png.data[index + 3] === 255
      ) {
        pixels.push(`${x},${y}`);
      }
    }
  }
  return pixels;
}
