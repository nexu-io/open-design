import { describe, expect, it } from 'vitest';
import { publicShareViewerUrl, resolvePublicShareViewerUrl } from '../src/collab/public-share-viewer-url.js';

const slug = 'a863b8d7-cc55-465a-a359-435bd3ef4919';

describe('public share Viewer Web base', () => {
  it('presentation lookup can be unavailable without fabricating a different deployment', () => {
    expect(resolvePublicShareViewerUrl('p', slug, {})).toBeNull();
    expect(resolvePublicShareViewerUrl('p', slug, { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_VELA_WEB_URL: 'https://prod.example.test/cloud' }, { OPEN_DESIGN_AMR_PROFILE: 'feature-test' })).toBeNull();
    expect(() => resolvePublicShareViewerUrl('p', 'invalid', {})).toThrow('PUBLIC_SHARE_IDENTITY_INVALID');
  });
  it('preserves the deployment prefix and encodes the actual project ID', () => {
    expect(publicShareViewerUrl('project /中文', slug, { OD_VELA_WEB_URL: 'https://web.example.test/cloud/' }))
      .toBe(`https://web.example.test/cloud/artifact/project%20%2F%E4%B8%AD%E6%96%87/${slug}`);
  });
  it('selects the mapped profile rather than the packaged Web base', () => {
    expect(publicShareViewerUrl('p1', slug, {
      OPEN_DESIGN_AMR_PROFILE: 'prod', OD_VELA_WEB_URL: 'https://prod.example.test/cloud',
      OD_VELA_WEB_URLS: JSON.stringify({ test: 'https://test.example.test/preview' }),
    }, { OPEN_DESIGN_AMR_PROFILE: 'test' })).toBe(`https://test.example.test/preview/artifact/p1/${slug}`);
  });
  it('uses the existing public profile configuration without deriving an API host', () => {
    expect(publicShareViewerUrl('p1', slug, {}, { OPEN_DESIGN_AMR_PROFILE: 'test' }))
      .toBe(`https://open-design.powerformer.net/cloud/artifact/p1/${slug}`);
  });
  it('does not fall back to API configuration or another profile', () => {
    expect(() => publicShareViewerUrl('p1', slug, { VELA_API_URL: 'https://api.example.test' }))
      .toThrow('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
    expect(() => publicShareViewerUrl('p1', slug, {
      OPEN_DESIGN_AMR_PROFILE: 'prod', OD_VELA_WEB_URL: 'https://prod.example.test/cloud',
    }, { OPEN_DESIGN_AMR_PROFILE: 'feature-test' })).toThrow('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
  });
  it.each(['relative/cloud', 'javascript:alert(1)', 'ftp://web.example.test', 'https://user:password@web.example.test', 'https://web.example.test/cloud?x=1', 'https://web.example.test/cloud#part'])('refuses invalid Web base %s', base => {
    expect(() => publicShareViewerUrl('p1', slug, { OD_VELA_WEB_URL: base }))
      .toThrow('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
  });
  it('supports an explicitly configured local Web origin', () => {
    expect(publicShareViewerUrl('p1', slug, { OD_VELA_WEB_URL: 'http://localhost:5173' }))
      .toBe(`http://localhost:5173/artifact/p1/${slug}`);
  });
  it('refuses to reinterpret a legacy snapshot ID as a stable alias', () => {
    expect(() => publicShareViewerUrl('p1', 'legacy-snapshot', { OD_VELA_WEB_URL: 'https://web.example.test' }))
      .toThrow('PUBLIC_SHARE_IDENTITY_INVALID');
  });
});
