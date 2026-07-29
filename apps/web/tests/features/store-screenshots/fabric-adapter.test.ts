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

  class FabricImage extends FabricObject {
    static async fromURL(url: string, options: Record<string, unknown> = {}) {
      return new FabricImage({ sourceUrl: url, ...options });
    }
  }

  return { FabricObject, FabricImage, IText, Rect };
});

import {
  fabricObjectToTransformOperation,
  storeScreenshotPageToFabricObjects,
} from '../../../src/features/store-screenshots/fabric-adapter';
import { documentResponse } from './fixtures';

describe('store screenshot Fabric adapter', () => {
  it('maps canonical page fields to a tagged Fabric image without serializing Fabric JSON', async () => {
    const document = structuredClone(documentResponse.document);
    document.assets = [{ id: 'asset-1' }];
    document.pages[0]!.screenshotAssetId = 'asset-1';

    const objects = await storeScreenshotPageToFabricObjects(
      document,
      document.pages[0]!,
      'appStore',
      360,
      '/api/projects/project-1/store-screenshots/assets/asset-1/raw',
    );

    expect(objects.map((object) => (
      (object.data.storeScreenshotNode as { id: string }).id
    ))).toEqual(['background', 'headline', 'body', 'product-shot']);
    expect(objects.some((object) => 'toJSON' in object.data)).toBe(false);
  });

  it('maps a uniform resize back through its new scale anchor and rejects nonuniform scale', async () => {
    const document = structuredClone(documentResponse.document);
    document.assets = [{ id: 'asset-1' }];
    document.pages[0]!.screenshotAssetId = 'asset-1';
    const objects = await storeScreenshotPageToFabricObjects(
      document,
      document.pages[0]!,
      'appStore',
      360,
      '/api/projects/project-1/store-screenshots/assets/asset-1/raw',
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
      x: 335.4,
      y: 539.44,
      scale: 1.4,
    });
    productShot.set({ scaleY: 1.2 });
    expect(fabricObjectToTransformOperation('page-1', productShot)).toBeNull();
  });
});
