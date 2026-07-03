import { describe, expect, it } from 'vitest';

import { fetchExternalBrandAsset } from '../src/brands/safe-fetch.js';

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
