import { describe, expect, test } from 'vitest';

import { parseCaptureClip } from '../../src/main/runtime.js';

// Issue #6361: the renderer measures the preview frame with
// getBoundingClientRect() — CSS pixels — but Electron's capturePage() clips in
// DIP page coordinates. The two spaces coincide only at zoom factor 1. Without
// the conversion a mark made inside the preview at a non-100% zoom captured a
// region shifted up/left off the artifact, so the annotation PNG and the
// structured position handed to the agent described different pixels.
//
// Measured on macOS/HiDPI at zoom 1.095 (Cmd + once), marking a 40px band:
//   frame rect (CSS px)     {x:468, y:148, w:692, h:666}
//   returned bitmap          1384 × 1332  == 692 × 666 × 2.0
//   but devicePixelRatio     2.1909  (== 2 × 1.095)
// The bitmap being exactly 2.0× the CSS rect — not 2.1909× — is the proof that
// Electron consumed the numbers as DIP. The mark landed one band high: the red
// box painted at rows 683–765 while the marked band occupied rows 777–864.
const PREVIEW_FRAME = { x: 420, y: 96, width: 1000, height: 600 };

describe('parseCaptureClip zoom conversion', () => {
  test('100% zoom is identity', () => {
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, 1)).toEqual(PREVIEW_FRAME);
  });

  test('125% zoom scales origin and size together', () => {
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, 1.25)).toEqual({
      x: 525,
      y: 120,
      width: 1250,
      height: 750,
    });
  });

  test('150% zoom', () => {
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, 1.5)).toEqual({
      x: 630,
      y: 144,
      width: 1500,
      height: 900,
    });
  });

  test('80% zoom', () => {
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, 0.8)).toEqual({
      x: 336,
      y: 77,
      width: 800,
      height: 480,
    });
  });

  test('the clip stays inside the frame it was measured from at every zoom', () => {
    // The failure users saw was the clip drifting *out* of the preview frame.
    // At any zoom the converted clip must be exactly the frame in DIP space.
    for (const zoom of [0.8, 1, 1.25, 1.5, 2]) {
      const clip = parseCaptureClip({ clip: PREVIEW_FRAME }, zoom)!;
      expect(clip.x / zoom).toBeCloseTo(PREVIEW_FRAME.x, 0);
      expect(clip.y / zoom).toBeCloseTo(PREVIEW_FRAME.y, 0);
      expect(clip.width / zoom).toBeCloseTo(PREVIEW_FRAME.width, 0);
      expect(clip.height / zoom).toBeCloseTo(PREVIEW_FRAME.height, 0);
    }
  });

  test('defaults to identity when the zoom factor is missing or nonsensical', () => {
    expect(parseCaptureClip({ clip: PREVIEW_FRAME })).toEqual(PREVIEW_FRAME);
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, 0)).toEqual(PREVIEW_FRAME);
    expect(parseCaptureClip({ clip: PREVIEW_FRAME }, Number.NaN)).toEqual(PREVIEW_FRAME);
  });

  test('invalid payloads still yield a full-page capture', () => {
    expect(parseCaptureClip(null, 1.25)).toBeUndefined();
    expect(parseCaptureClip({}, 1.25)).toBeUndefined();
    expect(parseCaptureClip({ clip: { x: 1, y: 2, width: 'wide', height: 4 } }, 1.25)).toBeUndefined();
  });
});
