import type http from 'node:http';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

describe('API proxy routes', () => {
  const realFetch = globalThis.fetch;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('converts OpenAI-compatible CRLF SSE chunks into proxy delta/end events', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse([
        'data: {"choices":[{"delta":',
        'data: {"content":"hi"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\r\n')));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('event: delta\ndata: {"delta":"hi"}');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
        redirect: 'error',
      }),
    );
  });

  // Regression: appendVersionedApiPath needs to thread three shapes:
  //   * bare host                  → inject /v1 (api.openai.com)
  //   * sub-path containing /vN    → no inject (api.deepinfra.com/v1/openai)
  //   * sub-path without /vN       → inject /v1 (api.deepseek.com/anthropic)
  // The earlier end-of-path check broke the second case; a "non-empty
  // path → respect verbatim" intermediate fix broke the third. Pin all
  // three so neither regression returns.
  it.each([
    [
      'https://api.deepinfra.com/v1/openai',
      'https://api.deepinfra.com/v1/openai/chat/completions',
    ],
    [
      'https://api.deepinfra.com/v1/openai/',
      'https://api.deepinfra.com/v1/openai/chat/completions',
    ],
    [
      'https://openrouter.ai/api/v1',
      'https://openrouter.ai/api/v1/chat/completions',
    ],
    [
      'https://api.openai.com',
      'https://api.openai.com/v1/chat/completions',
    ],
    [
      'https://api.openai.com/',
      'https://api.openai.com/v1/chat/completions',
    ],
  ])('routes OpenAI baseUrl %s to %s', async (input, expected) => {
    const fetchMock = vi.fn((req: FetchInput, init?: FetchInit) => {
      const url = String(req);
      if (url.startsWith(baseUrl)) return realFetch(req, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: input,
        apiKey: 'sk-test',
        model: 'm',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(expected);
  });

  // The Anthropic proxy goes through the same `appendVersionedApiPath`
  // helper, but its preset table includes Anthropic-compatible gateways
  // mounted at non-versioned sub-paths (DeepSeek `/anthropic`, MiniMax
  // `/anthropic`, MiMo `/anthropic`). Those still need the `/v1`
  // injection, otherwise upstream returns 404 on `.../anthropic/messages`.
  it.each([
    [
      'https://api.anthropic.com',
      'https://api.anthropic.com/v1/messages',
    ],
    [
      'https://api.deepseek.com/anthropic',
      'https://api.deepseek.com/anthropic/v1/messages',
    ],
    [
      'https://api.minimaxi.com/anthropic',
      'https://api.minimaxi.com/anthropic/v1/messages',
    ],
    [
      'https://token-plan-cn.xiaomimimo.com/anthropic',
      'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages',
    ],
  ])('routes Anthropic baseUrl %s to %s', async (input, expected) => {
    const fetchMock = vi.fn((req: FetchInput, init?: FetchInit) => {
      const url = String(req);
      if (url.startsWith(baseUrl)) return realFetch(req, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/anthropic/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: input,
        apiKey: 'sk-test',
        model: 'm',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(expected);
  });

  it('allows loopback API base URLs for local OpenAI-compatible providers', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'sk-local',
        model: 'llama-local',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain('event: end');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-local' }),
        redirect: 'error',
      }),
    );
  });

  it('allows IPv4-mapped loopback API base URLs for local OpenAI-compatible providers', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'http://[::ffff:127.0.0.1]:11434/v1',
        apiKey: 'sk-local',
        model: 'llama-local',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain('event: end');
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://[::ffff:7f00:1]:11434/v1/chat/completions',
    );
  });

  it('blocks private network API base URLs before proxying', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'http://192.168.1.50:11434/v1',
        apiKey: 'sk-private',
        model: 'private-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.text()).resolves.toContain('Internal IPs blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://0.0.0.0:11434/v1',
    'http://100.64.0.1:11434/v1',
    'http://169.254.169.254/latest/meta-data',
    'http://224.0.0.1:11434/v1',
    'http://[::]/v1',
    'http://[::ffff:192.168.1.50]:11434/v1',
    'http://[fd00::1]:11434/v1',
    'http://[fe80::1]:11434/v1',
  ])('blocks local and private API base URL form %s before proxying', async (privateBaseUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: privateBaseUrl,
        apiKey: 'sk-private',
        model: 'private-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.text()).resolves.toContain('Internal IPs blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces OpenAI-compatible in-stream error frames', async () => {
    vi.stubGlobal('fetch', vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"error":{"message":"bad model"}}\n\n'));
    }));

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'bad-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('Provider error: bad model');
  });

  it('uses Azure deployment URLs and api-key auth', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/azure/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://resource.openai.azure.com',
        apiKey: 'azure-key',
        model: 'deployment-one',
        apiVersion: '2024-10-21',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [upstreamUrl, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(
      'https://resource.openai.azure.com/openai/deployments/deployment-one/chat/completions?api-version=2024-10-21',
    );
    expect(upstreamInit?.headers).toMatchObject({ 'api-key': 'azure-key' });
    expect(upstreamInit?.redirect).toBe('error');
  });

  it.each([
    ['anthropic', 'https://api.anthropic.com/v1/messages'],
    ['openai', 'https://api.openai.com/v1/chat/completions'],
    [
      'azure',
      'https://resource.openai.azure.com/openai/deployments/model-one/chat/completions?api-version=2024-10-21',
    ],
    [
      'google',
      'https://generativelanguage.googleapis.com/v1beta/models/model-one:streamGenerateContent?alt=sse',
    ],
  ])('disables upstream redirects for %s proxy requests', async (provider, expectedUrl) => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (url === expectedUrl && init?.redirect === 'error') {
        return Promise.reject(new TypeError('fetch failed: redirect blocked'));
      }
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const requestBody: Record<string, unknown> = {
      baseUrl:
        provider === 'azure'
          ? 'https://resource.openai.azure.com'
          : provider === 'google'
            ? 'https://generativelanguage.googleapis.com'
            : provider === 'anthropic'
              ? 'https://api.anthropic.com'
              : 'https://api.openai.com',
      apiKey: `${provider}-key`,
      model: 'model-one',
      messages: [{ role: 'user', content: 'hello' }],
    };
    if (provider === 'azure') requestBody.apiVersion = '2024-10-21';

    const res = await realFetch(`${baseUrl}/api/proxy/${provider}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const text = await res.text();
    expect(text).toContain('event: error');
    const [upstreamUrl, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(expectedUrl);
    expect(upstreamInit?.redirect).toBe('error');
  });

  it('keeps the default Azure api-version for deployment URLs when the field is blank', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/azure/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://resource.openai.azure.com',
        apiKey: 'azure-key',
        model: 'deployment-one',
        apiVersion: '',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [upstreamUrl] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(
      'https://resource.openai.azure.com/openai/deployments/deployment-one/chat/completions?api-version=2024-10-21',
    );
  });

  it('omits Azure api-version for OpenAI-compatible v1 paths when the field is blank', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/azure/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiKey: 'azure-key',
        model: 'deployment-one',
        apiVersion: '',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [upstreamUrl, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(
      'https://resource.services.ai.azure.com/api/projects/project/openai/v1/chat/completions',
    );
    expect(JSON.parse(String(upstreamInit?.body))).toMatchObject({
      model: 'deployment-one',
    });
  });

  it('removes copied Azure api-version query params for OpenAI-compatible v1 paths when the field is blank', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/azure/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl:
          'https://resource.services.ai.azure.com/api/projects/project/openai/v1?api-version=2024-10-21',
        apiKey: 'azure-key',
        model: 'deployment-one',
        apiVersion: '',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [upstreamUrl] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(
      'https://resource.services.ai.azure.com/api/projects/project/openai/v1/chat/completions',
    );
  });

  it('surfaces Gemini safety blocks as proxy errors', async () => {
    vi.stubGlobal('fetch', vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'));
    }));

    const res = await realFetch(`${baseUrl}/api/proxy/google/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'google-key',
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('Gemini blocked the prompt (SAFETY).');
  });

  it('forwards maxTokens to Gemini generation config', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/google/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'google-key',
        model: 'gemini-2.0-flash',
        maxTokens: 1234,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(upstreamInit?.redirect).toBe('error');
    expect(JSON.parse(String(upstreamInit?.body))).toMatchObject({
      generationConfig: { maxOutputTokens: 1234 },
    });
  });

  // Plan §3.A4 / spec §11.8 (e2e-7): the API-fallback proxy paths must
  // never carry plugin context. The web sidecar's fallback mode bypasses
  // the daemon snapshot bus, so any pluginId / appliedPluginSnapshotId in
  // the body short-circuits with 409 PLUGIN_REQUIRES_DAEMON. This is the
  // behavioral anchor for e2e-7 and is exercised against every proxy entry.
  describe('API fallback rejects plugin runs', () => {
    const proxies = [
      '/api/proxy/anthropic/stream',
      '/api/proxy/openai/stream',
      '/api/proxy/azure/stream',
      '/api/proxy/google/stream',
    ];

    for (const path of proxies) {
      it(`rejects pluginId on ${path} with 409 PLUGIN_REQUIRES_DAEMON`, async () => {
        const res = await realFetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'hello' }],
            pluginId: 'sample-plugin',
          }),
        });
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error?: { code?: string } };
        expect(body?.error?.code).toBe('PLUGIN_REQUIRES_DAEMON');
      });

      it(`rejects appliedPluginSnapshotId on ${path}`, async () => {
        const res = await realFetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'hello' }],
            appliedPluginSnapshotId: '00000000-0000-0000-0000-000000000000',
          }),
        });
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error?: { code?: string } };
        expect(body?.error?.code).toBe('PLUGIN_REQUIRES_DAEMON');
      });
    }
  });
});

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}
