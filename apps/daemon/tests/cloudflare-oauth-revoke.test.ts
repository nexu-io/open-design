// RFC 7009 revoke: Cloudflare's answer is a status, not a boolean.
//
// The callers of this primitive record DURABLE revoke intent — a grant they
// took off disk is named by a file until someone confirms it is dead — so they
// have to be able to tell the answers apart: a 2xx (the grant is dead), a 400
// `invalid_token` (a token the endpoint declines to revoke, which includes one
// that is still live), and a 429/5xx (the endpoint itself failing). A primitive
// that returned `resp.ok` alone made every non-throwing answer look settled, and
// a transient 503 then retired the only record of a live refresh token.

import { describe, expect, it, vi } from 'vitest';

import { revokeCloudflareToken } from '../src/integrations/cloudflare-oauth.js';

describe('revokeCloudflareToken', () => {
  it('reports the status Cloudflare answered with alongside whether it was honored', async () => {
    const cases: Array<{ status: number; ok: boolean }> = [
      { status: 200, ok: true },
      { status: 202, ok: true },
      { status: 400, ok: false },
      { status: 429, ok: false },
      { status: 503, ok: false },
    ];
    for (const { status, ok } of cases) {
      const requests: string[] = [];
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        requests.push(`${String(url)} ${String(init?.body ?? '')}`);
        return new Response(null, { status });
      }) as unknown as typeof fetch;

      expect(await revokeCloudflareToken({
        token: 'ref-1',
        tokenTypeHint: 'refresh_token',
        clientId: 'client-abc',
        fetchImpl,
      })).toEqual({ ok, status });

      // The request is RFC 7009 shaped either way: the token, the hint that
      // says the GRANT is what has to die, and the public-client id the token
      // was issued to (§2.1).
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('token=ref-1');
      expect(requests[0]).toContain('token_type_hint=refresh_token');
      expect(requests[0]).toContain('client_id=client-abc');
    }
  });

  it('still throws on a transport failure — that is not an answer at all', async () => {
    await expect(revokeCloudflareToken({
      token: 'ref-1',
      fetchImpl: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    })).rejects.toThrow('fetch failed');
  });
});
