import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn(
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = typeof input === 'string' ? input : input.toString();
    const prefixedPath = `/open-design${path}`;
    return init === undefined ? fetch(prefixedPath) : fetch(prefixedPath, init);
  },
));

vi.mock('../../src/runtime/web-path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/web-path')>()),
  apiFetch,
}));

import {
  fetchByokCredentialProfilesFromDaemon,
  persistByokCredentialProfileToDaemon,
} from '../../src/state/config';
import { testSavedByokProfile } from '../../src/providers/connection-test';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  apiFetch.mockClear();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BYOK requests under a configured web base path', () => {
  it('prefixes profile listing requests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      available: true,
      backend: 'macos-keychain',
      profiles: [],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchByokCredentialProfilesFromDaemon();

    expect(fetchMock).toHaveBeenCalledWith('/open-design/api/byok/profiles');
  });

  it('prefixes profile persistence requests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      profile: {
        id: 'byok-openrouter-1',
        configured: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await persistByokCredentialProfileToDaemon({
      label: 'OpenRouter',
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      apiKey: 'draft-secret',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/open-design/api/byok/profiles',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('prefixes saved-profile connection tests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      model: 'openrouter/free',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await testSavedByokProfile('byok-openrouter/profile');

    expect(fetchMock).toHaveBeenCalledWith(
      '/open-design/api/byok/profiles/byok-openrouter%2Fprofile/test',
      { method: 'POST', signal: undefined },
    );
  });
});
