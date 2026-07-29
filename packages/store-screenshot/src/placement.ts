import type { DerivedStoreScreenshotPage } from './derive.js';
import type { StoreScreenshotTemplate } from './templates.js';

export interface StoreScreenshotAssetPlacementInput {
  size: { width: number; height: number };
  template: Pick<StoreScreenshotTemplate, 'devicePlacement' | 'screenshotRadius'>;
  assetPosition?: { x: number; y: number };
  transform: { x: number; y: number; scale: number };
}

export interface StoreScreenshotAssetPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * The single canonical placement rule for a product screenshot.  The scaled
 * rectangle is anchored first (right or centre), then asset and editor
 * transforms are applied.  Renderers and editors must not recreate this math.
 */
export function placeStoreScreenshotAsset(
  input: StoreScreenshotAssetPlacementInput,
): StoreScreenshotAssetPlacement {
  const { width: canvasWidth, height: canvasHeight } = input.size;
  const { scale } = input.transform;
  const width = canvasWidth * 0.8 * scale;
  const height = canvasHeight * 0.54 * scale;
  const anchorLeft = input.template.devicePlacement === 'right'
    ? canvasWidth - width - canvasWidth * 0.06
    : (canvasWidth - width) / 2;
  const anchorTop = canvasHeight - height - canvasHeight * 0.07;
  const position = input.assetPosition ?? { x: 0, y: 0 };
  return {
    left: anchorLeft + position.x + input.transform.x,
    top: anchorTop + position.y + input.transform.y,
    width,
    height,
    radius: input.template.screenshotRadius,
  };
}

export function placeDerivedStoreScreenshotAsset(
  page: DerivedStoreScreenshotPage,
): StoreScreenshotAssetPlacement | null {
  if (!page.screenshotAsset) return null;
  return placeStoreScreenshotAsset({
    size: page.size,
    template: page.template,
    transform: page.transform,
    ...(page.screenshotAsset.position ? { assetPosition: page.screenshotAsset.position } : {}),
  });
}
