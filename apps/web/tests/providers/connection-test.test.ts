// Surface checks for the daemon /api/test/connection helper. Verifies the request
// shape (URL, method, JSON body), happy-path decoding, and how the helper
// degrades when the daemon answers with a 5xx envelope.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testAgent, testApiProvider } from '../../src/providers/connection-test';
import type { ConnectionTestResponse } from '../../src/types';

const realFetch = globalThis.fetch;

beforeEach(() => {
  // Each test installs its own stub.
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('testApiProvider', () => {
  it('POSTs the protocol-shaped body and returns the daemon envelope', async () => {
    const expected: ConnectionTestResponse = {
      ok: true,
      kind: 'success',
      latencyMs: 42,
      model: 'claude-sonnet-4-5',
      sample: 'ok',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(expected));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await testApiProvider({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
    });

    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/test/connection');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toMatchObject({
      mode: 'provider',
      protocol: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
    });
  });

  it('synthesizes a kind=unknown envelope when the daemon returns 5xx', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'daemon down' } }, 500),
      ) as typeof fetch;

    const result = await testApiProvider({
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk',
      model: 'gpt-4o',
    });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('unknown');
    expect(result.model).toBe('gpt-4o');
    expect(result.detail).toContain('daemon down');
  });

  it('rethrows AbortError so the UI can suppress the resulting state update', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(() => {
      controller.abort();
      return Promise.reject(
        new DOMException('aborted', 'AbortError'),
      );
    }) as typeof fetch;

    await expect(
      testApiProvider(
        {
          protocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk',
          model: 'gpt-4o',
        },
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});

describe('testAgent', () => {
  it('POSTs to /api/test/connection with model and reasoning passthrough', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: false,
          kind: 'agent_not_installed',
          latencyMs: 0,
          agentName: 'Devin',
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await testAgent({
      agentId: 'devin',
      model: 'sonnet',
      reasoning: 'high',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    });

    expect(result.kind).toBe('agent_not_installed');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/test/connection');
    expect(JSON.parse(init.body)).toEqual({
      mode: 'agent',
      agentId: 'devin',
      model: 'sonnet',
      reasoning: 'high',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    });
  });
});
