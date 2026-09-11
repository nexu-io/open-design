import { describe, expect, test } from 'vitest';

import {
  hasSingleVisualTextLine,
  runDomToPptx,
  visualLineBreakOffsets,
} from '../../src/main/deck-capture.js';

describe('hasSingleVisualTextLine', () => {
  test('accepts several inline fragments that overlap the same visual line', () => {
    expect(
      hasSingleVisualTextLine([
        { top: 20, bottom: 60, width: 280, height: 40 },
        { top: 28, bottom: 58, width: 90, height: 30 },
        { top: 18, bottom: 42, width: 24, height: 24 },
      ]),
    ).toBe(true);
  });

  test('rejects text fragments split across visual lines by CSS wrapping', () => {
    expect(
      hasSingleVisualTextLine([
        { top: 20, bottom: 60, width: 760, height: 40 },
        { top: 66, bottom: 106, width: 690, height: 40 },
        { top: 112, bottom: 152, width: 420, height: 40 },
      ]),
    ).toBe(false);
  });

  test('rejects adjacent glyph boxes that overlap because line-height is tight', () => {
    expect(
      hasSingleVisualTextLine([
        { top: 72, bottom: 229, width: 843, height: 157 },
        { top: 214.8, bottom: 371.8, width: 843, height: 157 },
      ]),
    ).toBe(false);
  });

  test('rejects an empty or non-visible text range', () => {
    expect(hasSingleVisualTextLine([])).toBe(false);
    expect(hasSingleVisualTextLine([{ top: 0, bottom: 0, width: 0, height: 0 }])).toBe(false);
  });
});

describe('visualLineBreakOffsets', () => {
  test('finds rendered line starts in a no-newline CJK heading', () => {
    const text = '没有换行符但依靠宽度自动换行';
    const samples = Array.from(text, (_, offset) => {
      const line = offset < 5 ? 0 : offset < 10 ? 1 : 2;
      return {
        offset,
        rects: [{ top: 20 + line * 48, bottom: 60 + line * 48, width: 42, height: 40 }],
      };
    });

    expect(visualLineBreakOffsets(samples)).toEqual([5, 10]);
  });

  test('ignores invisible glyph samples and same-line inline fragments', () => {
    expect(
      visualLineBreakOffsets([
        { offset: 0, rects: [{ top: 20, bottom: 60, width: 42, height: 40 }] },
        { offset: 1, rects: [{ top: 26, bottom: 58, width: 20, height: 32 }] },
        { offset: 2, rects: [{ top: 0, bottom: 0, width: 0, height: 0 }] },
        { offset: 3, rects: [{ top: 68, bottom: 108, width: 42, height: 40 }] },
      ]),
    ).toEqual([3]);
  });
});

describe('runDomToPptx text-layout wiring', () => {
  test('measures rendered line rectangles before forcing a heading to nowrap', () => {
    const source = runDomToPptx.toString();
    expect(source).toMatch(/range\d*\.selectNodeContents\(el\)/);
    expect(source).toMatch(
      /hasSingleVisualTextLine\(Array\.from\(range\d*\.getClientRects\(\)\)\)/,
    );
  });

  test('materializes rendered line starts as explicit breaks before PPTX export', () => {
    const source = runDomToPptx.toString();
    expect(source).toMatch(/visualLineBreakOffsets\(/);
    expect(source).toMatch(/splitText\(/);
    expect(source).toMatch(/createElement\(["']br["']\)/);
  });

  test('finalizes CJK font metrics before measuring visual line starts', () => {
    const source = runDomToPptx.toString();
    expect(source.lastIndexOf('promoteCjkTypefaces(slides')).toBeLessThan(
      source.lastIndexOf('preserveRenderedTextLines(slides'),
    );
  });
});
