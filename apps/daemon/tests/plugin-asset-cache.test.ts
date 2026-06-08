// Unit coverage for the external preview-media cache + SSRF guard
// (apps/daemon/src/plugin-asset-cache.ts).
//
// The load-bearing risk is SSRF: `/api/asset-cache?url=` fetches a
// caller-supplied URL, so these tests pin that private/loopback/link-local
// hosts are refused, that only http(s) media URLs are accepted, and that the
// disk cache fetches once then replays (including concurrent de-duplication).

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AssetCacheError,
  assertSafePublicUrl,
  assetCacheKey,
  assetCacheRewriteUrl,
  createPluginAssetCache,
  isCacheableExternalUrl,
  isPrivateAddress,
} from '../src/plugin-asset-cache.js';

describe('isCacheableExternalUrl', () => {
  it('accepts absolute http(s) media urls', () => {
    expect(isCacheableExternalUrl('https://res.cloudinary.com/x/portal_bg.png')).toBe(true);
    expect(isCacheableExternalUrl('http://images.higgs.ai/a/b.jpg?v=2')).toBe(true);
    expect(isCacheableExternalUrl('https://d8j0.cloudfront.net/clip.mp4')).toBe(true);
    expect(isCacheableExternalUrl('https://cdn.example.com/a.webp#frag')).toBe(true);
  });

  it('rejects non-media, relative, data, and non-http urls', () => {
    expect(isCacheableExternalUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(false);
    expect(isCacheableExternalUrl('https://cdn.example.com/app.js')).toBe(false);
    expect(isCacheableExternalUrl('./hero.png')).toBe(false);
    expect(isCacheableExternalUrl('/api/plugins/x/asset/hero.png')).toBe(false);
    expect(isCacheableExternalUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isCacheableExternalUrl(42)).toBe(false);
  });
});

describe('assetCacheRewriteUrl', () => {
  it('encodes the full url into the same-origin proxy path', () => {
    expect(assetCacheRewriteUrl('https://res.cloudinary.com/x/a b.png')).toBe(
      '/api/asset-cache?url=https%3A%2F%2Fres.cloudinary.com%2Fx%2Fa%20b.png',
    );
  });
});

describe('isPrivateAddress', () => {
  it('flags loopback / private / link-local / CGNAT / multicast', () => {
    for (const addr of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12::3',
      'ff02::1',
      '::ffff:127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isPrivateAddress(addr)).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const addr of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(addr)).toBe(false);
    }
  });
});

describe('assertSafePublicUrl', () => {
  const publicResolve = async () => ['93.184.216.34'];

  it('rejects unsupported schemes and embedded credentials', async () => {
    await expect(assertSafePublicUrl('ftp://host/x.png', publicResolve)).rejects.toMatchObject({
      status: 400,
    });
    await expect(assertSafePublicUrl('https://user:pass@host/x.png', publicResolve)).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(assertSafePublicUrl('not a url', publicResolve)).rejects.toBeInstanceOf(AssetCacheError);
  });

  it('rejects localhost and hosts that resolve to private addresses', async () => {
    await expect(assertSafePublicUrl('http://localhost/x.png', publicResolve)).rejects.toMatchObject({
      status: 400,
    });
    await expect(assertSafePublicUrl('http://127.0.0.1/x.png', publicResolve)).rejects.toMatchObject({
      status: 400,
    });
    const privateResolve = async () => ['10.0.0.9'];
    await expect(assertSafePublicUrl('https://evil.example.com/x.png', privateResolve)).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it('accepts a public host', async () => {
    const url = await assertSafePublicUrl('https://res.cloudinary.com/x/a.png', publicResolve);
    expect(url.hostname).toBe('res.cloudinary.com');
  });
});

describe('createPluginAssetCache', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'od-asset-cache-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function pngResponse(bytes = 8): Response {
    return new Response(Buffer.alloc(bytes, 1), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(bytes) },
    });
  }

  it('fetches once, stores on disk, and replays from cache', async () => {
    let calls = 0;
    const cache = createPluginAssetCache({
      cacheDir: dir,
      resolveHost: async () => ['93.184.216.34'],
      fetchImpl: (async () => {
        calls += 1;
        return pngResponse();
      }) as typeof fetch,
    });
    const url = 'https://res.cloudinary.com/x/portal_bg.png';
    const first = await cache.get(url);
    expect(first.contentType).toBe('image/png');
    expect(first.buf.byteLength).toBe(8);
    // On-disk blob exists under the sha256 key.
    const onDisk = await readFile(path.join(dir, assetCacheKey(url)));
    expect(onDisk.byteLength).toBe(8);
    // Second call is served from disk — no extra fetch.
    const second = await cache.get(url);
    expect(second.buf.byteLength).toBe(8);
    expect(calls).toBe(1);
  });

  it('de-duplicates concurrent requests for the same url', async () => {
    let calls = 0;
    const cache = createPluginAssetCache({
      cacheDir: dir,
      resolveHost: async () => ['93.184.216.34'],
      fetchImpl: (async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return pngResponse();
      }) as typeof fetch,
    });
    const url = 'https://images.higgs.ai/a/b.jpg';
    const [a, b] = await Promise.all([cache.get(url), cache.get(url)]);
    expect(a.buf.byteLength).toBe(8);
    expect(b.buf.byteLength).toBe(8);
    expect(calls).toBe(1);
  });

  it('derives content-type from the extension when the header is generic', async () => {
    const cache = createPluginAssetCache({
      cacheDir: dir,
      resolveHost: async () => ['93.184.216.34'],
      fetchImpl: (async () =>
        new Response(Buffer.alloc(4, 2), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })) as typeof fetch,
    });
    const out = await cache.get('https://cdn.example.com/clip.mp4');
    expect(out.contentType).toBe('video/mp4');
  });

  it('rejects oversized assets', async () => {
    const cache = createPluginAssetCache({
      cacheDir: dir,
      maxBytes: 16,
      resolveHost: async () => ['93.184.216.34'],
      fetchImpl: (async () => pngResponse(1024)) as typeof fetch,
    });
    await expect(cache.get('https://res.cloudinary.com/x/big.png')).rejects.toMatchObject({ status: 413 });
  });

  it('refuses non-cacheable urls without fetching', async () => {
    let calls = 0;
    const cache = createPluginAssetCache({
      cacheDir: dir,
      fetchImpl: (async () => {
        calls += 1;
        return pngResponse();
      }) as typeof fetch,
    });
    await expect(cache.get('https://cdn.example.com/app.js')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
  });

  it('refuses urls that resolve to a private address (SSRF)', async () => {
    let calls = 0;
    const cache = createPluginAssetCache({
      cacheDir: dir,
      resolveHost: async () => ['169.254.169.254'],
      fetchImpl: (async () => {
        calls += 1;
        return pngResponse();
      }) as typeof fetch,
    });
    await expect(cache.get('https://metadata.example.com/x.png')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
  });
});
