import { describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import {
  HIDE_CHROME_SELECTOR,
  activeSlideCaptureOffsetTransform,
  measureAuthoredSlideBox,
  paginateViewportBand,
  readDomToPptxBundleFile,
  requestedRenderSize,
  runDomToPptx,
  scrollStitchGeometry,
  scrollStitchRowOffset,
  shouldCapturePageAsJpeg,
  shouldCaptureAsDeck,
  solidBgraBuffer,
} from '../../src/main/deck-capture.js';

const gzipAsync = promisify(gzip);

// Full-page scroll-stitch geometry must use the REAL captured device width and
// its true (possibly fractional) pixel ratio. A previous version rounded the
// ratio to an integer, which corrupted output width + row placement on non-
// retina display scaling (125% / 150%).
const PAGE_W = 1440;

describe('scrollStitchGeometry', () => {
  test('retina (2x) — integer ratio', () => {
    const g = scrollStitchGeometry(2880, 5000, PAGE_W);
    expect(g.dpr).toBe(2);
    expect(g.width).toBe(2880);
    expect(g.height).toBe(10000);
  });

  test('125% scaling (1.25x) — fractional ratio is NOT rounded to 1', () => {
    const g = scrollStitchGeometry(1800, 5000, PAGE_W);
    expect(g.dpr).toBeCloseTo(1.25, 5);
    expect(g.width).toBe(1800); // real device width, not PAGE_W*round(1.25)=1440
    expect(g.height).toBe(6250); // round(5000 * 1.25)
  });

  test('150% scaling (1.5x)', () => {
    const g = scrollStitchGeometry(2160, 4000, PAGE_W);
    expect(g.dpr).toBeCloseTo(1.5, 5);
    expect(g.width).toBe(2160);
    expect(g.height).toBe(6000);
  });

  test('1x (no scaling)', () => {
    const g = scrollStitchGeometry(1440, 3000, PAGE_W);
    expect(g.dpr).toBe(1);
    expect(g.width).toBe(1440);
    expect(g.height).toBe(3000);
  });
});

describe('shouldCaptureAsDeck', () => {
  test('an ordinary page with .slide markup but deck:false captures as a page', () => {
    // The regression: a non-deck HTML page (carousel/testimonial `.slide`) sent
    // with an explicit deck:false must NOT be captured per-slide.
    expect(shouldCaptureAsDeck(true, false)).toBe(false);
  });
  test('an explicit deck with slides captures as a deck', () => {
    expect(shouldCaptureAsDeck(true, true)).toBe(true);
  });
  test('no slides is never a deck', () => {
    expect(shouldCaptureAsDeck(false, true)).toBe(false);
    expect(shouldCaptureAsDeck(false, undefined)).toBe(false);
  });
  test('no signal falls back to the slide-count heuristic', () => {
    expect(shouldCaptureAsDeck(true, undefined)).toBe(true);
  });
});

describe('shouldCapturePageAsJpeg', () => {
  test('paginated page-mode PDF defaults to JPEG after deck detection', () => {
    expect(shouldCapturePageAsJpeg(undefined, true)).toBe(true);
  });

  test('non-paginated captures stay PNG unless explicitly requested', () => {
    expect(shouldCapturePageAsJpeg(undefined, false)).toBe(false);
    expect(shouldCapturePageAsJpeg('jpeg', false)).toBe(true);
  });
});

describe('requestedRenderSize', () => {
  test('uses requested dimensions with defaults for omitted axes', () => {
    expect(requestedRenderSize(1280, 720, 1440, 1000)).toEqual({ w: 1280, h: 720 });
    expect(requestedRenderSize(1280, undefined, 1440, 1000)).toEqual({ w: 1280, h: 1000 });
    expect(requestedRenderSize(undefined, 720, 1440, 1000)).toEqual({ w: 1440, h: 720 });
  });
});

describe('deck capture DOM prep', () => {
  test('does not hide generic authored notes or overview content classes', () => {
    expect(HIDE_CHROME_SELECTOR.split(/\s*,\s*/)).not.toContain('.notes');
    expect(HIDE_CHROME_SELECTOR.split(/\s*,\s*/)).not.toContain('.overview');
    expect(HIDE_CHROME_SELECTOR).toContain('.notes-overlay');
    expect(HIDE_CHROME_SELECTOR).toContain('aside.notes');
    expect(HIDE_CHROME_SELECTOR).toContain('.speaker-notes');
  });

  test('off-stage slide fallback offsets the capture clone instead of clearing transforms', () => {
    expect(activeSlideCaptureOffsetTransform({ x: 3840, y: -120 })).toBe(
      'translate(-3840px, 120px)',
    );
  });
});

describe('readDomToPptxBundleFile', () => {
  test('reads the checked-in gzip bundle format directly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-design-dom-to-pptx-'));
    try {
      const file = join(root, 'dom-to-pptx.bundle.js.gz');
      await writeFile(file, await gzipAsync('window.domToPptx = {};'));
      await expect(readDomToPptxBundleFile(file)).resolves.toBe('window.domToPptx = {};');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe('runDomToPptx background stabilization', () => {
  test('keeps gradient or image-backed slide backgrounds on the injected layer', () => {
    const source = runDomToPptx.toString();
    expect(source).toContain('bg.style.setProperty("background-image", background.image');
    expect(source).not.toContain('bg.style.setProperty("background-image", "none"');
  });
});

describe('measureAuthoredSlideBox', () => {
  function fakeElement(opts: {
    attrs?: Record<string, string | null>;
    style?: { width?: string; height?: string };
    offsetWidth?: number;
    offsetHeight?: number;
    stage?: HTMLElement | null;
  }): HTMLElement {
    return {
      closest: (selector: string) => (selector === 'deck-stage' ? opts.stage ?? null : null),
      getAttribute: (name: string) => opts.attrs?.[name] ?? null,
      style: opts.style ?? {},
      offsetWidth: opts.offsetWidth ?? 0,
      offsetHeight: opts.offsetHeight ?? 0,
    } as unknown as HTMLElement;
  }

  test('uses deck-stage authored design dimensions instead of preview-scaled slide rects', () => {
    const stage = {
      designWidth: 1280,
      designHeight: 720,
      getAttribute: () => null,
    } as unknown as HTMLElement;
    const slide = fakeElement({
      stage,
      // A transformed preview could report 960x540 via getBoundingClientRect();
      // the authored export geometry must still come from deck-stage.
      offsetWidth: 960,
      offsetHeight: 540,
    });
    expect(measureAuthoredSlideBox(slide)).toEqual({ w: 1280, h: 720 });
  });

  test('falls back to deck-stage width/height attributes', () => {
    const stage = fakeElement({ attrs: { width: '1024', height: '768' } });
    expect(measureAuthoredSlideBox(fakeElement({ stage }))).toEqual({ w: 1024, h: 768 });
  });

  test('uses declared slide dimensions before transformed layout fallback', () => {
    const slide = fakeElement({
      style: { width: '1600px', height: '900px' },
      offsetWidth: 800,
      offsetHeight: 450,
    });
    expect(measureAuthoredSlideBox(slide)).toEqual({ w: 1600, h: 900 });
  });
});

// The PDF path paginates a long non-deck page into one image per viewport
// (PAGE_VIEW_H = 1000). paginateViewportBand picks the viewport sub-rectangle
// for each page so the pages tile the document exactly — no overlap, no gap —
// even when the final page can't scroll a full viewport (it captures the
// remaining rows from a lower offset inside the clamped viewport).
describe('paginateViewportBand', () => {
  test('full viewport pages until the clamped remainder (2500px → 1000+1000+500)', () => {
    // maxScroll = 2500 - 1000 = 1500.
    expect(paginateViewportBand(0, 0, 2500)).toEqual({ top: 0, height: 1000 });
    expect(paginateViewportBand(1, 1000, 2500)).toEqual({ top: 0, height: 1000 });
    // Final page: requested offset 2000 clamps to actualY 1500, so the band
    // starts 500px down the viewport and is 500px tall → doc rows [2000,2500).
    expect(paginateViewportBand(2, 1500, 2500)).toEqual({ top: 500, height: 500 });
  });

  test('an exact multiple of the viewport tiles with no clamped page (2000px → 1000+1000)', () => {
    expect(paginateViewportBand(0, 0, 2000)).toEqual({ top: 0, height: 1000 });
    expect(paginateViewportBand(1, 1000, 2000)).toEqual({ top: 0, height: 1000 });
  });

  test('a page shorter than one viewport is a single partial page', () => {
    expect(paginateViewportBand(0, 0, 600)).toEqual({ top: 0, height: 600 });
  });

  test('supports custom viewport height', () => {
    expect(paginateViewportBand(2, 1500, 1900, 800)).toEqual({ top: 100, height: 300 });
  });

  test('bands tile the document exactly (no overlap, no gap)', () => {
    const total = 3300;
    const viewportH = 1000;
    const maxScroll = Math.max(0, total - viewportH);
    const pageCount = Math.ceil(total / viewportH);
    let covered = 0;
    for (let p = 0; p < pageCount; p++) {
      const actualY = Math.min(p * viewportH, maxScroll);
      const band = paginateViewportBand(p, actualY, total);
      // The document row this band's top maps to must continue exactly where the
      // previous page ended.
      expect(actualY + band.top).toBe(covered);
      covered += band.height;
    }
    expect(covered).toBe(total);
  });
});

describe('scrollStitchRowOffset', () => {
  test('places chunks at the true fractional pixel offset', () => {
    // At 1.25x, a chunk scrolled to logical y=1000 lands at device row 1250 —
    // exactly one chunk height (1000 * 1.25) below the previous, so chunks tile
    // without the gaps/overlap an integer-rounded scale produced.
    expect(scrollStitchRowOffset(0, 1.25)).toBe(0);
    expect(scrollStitchRowOffset(1000, 1.25)).toBe(1250);
    expect(scrollStitchRowOffset(2000, 1.25)).toBe(2500);
    expect(scrollStitchRowOffset(1000, 1.5)).toBe(1500);
    expect(scrollStitchRowOffset(1000, 2)).toBe(2000);
  });
});

describe('solidBgraBuffer', () => {
  test('initializes every pixel as opaque BGRA page background', () => {
    const buffer = solidBgraBuffer(3, 2, [10, 20, 30, 255]);
    expect([...buffer]).toEqual([
      30, 20, 10, 255,
      30, 20, 10, 255,
      30, 20, 10, 255,
      30, 20, 10, 255,
      30, 20, 10, 255,
      30, 20, 10, 255,
    ]);
  });
});
