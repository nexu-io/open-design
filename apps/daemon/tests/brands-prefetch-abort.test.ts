import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prefetchBrand } from '../src/brands/prefetch.js';

describe('brand prefetch abort handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects instead of continuing when the main fetch is aborted', async () => {
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

      // The abort short-circuits the prefetch: one fetch attempt, then it bails
      // rather than silently falling through to any further extraction step.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
