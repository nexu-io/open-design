import { afterEach, describe, expect, it, vi } from 'vitest';

import { createValidatingLookup, fetchExternalBrandAsset } from '../src/brands/safe-fetch.js';

// The brand-extraction fetchers pull a user-supplied site URL and then follow
// sub-resource URLs (CSS/@font-face/img/favicon) discovered inside the fetched
// HTML — those are attacker-influenced. `fetchExternalBrandAsset` is the single
// SSRF choke point they all route through. It must refuse non-public hosts
// (loopback, RFC1918/CGNAT, link-local, cloud metadata) BEFORE any request, so
// these assertions never touch the network.
describe('fetchExternalBrandAsset SSRF guard', () => {
  const blocked = [
    'http://169.254.169.254/latest/meta-data/', // cloud metadata / link-local
    'http://10.0.0.1/', // RFC1918
    'http://192.168.1.1/', // RFC1918
    'http://172.16.0.5/', // RFC1918
    'http://100.64.0.1/', // CGNAT (100.64/10)
    'http://127.0.0.1:8080/', // loopback
    'http://127.0.0.2/', // loopback range (not just .0.1)
    'http://localhost:3000/', // loopback
    'http://[::1]/', // loopback (IPv6)
    'http://[ff02::1]/', // IPv6 multicast (ff00::/8)
    'http://0.0.0.0/', // unspecified
    'ftp://example.com/', // non-http(s) protocol
  ];

  for (const url of blocked) {
    it(`refuses a non-public host: ${url}`, async () => {
      await expect(fetchExternalBrandAsset(url)).rejects.toThrow();
    });
  }

  it('refuses a malformed url', async () => {
    await expect(fetchExternalBrandAsset('not a url')).rejects.toThrow();
  });
});

// Redirects are followed manually so ordinary public->public hops still work,
// but a redirect into non-public space is refused before the next request.
// Public IP literals are used so the guard needs no DNS lookup and `fetch` is
// stubbed — no network is touched.
describe('fetchExternalBrandAsset redirect handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follows a public -> public redirect and returns the final response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = typeof input === 'string' ? input : String(input);
      if (u === 'http://93.184.216.34/') {
        return new Response(null, { status: 302, headers: { location: 'http://93.184.216.35/final' } });
      }
      return new Response('ok', { status: 200 });
    });

    const res = await fetchExternalBrandAsset('http://93.184.216.34/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Redirects are intercepted, not auto-followed by the platform.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a redirect that points into non-public space (and never fetches it)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    );

    await expect(fetchExternalBrandAsset('http://93.184.216.34/')).rejects.toThrow();
    // Only the first (public) hop is requested; the private target is blocked
    // by the pre-fetch validation, so it is never contacted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// DNS rebinding: an attacker-controlled name can answer public for the
// validation lookup and private for the socket's own re-resolution. The pre-URL
// check alone can't stop that, so the guard is pinned to the connection via a
// validating `lookup` (createValidatingLookup) — the address it validates IS the
// one the socket connects to. This exercises that connect-time lookup directly.
describe('createValidatingLookup (DNS-rebinding pin)', () => {
  const runLookup = (
    resolved: Array<{ address: string; family: number }> | { address: string; family: number },
    opts: Record<string, unknown> = { all: true },
  ) =>
    new Promise<{ err: Error | null; address?: unknown }>((resolve) => {
      const impl = ((_h: string, _o: unknown, cb: (e: Error | null, a?: unknown, f?: number) => void) => {
        if (Array.isArray(resolved)) cb(null, resolved);
        else cb(null, resolved.address, resolved.family);
      }) as unknown as Parameters<typeof createValidatingLookup>[0];
      const lookup = createValidatingLookup(impl) as unknown as (
        h: string,
        o: unknown,
        cb: (e: Error | null, a?: unknown) => void,
      ) => void;
      lookup('rebind.attacker.example', opts, (err, address) => resolve({ err, address }));
    });

  it('rejects the connection when the host resolves to a private/metadata address', async () => {
    // The rebind: validation may have seen a public IP, but the socket's own
    // resolution lands on cloud metadata. The pinned lookup refuses it.
    const meta = await runLookup([{ address: '169.254.169.254', family: 4 }]);
    expect(meta.err).toBeInstanceOf(Error);

    const loopback = await runLookup({ address: '127.0.0.1', family: 4 }, {});
    expect(loopback.err).toBeInstanceOf(Error);

    const rfc1918 = await runLookup([{ address: '10.0.0.7', family: 4 }]);
    expect(rfc1918.err).toBeInstanceOf(Error);
  });

  it('passes a genuinely public resolution through unchanged', async () => {
    const pub = await runLookup([{ address: '93.184.216.34', family: 4 }]);
    expect(pub.err).toBeNull();
    expect(pub.address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });
});
