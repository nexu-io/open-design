import { describe, expect, it } from 'vitest';

import {
  PREVIEW_RESOURCE_PROFILES,
  buildPreviewResourceCsp,
  isApprovedPreviewFontFileUrl,
  isApprovedPreviewFontStylesheetUrl,
} from '../../src/runtime/preview-resource-policy.js';

describe('preview resource policy', () => {
  it.each([
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://use.typekit.net/example.css',
    'https://fonts.bunny.net/css?family=inter:400',
    'https://fonts.cdnfonts.com/css/archivo',
  ])('accepts approved stylesheet URL %s', (url) => {
    expect(isApprovedPreviewFontStylesheetUrl(url)).toBe(true);
  });

  it.each([
    'http://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.googleapis.com.evil.test/css2?family=Inter',
    'https://user@fonts.googleapis.com/css2?family=Inter',
    'https://fonts.googleapis.com:444/css2?family=Inter',
    '/relative-font.css',
    'not-a-url',
  ])('rejects untrusted stylesheet URL %s', (url) => {
    expect(isApprovedPreviewFontStylesheetUrl(url)).toBe(false);
  });

  it('distinguishes font-file origins from stylesheet origins', () => {
    expect(isApprovedPreviewFontFileUrl('https://fonts.gstatic.com/s/inter/font.woff2')).toBe(true);
    expect(isApprovedPreviewFontFileUrl('https://fonts.googleapis.com/font.woff2')).toBe(false);
    expect(isApprovedPreviewFontStylesheetUrl('https://fonts.gstatic.com/font.css')).toBe(false);
  });

  it('adds sanctioned fonts without weakening contained project isolation', () => {
    const csp = buildPreviewResourceCsp(PREVIEW_RESOURCE_PROFILES.CONTAINED_PROJECT);
    expect(csp).toContain('sandbox allow-scripts allow-forms');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain('style-src');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('font-src');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).not.toContain('allow-same-origin');
  });

  it('keeps live artifacts inert while allowing sanctioned fonts', () => {
    const csp = buildPreviewResourceCsp(PREVIEW_RESOURCE_PROFILES.INERT_LIVE_ARTIFACT);
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
  });

  it('keeps extension previews local-only', () => {
    const csp = buildPreviewResourceCsp(PREVIEW_RESOURCE_PROFILES.EXTENSION_PREVIEW);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('fonts.gstatic.com');
  });
});
