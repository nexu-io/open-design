import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenDesignGithubLatestReleaseResponse } from '@open-design/contracts';

import { fetchLatestGithubReleaseInfo } from '../../src/providers/registry';

const originalFetch = globalThis.fetch;

describe('fetchLatestGithubReleaseInfo', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reads the latest release metadata from the daemon endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        repo: 'nexu-io/open-design',
        tag_name: 'v0.8.0-nightly.3',
        html_url: 'https://github.com/nexu-io/open-design/releases/tag/v0.8.0-nightly.3',
        fetchedAt: Date.parse('2026-05-22T00:00:00.000Z'),
        stale: false,
      } satisfies OpenDesignGithubLatestReleaseResponse),
    } satisfies Partial<Response>) as typeof fetch;

    const result = await fetchLatestGithubReleaseInfo();

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/github/open-design/releases/latest');
    expect(result).toEqual({
      tagName: 'v0.8.0-nightly.3',
      htmlUrl: 'https://github.com/nexu-io/open-design/releases/tag/v0.8.0-nightly.3',
      stale: false,
    });
  });

  it('returns null when the daemon endpoint fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } satisfies Partial<Response>) as typeof fetch;

    await expect(fetchLatestGithubReleaseInfo()).resolves.toBeNull();
  });
});
