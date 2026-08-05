import { describe, expect, it } from 'vitest';
import {
  setLiveArtifactCodeHeaders,
  setLiveArtifactPreviewHeaders,
} from '../../src/runtimes/live-artifact-headers.js';

function response() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  };
}

describe('live artifact response headers', () => {
  it('locks HTML previews to a no-store, script-free document', () => {
    const res = response();

    setLiveArtifactPreviewHeaders(res);

    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox allow-same-origin');
  });

  it('serves source code as non-cacheable plain text', () => {
    const res = response();

    setLiveArtifactCodeHeaders(res);

    expect([...res.headers.entries()]).toEqual([
      ['Content-Type', 'text/plain; charset=utf-8'],
      ['Cache-Control', 'no-store'],
      ['X-Content-Type-Options', 'nosniff'],
      ['Referrer-Policy', 'no-referrer'],
    ]);
  });
});
