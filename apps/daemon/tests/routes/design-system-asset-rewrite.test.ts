import { describe, expect, it } from 'vitest';
import { rewriteDesignSystemShowcaseAssetUrls } from '../../src/routes/design-systems.js';

describe('rewriteDesignSystemShowcaseAssetUrls', () => {
  it('keeps generated showcase asset URLs under the browser base path', () => {
    const html = `<img src="../assets/hero.png"><style>body{background:url('./assets/bg.svg')}</style>`;

    expect(rewriteDesignSystemShowcaseAssetUrls(html, 'brand-kit', 'system', '/open-design')).toBe(
      `<img src="/open-design/api/design-systems/brand-kit/static?path=assets%2Fhero.png"><style>body{background:url('/open-design/api/design-systems/brand-kit/static?path=system%2Fassets%2Fbg.svg')}</style>`,
    );
  });

  it('prefixes known root-relative daemon URLs while preserving other document paths', () => {
    const html = `<a href="/api/projects/p/raw/index.html"></a><img src="/images/logo.svg">`;

    expect(rewriteDesignSystemShowcaseAssetUrls(html, 'brand-kit', '.', '/open-design')).toBe(
      `<a href="/open-design/api/projects/p/raw/index.html"></a><img src="/images/logo.svg">`,
    );
  });
});
