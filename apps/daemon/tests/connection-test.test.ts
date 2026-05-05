// Coverage for the /api/test/connection route. Hits status mapping for each
// provider protocol and the agent-not-installed branch (the only spawn
// outcome we can deterministically reproduce without a live CLI on PATH).

import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createAgentSink,
  isSmokeOkReply,
  redactSecrets,
} from '../src/connectionTest.js';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

interface StartedServer {
  url: string;
  server: http.Server;
}

const realFetch = globalThis.fetch;
let baseUrl: string;
let server: http.Server;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function passThroughOrUpstream(handler: (url: string, init?: FetchInit) => Response | Promise<Response>) {
  return vi.fn((input: FetchInput, init?: FetchInit) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    return Promise.resolve(handler(url, init));
  });
}

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('POST /api/test/connection provider mode', () => {
  it('reports success and returns the model sample for an Anthropic 200', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({
          content: [{ type: 'text', text: 'ok' }],
        }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-5',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('success');
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(body.sample).toBe('ok');
  });

  it('maps a 401 to auth_failed', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({ error: { message: 'invalid x-api-key' } }, { status: 401 }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-bad',
        model: 'gpt-4o',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('auth_failed');
    expect(body.status).toBe(401);
  });

  it('maps a 404 to not_found_model', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({ error: { message: 'model not found' } }, { status: 404 }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-good',
        model: 'gpt-does-not-exist',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.kind).toBe('not_found_model');
    expect(body.status).toBe(404);
  });

  it('maps an ambiguous 404 to invalid_base_url', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() => new Response('', { status: 404 })),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v2',
        apiKey: 'ark-key',
        model: 'doubao-1-5-lite-32k-250115',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('invalid_base_url');
    expect(body.status).toBe(404);
    expect(body.detail).toContain('HTTP 404');
  });

  it('maps a 429 to rate_limited', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({ error: { message: 'too many requests' } }, { status: 429 }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-good',
        model: 'gpt-4o',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.kind).toBe('rate_limited');
  });

  it('maps a 500 to upstream_unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({ error: { message: 'oops' } }, { status: 503 }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-good',
        model: 'gpt-4o',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.kind).toBe('upstream_unavailable');
    expect(body.status).toBe(503);
  });

  it('does not treat a 200 response without assistant text as success', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({
          error: {
            message:
              'Unexpected endpoint or method. (POST /v2/chat/completions). Returning 200 anyway',
          },
        }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v2',
        apiKey: 'lm-studio',
        model: 'google/gemma-4-e4b',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('unknown');
    expect(body.status).toBe(200);
    expect(body.detail).toContain('Unexpected endpoint or method');
  });

  it('does not treat model-error assistant text as provider success', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  "There's an issue with the selected model (abcde). It may not exist.",
              },
            },
          ],
        }),
      ),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-good',
        model: 'abcde',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('not_found_model');
    expect(body.model).toBe('abcde');
    expect(body.detail).toContain('Expected smoke test reply "ok"');
  });

  it('treats a structured local reasoning completion with empty content as connected', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream((url) => {
        if (url === 'http://localhost:1234/v1/models') {
          return jsonResponse({
            data: [{ id: 'google/gemma-4-e4b', object: 'model' }],
          });
        }
        return jsonResponse({
          id: 'chatcmpl-reasoning',
          object: 'chat.completion',
          model: 'google/gemma-4-e4b',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                reasoning_content: '\nThe user wants me to reply with only ok',
              },
              finish_reason: 'length',
            },
          ],
        });
      }),
    );

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'lm-studio',
        model: 'google/gemma-4-e4b',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('success');
    expect(body.model).toBe('google/gemma-4-e4b');
    expect(body.sample).toBe('valid completion (length)');
  });

  it('rejects an unloaded local OpenAI-compatible model before completion', async () => {
    const fetchMock = passThroughOrUpstream((url) => {
      if (url === 'http://localhost:1234/v1/models') {
        return jsonResponse({
          data: [{ id: 'google/gemma-4-e4b', object: 'model' }],
        });
      }
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'lm-studio',
        model: 'helo',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('not_found_model');
    expect(body.model).toBe('helo');
    expect(body.detail).toContain('helo');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/chat/completions'),
      ),
    ).toBe(false);
  });

  it('reports forbidden for an internal-IP base URL without calling fetch', async () => {
    const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://192.168.1.5:8080/v1',
        apiKey: 'sk-good',
        model: 'gpt-4o',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('forbidden');
    // Internal-IP guard fires before any outbound fetch.
    expect(
      fetchMock.mock.calls.some(
        ([input]) => !String(input).startsWith(baseUrl),
      ),
    ).toBe(false);
  });

  it('allows IPv6 loopback base URLs for local OpenAI-compatible providers', async () => {
    const fetchMock = passThroughOrUpstream((url) => {
      if (url === 'http://[::1]:1234/v1/models') {
        return jsonResponse({
          data: [{ id: 'local-model', object: 'model' }],
        });
      }
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://[::1]:1234/v1',
        apiKey: 'lm-studio',
        model: 'local-model',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('success');
  });

  it('reports forbidden for internal IPv6 base URLs without calling fetch', async () => {
    for (const blockedBaseUrl of [
      'http://[fd00::1]:1234/v1',
      'http://[fe80::1]:1234/v1',
      'http://[::ffff:192.168.1.5]:1234/v1',
    ]) {
      const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      const res = await realFetch(`${baseUrl}/api/test/connection`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'provider',
          protocol: 'openai',
          baseUrl: blockedBaseUrl,
          apiKey: 'sk-good',
          model: 'gpt-4o',
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.kind).toBe('forbidden');
      expect(
        fetchMock.mock.calls.some(
          ([input]) => !String(input).startsWith(baseUrl),
        ),
      ).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('routes Azure tests to the deployments endpoint with api-key auth', async () => {
    const fetchMock = passThroughOrUpstream(() =>
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'azure',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiKey: 'azure-key',
        model: 'deployment-1',
        apiVersion: '2024-10-21',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sample).toBe('ok');
    const upstream = fetchMock.mock.calls.find(
      ([input]) => !String(input).startsWith(baseUrl),
    );
    expect(upstream).toBeDefined();
    const [upstreamUrl, upstreamInit] = upstream!;
    expect(String(upstreamUrl)).toBe(
      'https://my-azure.openai.azure.com/openai/deployments/deployment-1/chat/completions?api-version=2024-10-21',
    );
    expect((upstreamInit?.headers as Record<string, string>)['api-key']).toBe(
      'azure-key',
    );
  });

  it('uses the non-streaming Gemini endpoint and extracts text from candidates', async () => {
    const fetchMock = passThroughOrUpstream(() =>
      jsonResponse({
        candidates: [
          { content: { parts: [{ text: 'ok' }] } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'goog-key',
        model: 'gemini-2.0-flash',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sample).toBe('ok');
    const upstream = fetchMock.mock.calls.find(
      ([input]) => !String(input).startsWith(baseUrl),
    );
    expect(String(upstream![0])).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
  });

  it('rejects malformed bodies with HTTP 400 (not the test envelope)', async () => {
    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'provider', protocol: 'openai' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/test/connection agent mode', () => {
  it('reports agent_not_installed for an unknown agent id', async () => {
    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'agent', agentId: 'this-agent-does-not-exist' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('agent_not_installed');
    expect(body.model).toBe('default');
  });

  it('rejects requests missing agentId with HTTP 400', async () => {
    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'agent' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('connection test helpers', () => {
  it('redacts the exact submitted provider key when it appears in body text', () => {
    const detail = redactSecrets(
      'Incorrect API key provided: sk-test-raw-secret.',
      ['sk-test-raw-secret'],
    );

    expect(detail).toBe('Incorrect API key provided: [REDACTED].');
    expect(detail).not.toContain('sk-test-raw-secret');
  });

  it('does not resolve the agent smoke test from thinking deltas', async () => {
    const sink = createAgentSink();
    sink.send('agent', { type: 'thinking_delta', delta: 'thinking first' });

    await expect(
      Promise.race([
        sink.firstText,
        new Promise((resolve) => setTimeout(() => resolve('pending'), 0)),
      ]),
    ).resolves.toBe('pending');

    sink.send('agent', { type: 'text_delta', delta: 'ok' });
    await expect(sink.firstText).resolves.toBe('ok');
  });

  it('rejects the agent smoke test from structured stream errors', async () => {
    const sink = createAgentSink();
    sink.send('agent', {
      type: 'error',
      message: "The 'gpt-5.5' model requires a newer version of Codex.",
    });

    await expect(sink.firstText).rejects.toThrow(
      "The 'gpt-5.5' model requires a newer version of Codex.",
    );
  });

  it('requires the smoke reply to be exactly ok after whitespace and case', () => {
    expect(isSmokeOkReply('ok')).toBe(true);
    expect(isSmokeOkReply(' OK \n')).toBe(true);
    expect(isSmokeOkReply('ok.')).toBe(false);
    expect(
      isSmokeOkReply(
        "There's an issue with the selected model (abcde). It may not exist.",
      ),
    ).toBe(false);
  });
});
