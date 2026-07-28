import { describe, expect, it } from 'vitest';
import {
  deriveStoreScreenshotPage,
  storeScreenshotTemplates,
  type StoreScreenshotDocument,
} from '../src/index.js';

const document: StoreScreenshotDocument = {
  schemaVersion: 1,
  id: 'document-1',
  projectId: 'project-1',
  version: 3,
  product: { name: 'Focus', summary: '专注任务', audience: '独立开发者', features: ['计时'] },
  designSystemId: 'clay',
  assets: [{ id: 'screen-1', color: '#123ABC' }],
  pages: [{
    id: 'page-1',
    order: 0,
    templateId: 'gradient-device',
    headline: '保持专注',
    body: '一次只做一件事',
    screenshotAssetId: 'screen-1',
    overrides: {
      appStore: { headline: '为 App Store 优化', hidden: false },
      googlePlay: { hidden: true },
    },
    lockedFields: [],
  }],
};

describe('store screenshot templates', () => {
  it('提供三个固定的版式定义', () => {
    expect(Object.keys(storeScreenshotTemplates)).toEqual([
      'minimal-center',
      'gradient-device',
      'editorial-split',
    ]);
    expect(storeScreenshotTemplates['minimal-center'].headlineAlign).toBe('center');
    expect(storeScreenshotTemplates['gradient-device'].background).toBe('gradient');
    expect(storeScreenshotTemplates['editorial-split'].accentLabel).toBe(true);
  });

  it('按平台派生文字、可见性、尺寸和素材', () => {
    const derived = deriveStoreScreenshotPage(document, 'page-1', 'appStore');

    expect(derived.headline).toBe('为 App Store 优化');
    expect(derived.body).toBe('一次只做一件事');
    expect(derived.hidden).toBe(false);
    expect(derived.size).toEqual({ width: 1290, height: 2796 });
    expect(derived.screenshotAsset).toEqual({ id: 'screen-1', color: '#123ABC' });
    expect(deriveStoreScreenshotPage(document, 'page-1', 'googlePlay').hidden).toBe(true);
  });

  it('保留非空的平台正文覆盖', () => {
    const withBodyOverride: StoreScreenshotDocument = {
      ...document,
      pages: [{
        ...document.pages[0]!,
        overrides: { appStore: { body: '专为 App Store 编写的正文' } },
      }],
    };

    expect(deriveStoreScreenshotPage(withBodyOverride, 'page-1', 'appStore').body)
      .toBe('专为 App Store 编写的正文');
  });
});
