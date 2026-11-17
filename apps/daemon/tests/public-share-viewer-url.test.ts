import { describe, expect, it } from 'vitest';
import { publicShareViewerUrl, resolvePublicShareViewerUrl } from '../src/collab/public-share-viewer-url.js';

const slug = 'a863b8d7-cc55-465a-a359-435bd3ef4919';
const testMap = { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_SHARE_VIEWER_URLS: JSON.stringify({ test: 'https://viewer.example.test/' }) };
const testProfile = { OPEN_DESIGN_AMR_PROFILE: 'test' };

describe('public share Viewer origin', () => {
  it('uses the selected profile Viewer root and encodes the actual project ID', () => {
    expect(publicShareViewerUrl('project /中文', slug, testMap, testProfile))
      .toBe('https://viewer.example.test/artifact/project%20%2F%E4%B8%AD%E6%96%87/' + slug);
  });

  it('validates only the selected own profile value; invalid unused known values do not poison it', () => {
    expect(publicShareViewerUrl('p1', slug, { OD_SHARE_VIEWER_URLS: JSON.stringify({ test: 'https://viewer.example.test', prod: 'not a URL' }), OD_SHARE_VIEWER_URL: 'not a URL' }, testProfile))
      .toBe('https://viewer.example.test/artifact/p1/' + slug);
  });

  it('does not fall back when the selected profile key is present but invalid', () => {
    expect(resolvePublicShareViewerUrl('p1', slug, { OD_SHARE_VIEWER_URLS: JSON.stringify({ test: 'https://viewer.example.test/app', prod: 'https://prod.example.test' }), OD_SHARE_VIEWER_URL: 'https://single.example.test' }, testProfile)).toBeNull();
  });

  it('uses the single origin only when selected and launch profiles match', () => {
    expect(resolvePublicShareViewerUrl('p1', slug, { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_SHARE_VIEWER_URL: 'https://viewer.example.test/' }, { OPEN_DESIGN_AMR_PROFILE: 'test' })).toBeNull();
    expect(publicShareViewerUrl('p1', slug, { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_SHARE_VIEWER_URL: 'https://viewer.example.test/' }))
      .toBe('https://viewer.example.test/artifact/p1/' + slug);
  });

  it('does not derive or fall back to the existing console origin', () => {
    expect(resolvePublicShareViewerUrl('p1', slug, { OD_VELA_WEB_URL: 'https://console.example.test/cloud' })).toBeNull();
  });

  it('rejects malformed or structurally invalid profile maps without single fallback', () => {
    for (const map of ['{', '[]', 'null', JSON.stringify({ unknown: 'https://other.example.test' })]) {
      expect(resolvePublicShareViewerUrl('p1', slug, { OD_SHARE_VIEWER_URLS: map, OD_SHARE_VIEWER_URL: 'https://single.example.test' })).toBeNull();
    }
  });

  it.each(['http://viewer.example.test', 'http://localhost:5173', 'https://viewer.example.test/app', 'https://user:password@viewer.example.test', 'https://@viewer.example.test/', 'https://:@viewer.example.test/', 'https://viewer.example.test?x=1', 'https://viewer.example.test?', 'https://viewer.example.test#part', 'https://viewer.example.test#', 'ftp://viewer.example.test'])('rejects invalid root shell origin %s', origin => {
    expect(resolvePublicShareViewerUrl('p1', slug, { OD_SHARE_VIEWER_URL: origin })).toBeNull();
  });

  it.each(['https://viewer.example.test/app/..', 'https://viewer.example.test/%2e%2e', 'https://viewer.example.test\\app\\..'])('rejects raw non-root paths even if URL normalization collapses %s', origin => {
    expect(resolvePublicShareViewerUrl('p1', slug, { OD_SHARE_VIEWER_URL: origin })).toBeNull();
  });

  it('rejects invalid identity before unavailable config and never interprets snapshot as slug', () => {
    expect(() => resolvePublicShareViewerUrl(' ', slug, {})).toThrow('PUBLIC_SHARE_IDENTITY_INVALID');
    expect(() => publicShareViewerUrl('p1', 'legacy-snapshot', { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' })).toThrow('PUBLIC_SHARE_IDENTITY_INVALID');
  });
  it.each(['.', '..', ' .. '])('rejects dot-segment project id %j that URL resolution would collapse', projectId => {
    expect(() => publicShareViewerUrl(projectId, slug, { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' })).toThrow('PUBLIC_SHARE_IDENTITY_INVALID');
  });
});