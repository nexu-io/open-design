import { describe, expect, it } from 'vitest';

import { previewablePrefetchHtml } from '../src/brands/prefetch.js';

describe('brand prefetch artifacts', () => {
  it('replaces head-only truncated captures with a visible diagnostic page', () => {
    const html = `<!doctype html><html><head><title>Big SSR</title><script>${'x'.repeat(80)}</script></head><body>real page</body></html>`;

    const preview = previewablePrefetchHtml(html, 64);

    expect(preview).toContain('<body>');
    expect(preview).toContain('Prefetch HTML was truncated before the page body.');
    expect(preview).toContain('Big SSR');
    expect(preview).not.toContain('real page');
  });

  it('keeps capped captures when the body is present before the cap', () => {
    const html = `<!doctype html><html><head><title>Ready</title></head><body>${'x'.repeat(80)}</body></html>`;

    const preview = previewablePrefetchHtml(html, 72);

    expect(preview).toBe(html.slice(0, 72));
    expect(preview).toContain('<body>');
  });
});
