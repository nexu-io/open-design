import { describe, expect, it, vi } from 'vitest';

vi.mock('fabric', () => {
  class FabricObject {
    left = 0;
    top = 0;
    scaleX = 1;
    scaleY = 1;
    data: Record<string, unknown> = {};

    constructor(options: Record<string, unknown> = {}) {
      Object.assign(this, options);
    }

    set(values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }
  }

  class Rect extends FabricObject {}

  class IText extends FabricObject {
    text: string;

    constructor(text: string, options: Record<string, unknown> = {}) {
      super(options);
      this.text = text;
    }
  }

  return { FabricObject, IText, Rect };
});

import {
  fabricObjectToTransformOperation,
  storeScreenshotPageToFabricObjects,
} from '../../../src/features/store-screenshots/fabric-adapter';
import { documentResponse } from './fixtures';

describe('store screenshot Fabric adapter', () => {
  it('maps canonical page fields to tagged Fabric objects without serializing Fabric JSON', () => {
    const document = structuredClone(documentResponse.document);
    document.assets = [{ id: 'asset-1' }];
    document.pages[0]!.screenshotAssetId = 'asset-1';

    const objects = storeScreenshotPageToFabricObjects(
      document,
      document.pages[0]!,
      'appStore',
      360,
    );

    expect(objects.map((object) => (
      (object.data.storeScreenshotNode as { id: string }).id
    ))).toEqual(['background', 'headline', 'body', 'product-shot']);
    expect(objects.some((object) => 'toJSON' in object.data)).toBe(false);
  });

  it('maps viewport movement back to canonical output coordinates', () => {
    const document = structuredClone(documentResponse.document);
    document.assets = [{ id: 'asset-1' }];
    document.pages[0]!.screenshotAssetId = 'asset-1';
    const objects = storeScreenshotPageToFabricObjects(
      document,
      document.pages[0]!,
      'appStore',
      360,
    );
    const productShot = objects.find((object) => (
      (object.data.storeScreenshotNode as { id: string }).id === 'product-shot'
    ))!;
    productShot.set({
      left: (productShot.left ?? 0) + 36,
      top: (productShot.top ?? 0) - 18,
      scaleX: 1.4,
      scaleY: 1.4,
    });

    expect(fabricObjectToTransformOperation('page-1', productShot)).toEqual({
      op: 'setTransform',
      pageId: 'page-1',
      x: 129,
      y: -64.5,
      scale: 1.4,
    });
  });
});
