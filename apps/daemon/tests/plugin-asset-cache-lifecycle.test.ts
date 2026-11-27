import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPluginAssetCache } from '../src/plugins/plugin-asset-cache.js';

describe('plugin asset cache response lifecycle', () => {
  it.each([
    {
      name: 'a non-success response',
      status: 503,
      headers: { 'content-type': 'text/plain' },
      url: 'https://cdn.example.com/error.png',
      expected: 502,
    },
    {
      name: 'an oversized declared body',
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '100000' },
      url: 'https://cdn.example.com/huge.png',
      expected: 413,
    },
    {
      name: 'an unsupported response type',
      status: 200,
      headers: { 'content-type': 'application/json' },
      url: 'https://cdn.example.com/image?format=.png',
      expected: 415,
    },
  ])('closes the upstream connection after rejecting $name', async (scenario) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-asset-lifecycle-'));
    const upstreamClosed = Promise.withResolvers<void>();
    const upstream = createServer((_request, response) => {
      response.once('close', () => upstreamClosed.resolve());
      response.writeHead(scenario.status, scenario.headers);
      response.write('x');
      // Keep sending eligible: returning the cache error must abort this fetch.
    });
    let signal: AbortSignal | null | undefined;
    try {
      upstream.listen(0, '127.0.0.1');
      await once(upstream, 'listening');
      const address = upstream.address();
      if (address == null || typeof address === 'string') throw new Error('missing test TCP address');
      const cache = createPluginAssetCache({
        cacheDir: dir,
        maxBytes: 16,
        fetchTimeoutMs: 60_000,
        // The injected transport targets our local server and keeps the real
        // fetch/AbortSignal response lifecycle. SSRF policy has separate tests.
        fetchImpl: (_url, init) => {
          signal = init?.signal;
          return fetch(`http://127.0.0.1:${address.port}/fixture`, { signal });
        },
      });

      await expect(cache.get(scenario.url)).rejects.toMatchObject({ status: scenario.expected });

      expect(signal?.aborted).toBe(true);
      await upstreamClosed.promise;
      expect(await readdir(dir)).toEqual([]);
    } finally {
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
