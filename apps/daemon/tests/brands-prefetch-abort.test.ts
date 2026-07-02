import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/brands/chrome.js', () => ({
  chromeDumpDom: vi.fn(async () => '<html><body>unexpected chrome fallback</body></html>'),
  chromeScreenshot: vi.fn(async () => true),
  findChrome: vi.fn(() => '/fake/chrome'),
}));

import { chromeDumpDom, chromeScreenshot } from '../src/brands/chrome.js';
import { prefetchBrand } from '../src/brands/prefetch.js';

describe('brand prefetch abort handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not fall through to system Chrome when the main fetch is aborted', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-prefetch-abort-'));
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(
        prefetchBrand('https://example.com', tempDir, { signal: controller.signal }),
      ).rejects.toThrow(/abort/i);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chromeDumpDom).not.toHaveBeenCalled();
      expect(chromeScreenshot).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
