import { describe, expect, it } from 'vitest';
import { chromiumDisabledFeatures } from '../../src/main/chromium-features.js';

describe('chromiumDisabledFeatures', () => {
  it('turns Skia Graphite off on macOS and keeps the overscroll pair', () => {
    expect(chromiumDisabledFeatures('darwin').split(',')).toEqual([
      'OverscrollEffectOnNonRootScrollers',
      'OverscrollBehaviorRespectedOnAllScrollContainers',
      'SkiaGraphite',
    ]);
  });

  it('leaves the raster backend alone on Windows and Linux', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(chromiumDisabledFeatures(platform)).toBe(
        'OverscrollEffectOnNonRootScrollers,OverscrollBehaviorRespectedOnAllScrollContainers',
      );
    }
  });
});
