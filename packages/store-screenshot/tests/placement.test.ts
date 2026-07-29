import { describe, expect, it } from 'vitest';
import { placeStoreScreenshotAsset, storeScreenshotTemplates } from '../src/index.js';

describe('placeStoreScreenshotAsset', () => {
  it('anchors a scale above one from the centre for minimal-center', () => {
    const placement = placeStoreScreenshotAsset({
      size: { width: 1290, height: 2796 },
      template: storeScreenshotTemplates['minimal-center'],
      assetPosition: { x: 12, y: -8 },
      transform: { x: 30, y: 40, scale: 1.4 },
    });
    expect(placement.left).toBeCloseTo(-35.4);
    expect(placement.top).toBeCloseTo(518.504);
    expect(placement.width).toBeCloseTo(1444.8);
    expect(placement.height).toBeCloseTo(2113.776);
  });

  it('anchors a scale above one from the right for feature layouts', () => {
    const placement = placeStoreScreenshotAsset({
      size: { width: 1080, height: 1920 },
      template: storeScreenshotTemplates['gradient-device'],
      transform: { x: -18, y: 24, scale: 1.25 },
    });
    expect(placement.left).toBeCloseTo(-82.8);
    expect(placement.top).toBeCloseTo(513.6);
    expect(placement.width).toBeCloseTo(1080);
    expect(placement.height).toBeCloseTo(1296);
  });
});
