// fetchByokHostDefaults backs the chat preflight's host-managed BYOK bypass:
// it must surface the daemon's keyless view when present, and fail CLOSED
// (configured: false) on old daemons, 4xx/5xx, and network errors so the
// historical preflight behavior is preserved in every degraded case.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchByokHostDefaults } from '../../src/providers/daemon';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchByokHostDefaults', () => {
  it('returns the daemon view when a host default is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            configured: true,
            protocol: 'openai',
            baseUrl: 'https://gw.internal.example.com/v1',
            model: 'gateway-model',
            apiKeyTail: 'cret',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )),
    );

    const view = await fetchByokHostDefaults();

    expect(view).toMatchObject({
      configured: true,
      protocol: 'openai',
      baseUrl: 'https://gw.internal.example.com/v1',
      model: 'gateway-model',
      apiKeyTail: 'cret',
    });
    // The contract is keyless: no field may carry a full key.
    expect(JSON.stringify(view)).not.toContain('sk-');
  });

  it('passes through the not-configured view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ configured: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })),
    );
    expect(await fetchByokHostDefaults()).toEqual({ configured: false });
  });

  it('fails closed on a daemon that predates the endpoint (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    expect(await fetchByokHostDefaults()).toEqual({ configured: false });
  });

  it('fails closed when the daemon is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await fetchByokHostDefaults()).toEqual({ configured: false });
  });
});
