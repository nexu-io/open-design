import { describe, expect, it } from 'vitest';
import {
  compileStoreScreenshotSvg,
  deriveStoreScreenshotPage,
  type StoreScreenshotDocument,
} from '../src/index.js';

const document: StoreScreenshotDocument = {
  schemaVersion: 1,
  id: 'document-1',
  projectId: 'project-1',
  version: 1,
  product: { name: 'Focus', summary: '专注任务', audience: '独立开发者', features: ['计时'] },
  designSystemId: 'clay',
  assets: [{ id: 'screen-1', color: '#123ABC', position: { x: 12.34567, y: 23.45678 }, scale: 0.5 }],
  pages: [{
    id: 'page-1',
    order: 0,
    templateId: 'minimal-center',
    headline: 'A < B & C',
    body: '"quoted" \'apostrophe\'',
    screenshotAssetId: 'screen-1',
    overrides: {},
    lockedFields: [],
  }],
};

describe('compileStoreScreenshotSvg', () => {
  it('同一输入生成字节稳定的 SVG', () => {
    const derivedPage = deriveStoreScreenshotPage(document, 'page-1', 'appStore');
    const first = compileStoreScreenshotSvg(derivedPage);
    const second = compileStoreScreenshotSvg(derivedPage);
    expect(second).toBe(first);
    expect(first).toContain('width="1290" height="2796"');
  });

  it('转义文本并固定属性顺序和浮点精度', () => {
    const svg = compileStoreScreenshotSvg(deriveStoreScreenshotPage(document, 'page-1', 'appStore'));

    expect(svg).toContain('A &lt; B &amp; C');
    expect(svg).toContain('&quot;quoted&quot; &apos;apostrophe&apos;');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796" viewBox="0 0 1290 2796">');
    expect(svg).toContain('x="141.35" y="1113.90" width="1032.00" height="1509.84"');
  });
});
