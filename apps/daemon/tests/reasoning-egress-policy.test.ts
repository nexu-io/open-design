import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const realFetch = globalThis.fetch;

function sseResponse(body: string): Response {
  return new Response(new TextEncoder().encode(body), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('reasoningExecution egress policy', () => {
  let baseUrl: string;
  let server: http.Server | null = null;

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

  afterAll(() => new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  }));

  function stubUnexpectedUpstreamFetch() {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      throw new Error(`unexpected upstream fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function postJson(path: string, body: unknown): Promise<Response> {
    return realFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function expectReasoningDenied(
    path: string,
    body: Record<string, unknown>,
    expected: { routeKind: string; provider: string; code?: string; status?: number },
  ) {
    const fetchMock = stubUnexpectedUpstreamFetch();
    const res = await postJson(path, body);
    expect(res.status).toBe(expected.status ?? 403);
    const payload = await res.json() as {
      error: {
        code: string;
        data: Record<string, unknown>;
      };
    };
    expect(payload.error.code).toBe(expected.code ?? 'reasoning_execution_disabled');
    expect(payload.error.data).toMatchObject({
      routeKind: expected.routeKind,
      provider: expected.provider,
    });
    if (typeof body.apiKey === 'string') {
      expect(JSON.stringify(payload)).not.toContain(body.apiKey);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  }

  const disabledPolicy = { mode: 'disabled' };

  it.each([
    { label: 'missing mode object', reasoningExecution: {} },
    { label: 'invalid mode object', reasoningExecution: { mode: 'off' } },
    { label: 'null value', reasoningExecution: null },
    { label: 'array value', reasoningExecution: [] },
  ])('rejects malformed reasoningExecution before upstream fetch: $label', async ({ reasoningExecution }) => {
    await expectReasoningDenied(
      '/api/proxy/openai/stream',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
        reasoningExecution,
      },
      {
        status: 400,
        routeKind: 'proxy',
        provider: 'openai',
        code: 'reasoning_execution_invalid_policy',
      },
    );
  });

  it.each([
    {
      provider: 'anthropic',
      path: '/api/proxy/anthropic/stream',
      body: {
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant',
        model: 'claude-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'openai',
      path: '/api/proxy/openai/stream',
      body: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'azure',
      path: '/api/proxy/azure/stream',
      body: {
        baseUrl: 'https://resource.openai.azure.com',
        apiKey: 'azure-key',
        model: 'deployment-one',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'google',
      path: '/api/proxy/google/stream',
      body: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'google-key',
        model: 'gemini-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'ollama',
      path: '/api/proxy/ollama/stream',
      body: {
        baseUrl: 'https://ollama.example.com',
        apiKey: 'ollama-key',
        model: 'llama3',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'senseaudio',
      path: '/api/proxy/senseaudio/stream',
      body: {
        baseUrl: 'https://api.senseaudio.cn',
        apiKey: 'senseaudio-key',
        model: 'senseaudio-s2',
        projectId: 'project-1',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'aihubmix',
      path: '/api/proxy/aihubmix/stream',
      body: {
        baseUrl: 'https://aihubmix.com/v1',
        apiKey: 'aihubmix-key',
        model: 'gpt-test',
        projectId: 'project-1',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      provider: 'newprovider',
      path: '/api/proxy/newprovider/stream',
      body: {
        baseUrl: 'https://newprovider.example.com/v1',
        apiKey: 'newprovider-key',
        model: 'new-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
  ])('blocks disabled proxy egress for $provider before upstream fetch', async ({ path, provider, body }) => {
    await expectReasoningDenied(
      path,
      { ...body, reasoningExecution: disabledPolicy },
      { routeKind: 'proxy', provider },
    );
  });

  it('blocks disabled provider model discovery before upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/provider/models',
      {
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'provider_models', provider: 'openai' },
    );
  });

  it('blocks disabled provider connection tests before upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/test/connection',
      {
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'connection_test', provider: 'openai' },
    );
  });

  it('blocks disabled finalize egress before project lookup or upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/projects/project-1/finalize/openai',
      {
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'finalize', provider: 'openai' },
    );
  });

  it('allows proxy egress only when base URL and model are allowlisted', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await postJson('/api/proxy/openai/stream', {
      baseUrl: 'http://localhost:1234/v1/',
      apiKey: 'sk-openai',
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      reasoningExecution: {
        mode: 'allowlist',
        allowedBaseUrls: ['http://localhost:1234/v1'],
        allowedModels: ['gpt-test'],
      },
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain('event: end');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('canonicalizes Google proxy model ids before checking the allowlist', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await postJson('/api/proxy/google/stream', {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'google-key',
      model: 'models/gemini-test',
      messages: [{ role: 'user', content: 'hello' }],
      reasoningExecution: {
        mode: 'allowlist',
        allowedBaseUrls: ['https://generativelanguage.googleapis.com'],
        allowedModels: ['gemini-test'],
      },
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain('event: end');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('denies allowlist proxy egress when the resolved base URL is not allowlisted', async () => {
    await expectReasoningDenied(
      '/api/proxy/openai/stream',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
        reasoningExecution: {
          mode: 'allowlist',
          allowedBaseUrls: ['http://localhost:1234/v1'],
          allowedModels: ['gpt-test'],
        },
      },
      {
        routeKind: 'proxy',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
  });

  it('denies allowlist proxy egress when the model is not allowlisted', async () => {
    await expectReasoningDenied(
      '/api/proxy/openai/stream',
      {
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        model: 'gpt-other',
        messages: [{ role: 'user', content: 'hello' }],
        reasoningExecution: {
          mode: 'allowlist',
          allowedBaseUrls: ['http://localhost:1234/v1'],
          allowedModels: ['gpt-test'],
        },
      },
      {
        routeKind: 'proxy',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
  });

  it('honors explicit allowlist denial flags for discovery, tests, and finalize', async () => {
    const policy = {
      mode: 'allowlist',
      allowedBaseUrls: ['http://localhost:1234/v1'],
      allowedModels: ['gpt-test'],
      denyProviderDiscovery: true,
      denyConnectionTests: true,
      denyFinalize: true,
    };

    await expectReasoningDenied(
      '/api/provider/models',
      {
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        reasoningExecution: policy,
      },
      {
        routeKind: 'provider_models',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
    await expectReasoningDenied(
      '/api/test/connection',
      {
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: policy,
      },
      {
        routeKind: 'connection_test',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
    await expectReasoningDenied(
      '/api/projects/project-1/finalize/openai',
      {
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: policy,
      },
      {
        routeKind: 'finalize',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
  });
});
