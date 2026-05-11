// Coverage for the /api/test/connection route. Hits status mapping for each
// provider protocol and uses fake CLI bins for deterministic agent outcomes.

import type http from 'node:http';
import { promises as dnsPromises } from 'node:dns';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createAgentSink,
  isSmokeOkReply,
  redactSecrets,
  resolveConnectionTestTimeoutMs,
  testAgentConnection,
  testProviderConnection,
  validateBaseUrlResolved,
  type DnsLookupAddress,
} from '../src/connectionTest.js';
import { listProviderModels } from '../src/providerModels.js';
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

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { 'content-type': 'text/plain', ...(init?.headers ?? {}) },
  });
}

function passThroughOrUpstream(handler: (url: string, init?: FetchInit) => Response | Promise<Response>) {
  return vi.fn((input: FetchInput, init?: FetchInit) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    return Promise.resolve(handler(url, init));
  });
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        path.join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = path.join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function withFakeCodex<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('codex', script, run);
}

async function withFakeClaude<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('claude', script, run);
}

async function withFakeOpenCode<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('opencode', script, run);
}

async function withFakeCursorAgent<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('cursor-agent', script, run);
}

async function waitForFile(file: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fsp.access(file);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${file}`);
}

async function waitForPidToExit(pid: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for process ${pid} to exit`);
}

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('POST /api/provider/models', () => {
  it('lists OpenAI-compatible models from /models', async () => {
    const fetchMock = passThroughOrUpstream((url, init) => {
      expect(url).toBe('https://api.openai.com/v1/models');
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer sk-openai',
      );
      return jsonResponse({
        data: [
          { id: 'gpt-4o-mini', object: 'model' },
          { id: 'gpt-4o', object: 'model' },
          { id: 'gpt-4o', object: 'model' },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/provider/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      kind: 'success',
      models: [
        { id: 'gpt-4o', label: 'gpt-4o' },
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      ],
    });
  });

  it('lists Anthropic models with display names and a high page limit', async () => {
    const fetchMock = passThroughOrUpstream((url, init) => {
      expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000');
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe(
        'sk-ant',
      );
      expect((init?.headers as Record<string, string>)['anthropic-version']).toBe(
        '2023-06-01',
      );
      return jsonResponse({
        data: [
          {
            id: 'claude-sonnet-4-5',
            display_name: 'Claude Sonnet 4.5',
            type: 'model',
          },
          {
            id: 'claude-haiku-4-5',
            display_name: 'Claude Haiku 4.5',
            type: 'model',
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/provider/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant',
      }),
    });

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      models: [
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      ],
    });
  });

  it('lists only Gemini models that support generateContent', async () => {
    const fetchMock = passThroughOrUpstream((url) => {
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models?key=goog-key',
      );
      return jsonResponse({
        models: [
          {
            name: 'models/gemini-custom',
            displayName: 'Gemini Custom',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/text-embedding-004',
            displayName: 'Embedding',
            supportedGenerationMethods: ['embedContent'],
          },
          {
            name: 'models/gemini-2.0-flash-001',
            baseModelId: 'gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/provider/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'goog-key',
      }),
    });

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      models: [
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { id: 'gemini-custom', label: 'Gemini Custom' },
      ],
    });
  });

  it('lets unsupported contract protocols return a classified provider-models result', async () => {
    const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/provider/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'ollama',
        baseUrl: 'https://ollama.com',
        apiKey: 'ollama-key',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      kind: 'unsupported_protocol',
    });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => !String(input).startsWith(baseUrl),
      ),
    ).toBe(false);
  });

  it('maps upstream listing failures to categorized results and redacts keys', async () => {
    for (const [status, kind, response] of [
      [
        401,
        'auth_failed',
        (apiKey: string) => jsonResponse(
          { error: { message: `bad key ${apiKey}` } },
          { status: 401 },
        ),
      ],
      [
        429,
        'rate_limited',
        (apiKey: string) => textResponse(`rate limit for ${apiKey}`, { status: 429 }),
      ],
      [
        503,
        'upstream_unavailable',
        (apiKey: string) => textResponse(
          `<html>temporary outage for ${apiKey}</html>`,
          { status: 503, headers: { 'content-type': 'text/html' } },
        ),
      ],
    ] as const) {
      const apiKey = `sk-secret-models-${status}`;
      vi.stubGlobal(
        'fetch',
        passThroughOrUpstream(() => response(apiKey)),
      );

      const res = await realFetch(`${baseUrl}/api/provider/models`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey,
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: false, kind, status });
      expect(String(body.detail)).not.toContain(apiKey);
      vi.unstubAllGlobals();
    }
  });

  it('rejects private-network base URLs without calling upstream fetch', async () => {
    const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/provider/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'openai',
        baseUrl: 'http://192.168.1.5:8080/v1',
        apiKey: 'sk-good',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => !String(input).startsWith(baseUrl),
      ),
    ).toBe(false);
  });

  // Regression for the DNS-bypass SSRF gap flagged on PR #1176: the route
  // must resolve the hostname and reject when *any* resolved address is in
  // a blocked range, not just when the literal hostname is a private IP.
  it('rejects hostnames that resolve to a private IP without calling upstream fetch', async () => {
    const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation((async (hostname: string) => {
        if (hostname === 'rebind.example.test') {
          return [{ address: '10.0.0.5', family: 4 }];
        }
        const err: NodeJS.ErrnoException = new Error('ENOTFOUND');
        err.code = 'ENOTFOUND';
        throw err;
      }) as unknown as typeof dnsPromises.lookup);
    try {
      const res = await realFetch(`${baseUrl}/api/provider/models`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocol: 'openai',
          baseUrl: 'https://rebind.example.test/v1',
          apiKey: 'sk-good',
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: false, kind: 'forbidden' });
      expect(
        fetchMock.mock.calls.some(
          ([input]) => !String(input).startsWith(baseUrl),
        ),
      ).toBe(false);
    } finally {
      dnsSpy.mockRestore();
    }
  });

  it('reports timeout when model listing is aborted by the probe timer', async () => {
    // The DNS-aware validator runs before the probe timer is installed; stub
    // the resolver so the test doesn't race against real DNS while fake
    // timers are active.
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation((async () => [
        { address: '203.0.113.10', family: 4 },
      ]) as unknown as typeof dnsPromises.lookup);
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: FetchInput, init?: FetchInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
      ),
    );

    try {
      const pending = listProviderModels({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-timeout',
      });

      await vi.advanceTimersByTimeAsync(12_000);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        kind: 'timeout',
      });
    } finally {
      dnsSpy.mockRestore();
    }
  });
});

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

  it('redacts submitted keys from success samples', async () => {
    vi.stubGlobal(
      'fetch',
      passThroughOrUpstream(() =>
        jsonResponse({
          content: [{ type: 'text', text: 'debug echo sk-success-secret' }],
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
        apiKey: 'sk-success-secret',
        model: 'claude-sonnet-4-5',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sample).toBe('debug echo [REDACTED]');
    expect(body.sample).not.toContain('sk-success-secret');
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

  it('does not add a duplicate version segment for versioned OpenAI-compatible subpaths', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (url.endsWith('/models')) {
        return Promise.resolve(jsonResponse({ data: [{ id: 'm' }] }));
      }
      return Promise.resolve(
        jsonResponse({
          choices: [{ message: { content: 'ok' } }],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        apiKey: 'sk-good',
        model: 'm',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepinfra.com/v1/openai/chat/completions',
      expect.anything(),
    );
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

  // Regression for the DNS-bypass SSRF gap flagged on PR #1176: provider
  // mode must run the same resolved-IP check as the proxy/finalize paths
  // so a public hostname pointing at a private address can't be fetched.
  it('reports forbidden for hostnames that resolve to a private IP without calling fetch', async () => {
    const fetchMock = passThroughOrUpstream(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation((async (hostname: string) => {
        if (hostname === 'rebind.example.test') {
          return [{ address: '10.0.0.5', family: 4 }];
        }
        const err: NodeJS.ErrnoException = new Error('ENOTFOUND');
        err.code = 'ENOTFOUND';
        throw err;
      }) as unknown as typeof dnsPromises.lookup);
    try {
      const res = await realFetch(`${baseUrl}/api/test/connection`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'provider',
          protocol: 'openai',
          baseUrl: 'https://rebind.example.test/v1',
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
    } finally {
      dnsSpy.mockRestore();
    }
  });

  it('allows IPv6 loopback base URLs for local OpenAI-compatible providers', async () => {
    for (const loopbackBaseUrl of [
      'http://[::1]:1234/v1',
      'http://[::ffff:127.0.0.1]:1234/v1',
    ]) {
      const fetchMock = passThroughOrUpstream((url) => {
        if (url.endsWith('/models')) {
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
          baseUrl: loopbackBaseUrl,
          apiKey: 'lm-studio',
          model: 'local-model',
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.kind).toBe('success');
      vi.unstubAllGlobals();
    }
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

  it('keeps the default Azure api-version in connection tests when the field is blank', async () => {
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
        apiVersion: '',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const upstream = fetchMock.mock.calls.find(
      ([input]) => !String(input).startsWith(baseUrl),
    );
    expect(upstream).toBeDefined();
    const [upstreamUrl] = upstream!;
    expect(String(upstreamUrl)).toBe(
      'https://my-azure.openai.azure.com/openai/deployments/deployment-1/chat/completions?api-version=2024-10-21',
    );
  });

  it('omits Azure api-version in connection tests for OpenAI-compatible v1 paths when blank', async () => {
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
        baseUrl: 'https://my-resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiKey: 'azure-key',
        model: 'deployment-1',
        apiVersion: '',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const upstream = fetchMock.mock.calls.find(
      ([input]) => !String(input).startsWith(baseUrl),
    );
    expect(upstream).toBeDefined();
    const [upstreamUrl, upstreamInit] = upstream!;
    expect(String(upstreamUrl)).toBe(
      'https://my-resource.services.ai.azure.com/api/projects/project/openai/v1/chat/completions',
    );
    expect(JSON.parse(String(upstreamInit?.body))).toMatchObject({
      model: 'deployment-1',
    });
  });

  it('removes copied Azure api-version query params in connection tests for OpenAI-compatible v1 paths when blank', async () => {
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
        baseUrl:
          'https://my-resource.services.ai.azure.com/api/projects/project/openai/v1?api-version=2024-10-21',
        apiKey: 'azure-key',
        model: 'deployment-1',
        apiVersion: '',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const upstream = fetchMock.mock.calls.find(
      ([input]) => !String(input).startsWith(baseUrl),
    );
    expect(upstream).toBeDefined();
    const [upstreamUrl] = upstream!;
    expect(String(upstreamUrl)).toBe(
      'https://my-resource.services.ai.azure.com/api/projects/project/openai/v1/chat/completions',
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

  it('cancels provider probes when the caller aborts', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: FetchInput, init?: FetchInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
      ),
    );

    const pending = testProviderConnection({
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-good',
      model: 'gpt-4o',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      kind: 'timeout',
    });
  });
});

describe('POST /api/test/connection agent mode', () => {
  it('reports success for a fake Codex agent response', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'codex' }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: true,
          kind: 'success',
          agentName: 'Codex CLI',
          sample: 'ok',
        });
      },
    );
  });

  it('spawns agent tests with draft allowlisted CLI env', async () => {
    const markerDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-env-'));
    const envFile = path.join(markerDir, 'env.json');
    const codexHome = path.join(markerDir, 'codex-home');
    try {
      await withFakeCodex(
        `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(envFile)}, JSON.stringify({
  CODEX_HOME: process.env.CODEX_HOME || null,
  SHOULD_NOT_PASS: process.env.OD_CONNECTION_TEST_SHOULD_NOT_PASS || null,
}));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
`,
        async () => {
          const res = await realFetch(`${baseUrl}/api/test/connection`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mode: 'agent',
              agentId: 'codex',
              agentCliEnv: {
                codex: {
                  CODEX_HOME: codexHome,
                  OD_CONNECTION_TEST_SHOULD_NOT_PASS: 'leaked',
                },
                claude: {
                  CLAUDE_CONFIG_DIR: path.join(markerDir, 'claude'),
                },
              },
            }),
          });
          expect(res.status).toBe(200);
          await expect(res.json()).resolves.toMatchObject({
            ok: true,
            kind: 'success',
            agentName: 'Codex CLI',
          });
          await expect(fsp.readFile(envFile, 'utf8')).resolves.toBe(
            JSON.stringify({
              CODEX_HOME: codexHome,
              SHOULD_NOT_PASS: null,
            }),
          );
        },
      );
    } finally {
      await fsp.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('waits for the Codex process before accepting early success text', async () => {
    await withFakeCodex(
      `
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
setTimeout(() => {
  console.log(JSON.stringify({ type: 'error', message: 'late failure after ok' }));
  setTimeout(() => process.exit(1), 50);
}, 700);
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'codex' }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'Codex CLI',
          detail: 'late failure after ok',
        });
      },
    );
  });

  it('classifies split agent model-error text after buffering the full response', async () => {
    await withFakeCodex(
      `
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Error:' } }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: ' model not found' } }));
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'codex', model: 'missing-model' }),
        });
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'not_found_model',
          model: 'missing-model',
        });
      },
    );
  });

  it('reports structured agent stream errors without treating them as success', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'error', message: "The 'gpt-5.5' model requires a newer version of Codex." }));`,
      async () => {
        const result = await testAgentConnection({ agentId: 'codex' });
        expect(result).toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'Codex CLI',
        });
        expect(result.detail).toContain('requires a newer version');
      },
    );
  });

  it('returns Claude /login guidance when the spawned CLI cannot authenticate', async () => {
    await withFakeClaude(
      `console.error(JSON.stringify({ apiKeySource: 'none', error_status: 401 })); process.exit(1);`,
      async () => {
        const result = await testAgentConnection({ agentId: 'claude' });

        expect(result).toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'Claude Code',
        });
        expect(result.detail).toContain('/login');
        expect(result.detail).toContain('CLAUDE_CONFIG_DIR');
      },
    );
  });

  it('returns Claude /login guidance when auth failure stream JSON is emitted on stdout', async () => {
    await withFakeClaude(
      `console.log(JSON.stringify({ apiKeySource: 'none', error_status: 401 })); process.exit(1);`,
      async () => {
        const result = await testAgentConnection({ agentId: 'claude' });

        expect(result).toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'Claude Code',
        });
        expect(result.detail).toContain('/login');
        expect(result.detail).toContain('CLAUDE_CONFIG_DIR');
      },
    );
  });

  it('returns custom endpoint guidance for Claude model access failures', async () => {
    const previous = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
    try {
      await withFakeClaude(
        `console.error('Error: The selected model is not available in your current plan or region.'); process.exit(1);`,
        async () => {
          const result = await testAgentConnection({ agentId: 'claude' });

          expect(result).toMatchObject({
            ok: false,
            kind: 'agent_spawn_failed',
            agentName: 'Claude Code',
          });
          expect(result.detail).toContain('ANTHROPIC_BASE_URL');
          expect(result.detail).toContain('custom');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = previous;
      }
    }
  });

  it('returns custom endpoint guidance for Claude auth failures with a custom endpoint', async () => {
    const previous = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
    try {
      await withFakeClaude(
        `console.error(JSON.stringify({ apiKeySource: 'none', error_status: 401 })); process.exit(1);`,
        async () => {
          const result = await testAgentConnection({ agentId: 'claude' });

          expect(result).toMatchObject({
            ok: false,
            kind: 'agent_spawn_failed',
            agentName: 'Claude Code',
          });
          expect(result.detail).toContain('ANTHROPIC_BASE_URL');
          expect(result.detail).toContain('proxy credentials');
          expect(result.detail).not.toContain('use `/login`');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = previous;
      }
    }
  });

  it('returns configured profile guidance for silent Claude exits', async () => {
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-alt';
    try {
      await withFakeClaude(
        `process.exit(1);`,
        async () => {
          const result = await testAgentConnection({ agentId: 'claude' });

          expect(result).toMatchObject({
            ok: false,
            kind: 'agent_spawn_failed',
            agentName: 'Claude Code',
          });
          expect(result.detail).toContain('configured Claude profile');
          expect(result.detail).toContain('Effective CLAUDE_CONFIG_DIR: /tmp/claude-alt');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = previous;
      }
    }
  });

  it('classifies structured Codex model errors as not_found_model', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'error', message: "The 'dddd' model is not supported when using Codex with a ChatGPT account." }));`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'agent',
            agentId: 'codex',
            model: 'dddd',
          }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'not_found_model',
          model: 'dddd',
          agentName: 'Codex CLI',
          detail: "The 'dddd' model is not supported when using Codex with a ChatGPT account.",
        });
      },
    );
  });

  it('uses CODEX_BIN overrides when testing agent connections', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-codex-bin-'));
    const oldPath = process.env.PATH;
    try {
      const bin = path.join(dir, 'codex-next');
      await fsp.writeFile(
        bin,
        `#!/usr/bin/env node\nconsole.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));\n`,
      );
      await fsp.chmod(bin, 0o755);
      process.env.PATH = oldPath ?? '';

      const result = await testAgentConnection({
        agentId: 'codex',
        agentCliEnv: {
          codex: {
            CODEX_BIN: bin,
          },
        },
      });

      expect(result).toMatchObject({
        ok: true,
        kind: 'success',
        agentName: 'Codex CLI',
        usedExecutableSource: 'configured',
        configuredExecutablePath: bin,
        usedExecutablePath: bin,
      });
      expect(result.detail).toContain(`This test used the configured Codex path: ${bin}.`);
    } finally {
      process.env.PATH = oldPath;
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('surfaces when an invalid configured CODEX_BIN was ignored in favor of PATH', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));\n`,
      async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-codex-invalid-'));
        try {
          const invalidBin = path.join(dir, 'codex-missing');
          const result = await testAgentConnection({
            agentId: 'codex',
            agentCliEnv: {
              codex: {
                CODEX_BIN: invalidBin,
              },
            },
          });

          expect(result).toMatchObject({
            ok: true,
            kind: 'success',
            agentName: 'Codex CLI',
            sample: 'ok',
            usedExecutableSource: 'fallback_invalid',
            configuredExecutablePath: invalidBin,
            detectedExecutablePath: expect.any(String),
            usedExecutablePath: expect.any(String),
          });
          expect(result.detail).toContain(`Configured Codex path is invalid or not executable: ${invalidBin}.`);
          expect(result.detail).toContain('This test used the PATH Codex CLI at');
        } finally {
          await fsp.rm(dir, { recursive: true, force: true });
        }
      },
    );
  });

  it('falls back to PATH Codex during connection tests when a configured CODEX_BIN fails', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));\n`,
      async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-codex-fallback-'));
        try {
          const bin = path.join(dir, 'codex-bad');
          await fsp.writeFile(
            bin,
            `#!/usr/bin/env node\nconsole.error('macOS blocked this Codex binary');\nprocess.exit(1);\n`,
          );
          await fsp.chmod(bin, 0o755);

          const result = await testAgentConnection({
            agentId: 'codex',
            agentCliEnv: {
              codex: {
                CODEX_BIN: bin,
              },
            },
          });

          expect(result).toMatchObject({
            ok: true,
            kind: 'success',
            agentName: 'Codex CLI',
            sample: 'ok',
            usedExecutableSource: 'fallback_failed',
            configuredExecutablePath: bin,
            detectedExecutablePath: expect.any(String),
            usedExecutablePath: expect.any(String),
          });
          expect(result.detail).toContain(`Configured Codex path failed: ${bin}.`);
          expect(result.detail).toContain('This test succeeded with the PATH Codex CLI at');
          expect(result.detail).toContain('Update CODEX_BIN or clear the custom path');
        } finally {
          await fsp.rm(dir, { recursive: true, force: true });
        }
      },
    );
  });

  it('falls back to PATH Codex when a configured shim spawns ENOENT', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));\n`,
      async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-codex-stale-shim-'));
        try {
          const bin = path.join(dir, 'codex-stale-shim');
          await fsp.writeFile(
            bin,
            '#!/definitely/missing/node\nconsole.log("never runs");\n',
          );
          await fsp.chmod(bin, 0o755);

          const result = await testAgentConnection({
            agentId: 'codex',
            agentCliEnv: {
              codex: {
                CODEX_BIN: bin,
              },
            },
          });

          expect(result).toMatchObject({
            ok: true,
            kind: 'success',
            agentName: 'Codex CLI',
            sample: 'ok',
            usedExecutableSource: 'fallback_failed',
            configuredExecutablePath: bin,
            detectedExecutablePath: expect.any(String),
            usedExecutablePath: expect.any(String),
          });
          expect(result.detail).toContain(`Configured Codex path failed: ${bin}.`);
          expect(result.detail).toContain('This test succeeded with the PATH Codex CLI at');
        } finally {
          await fsp.rm(dir, { recursive: true, force: true });
        }
      },
    );
  });

  it('reports OpenCode structured errors without treating them as raw output', async () => {
    await withFakeOpenCode(
      `
const args = process.argv.slice(2);
if (args[0] === 'models') {
  console.log('openai/gpt-5');
  process.exit(0);
}
console.log(JSON.stringify({ type: 'error', error: { data: { message: 'OpenCode auth failed: login required' } } }));
setTimeout(() => process.exit(0), 50);
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'opencode' }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'OpenCode',
          detail: 'OpenCode auth failed: login required',
        });
      },
    );
  });

  it('reports Cursor Agent status auth failures before running the smoke prompt', async () => {
    await withFakeCursorAgent(
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('No models available for this account.');
  process.exit(0);
}
if (args[0] === 'status') {
  console.error("Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.");
  process.exit(1);
}
console.error('smoke prompt should not run when status reports missing auth');
process.exit(1);
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'cursor-agent' }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'agent_auth_required',
          agentName: 'Cursor Agent',
          detail: expect.stringContaining('cursor-agent login'),
        });
      },
    );
  });

  it('reports Cursor Agent Not logged in status before running the smoke prompt', async () => {
    await withFakeCursorAgent(
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('No models available for this account.');
  process.exit(0);
}
if (args[0] === 'status') {
  console.error('Not logged in');
  process.exit(1);
}
console.error('smoke prompt should not run when status reports missing auth');
process.exit(1);
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'cursor-agent' }),
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
          ok: false,
          kind: 'agent_auth_required',
          agentName: 'Cursor Agent',
          detail: expect.stringContaining('cursor-agent login'),
        });
      },
    );
  });

  it('classifies Cursor Agent runtime auth failures from stderr', async () => {
    await withFakeCursorAgent(
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
if (args[0] === 'status') {
  console.log('Authenticated');
  process.exit(0);
}
console.error("Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.");
process.exit(1);
`,
      async () => {
        const result = await testAgentConnection({ agentId: 'cursor-agent' });
        expect(result).toMatchObject({
          ok: false,
          kind: 'agent_auth_required',
          agentName: 'Cursor Agent',
          detail: expect.stringContaining('cursor-agent status'),
        });
      },
    );
  });

  it('keeps non-auth Cursor Agent runtime failures on the generic spawn path', async () => {
    await withFakeCursorAgent(
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
if (args[0] === 'status') {
  console.log('Authenticated');
  process.exit(0);
}
console.error('workspace path does not exist');
process.exit(1);
`,
      async () => {
        const result = await testAgentConnection({ agentId: 'cursor-agent' });
        expect(result).toMatchObject({
          ok: false,
          kind: 'agent_spawn_failed',
          agentName: 'Cursor Agent',
        });
        expect(result.detail).toContain('workspace path does not exist');
      },
    );
  });

  it('rejects invalid custom model ids before spawning an agent', async () => {
    const markerDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-argv-'));
    const argvFile = path.join(markerDir, 'argv.json');
    try {
      await withFakeCodex(
        `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(args));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
`,
        async () => {
          const res = await realFetch(`${baseUrl}/api/test/connection`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mode: 'agent',
              agentId: 'codex',
              model: '--not-a-model',
              reasoning: 'totally-invalid-effort',
            }),
          });
          expect(res.status).toBe(200);
          await expect(res.json()).resolves.toMatchObject({
            ok: false,
            kind: 'invalid_model_id',
            model: '--not-a-model',
            agentName: 'Codex CLI',
          });

          await expect(fsp.access(argvFile)).rejects.toThrow();
        },
      );
    } finally {
      await fsp.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('drops invalid agent reasoning options before spawning an agent', async () => {
    const markerDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-argv-'));
    const argvFile = path.join(markerDir, 'argv.json');
    try {
      await withFakeCodex(
        `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(args));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
`,
        async () => {
          const res = await realFetch(`${baseUrl}/api/test/connection`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mode: 'agent',
              agentId: 'codex',
              model: 'gpt-5',
              reasoning: 'totally-invalid-effort',
            }),
          });
          expect(res.status).toBe(200);
          await expect(res.json()).resolves.toMatchObject({
            ok: true,
            kind: 'success',
            model: 'gpt-5',
          });

          const args = JSON.parse(await fsp.readFile(argvFile, 'utf8')) as string[];
          expect(args).toEqual(expect.arrayContaining(['--model', 'gpt-5']));
          expect(args.some((arg) => arg.includes('model_reasoning_effort'))).toBe(false);
          expect(args.some((arg) => arg.includes('totally-invalid-effort'))).toBe(false);
        },
      );
    } finally {
      await fsp.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('reports unknown when the agent emits only raw schema-drift output', async () => {
    await withFakeCodex(
      `console.log(JSON.stringify({ type: 'future.event', payload: { text: 'ok' } }));`,
      async () => {
        const result = await testAgentConnection({ agentId: 'codex' });
        expect(result).toMatchObject({
          ok: false,
          kind: 'unknown',
          agentName: 'Codex CLI',
        });
      },
    );
  });

  it('hard-cancels aborted agent probes before cleaning up', async () => {
    const markerDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-marker-'));
    const pidFile = path.join(markerDir, 'pid');
    const termFile = path.join(markerDir, 'term');
    try {
      await withFakeCodex(
        `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.on('SIGTERM', () => {
  fs.writeFileSync(${JSON.stringify(termFile)}, 'term');
});
setInterval(() => {}, 1000);
`,
        async () => {
          const controller = new AbortController();
          const pending = testAgentConnection({
            agentId: 'codex',
            signal: controller.signal,
          });
          await Promise.race([
            waitForFile(pidFile, 15_000),
            pending.then((result) => {
              throw new Error(
                `Agent probe finished before fake agent wrote pid: ${JSON.stringify(result)}`,
              );
            }),
          ]);
          controller.abort();
          await expect(pending).resolves.toMatchObject({
            ok: false,
            kind: 'timeout',
          });
        },
      );
      if (process.platform !== 'win32') {
        await expect(fsp.readFile(termFile, 'utf8')).resolves.toBe('term');
      }
      const pid = Number(await fsp.readFile(pidFile, 'utf8'));
      if (process.platform === 'win32') {
        process.kill(pid, 'SIGKILL');
        await waitForPidToExit(pid);
      } else {
        expect(() => process.kill(pid, 0)).toThrow();
      }
    } finally {
      await fsp.rm(markerDir, { recursive: true, force: true });
    }
  }, 10_000);

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
    vi.useFakeTimers();
    const sink = createAgentSink();
    sink.send('agent', { type: 'thinking_delta', delta: 'thinking first' });
    let settled = false;
    sink.result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);

    sink.send('agent', { type: 'text_delta', delta: 'ok' });
    await vi.advanceTimersByTimeAsync(500);
    await expect(sink.result).resolves.toEqual({ kind: 'text', text: 'ok' });
  });

  it('rejects the agent smoke test from structured stream errors', async () => {
    const sink = createAgentSink();
    sink.send('agent', {
      type: 'error',
      message: "The 'gpt-5.5' model requires a newer version of Codex.",
    });

    await expect(sink.result).resolves.toMatchObject({
      kind: 'streamError',
      error: expect.objectContaining({
        message: "The 'gpt-5.5' model requires a newer version of Codex.",
      }),
    });
  });

  it('debounces agent text chunks before resolving', async () => {
    vi.useFakeTimers();
    const sink = createAgentSink();
    sink.send('agent', { type: 'text_delta', delta: 'Error:' });
    await vi.advanceTimersByTimeAsync(499);
    sink.send('agent', { type: 'text_delta', delta: ' model not found' });
    await vi.advanceTimersByTimeAsync(500);

    await expect(sink.result).resolves.toEqual({
      kind: 'text',
      text: 'Error: model not found',
    });
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

describe('connection test timeout overrides', () => {
  it('returns the fallback when the override is missing or empty', () => {
    expect(
      resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS', 12_000, {}),
    ).toBe(12_000);
    expect(
      resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_AGENT_TIMEOUT_MS', 45_000, {
        OD_CONNECTION_TEST_AGENT_TIMEOUT_MS: '',
      }),
    ).toBe(45_000);
  });

  it('honors a positive integer override', () => {
    expect(
      resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS', 12_000, {
        OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS: '30000',
      }),
    ).toBe(30_000);
    expect(
      resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_AGENT_TIMEOUT_MS', 45_000, {
        OD_CONNECTION_TEST_AGENT_TIMEOUT_MS: '120000',
      }),
    ).toBe(120_000);
  });

  it('warns and falls back on non-numeric, zero, negative, or non-integer overrides', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const bad of ['fast', '0', '-1', '1.5', 'NaN']) {
        expect(
          resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS', 12_000, {
            OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS: bad,
          }),
        ).toBe(12_000);
      }
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  // Regression: a previous version of resolveConnectionTestTimeoutMs
  // accepted any positive integer, but Node's setTimeout silently
  // clamps delays above 2^31-1 to ~1 ms (with a TimeoutOverflowWarning).
  // An override that meant to extend the budget would instead make
  // every connection test fail almost immediately — the safety
  // timeout would be effectively disarmed.
  it('rejects values above the Node setTimeout maximum (2^31-1)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const tooLarge = '3000000000'; // ~50 minutes; exceeds 2_147_483_647 ms
      expect(
        resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_AGENT_TIMEOUT_MS', 45_000, {
          OD_CONNECTION_TEST_AGENT_TIMEOUT_MS: tooLarge,
        }),
      ).toBe(45_000);
      // The exact maximum is still accepted; anything past it is not.
      expect(
        resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_AGENT_TIMEOUT_MS', 45_000, {
          OD_CONNECTION_TEST_AGENT_TIMEOUT_MS: '2147483647',
        }),
      ).toBe(2_147_483_647);
      expect(
        resolveConnectionTestTimeoutMs('OD_CONNECTION_TEST_AGENT_TIMEOUT_MS', 45_000, {
          OD_CONNECTION_TEST_AGENT_TIMEOUT_MS: '2147483648',
        }),
      ).toBe(45_000);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('validateBaseUrlResolved (DNS-aware base URL validation)', () => {
  function lookupReturning(addresses: DnsLookupAddress[]) {
    return vi.fn(async () => addresses);
  }

  it('passes through the contracts-level error for invalid input', async () => {
    expect(await validateBaseUrlResolved('not-a-url', lookupReturning([]))).toMatchObject({
      error: 'Invalid baseUrl',
    });
  });

  it('rejects the literal-IP cases the sync check already catches', async () => {
    for (const baseUrl of [
      'http://10.0.0.5:11434/v1',
      'http://169.254.169.254/latest/meta-data',
      'http://[fd00::1]:11434/v1',
      'http://[fe80::1]:11434/v1',
    ]) {
      expect(await validateBaseUrlResolved(baseUrl, lookupReturning([]))).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });

  it('skips DNS for loopback hostnames so local LLMs (Ollama, *.localhost) still work', async () => {
    const lookup = lookupReturning([{ address: '127.0.0.1', family: 4 }]);
    for (const baseUrl of [
      'http://localhost:11434/v1',
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
    ]) {
      const result = await validateBaseUrlResolved(baseUrl, lookup);
      expect(result.error).toBeUndefined();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('skips DNS for IP-literal hostnames the sync check already vetted', async () => {
    const lookup = lookupReturning([]);
    expect((await validateBaseUrlResolved('https://1.2.3.4/v1', lookup)).error).toBeUndefined();
    expect((await validateBaseUrlResolved('https://[2606:4700::]/v1', lookup)).error).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects public hostnames that resolve to private IPv4 ranges', async () => {
    const cases: Array<{ resolved: string; family: number }> = [
      { resolved: '10.0.0.5', family: 4 },
      { resolved: '172.16.0.5', family: 4 },
      { resolved: '192.168.1.5', family: 4 },
      { resolved: '100.64.0.1', family: 4 },
      { resolved: '169.254.169.254', family: 4 },
      { resolved: '0.0.0.0', family: 4 },
      { resolved: '224.0.0.1', family: 4 },
    ];
    for (const { resolved, family } of cases) {
      const result = await validateBaseUrlResolved(
        'https://internal.example.com/v1',
        lookupReturning([{ address: resolved, family }]),
      );
      expect(result).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });

  it('rejects public hostnames that resolve to private IPv6 ranges', async () => {
    for (const resolved of ['fd00::1', 'fe80::1', '::']) {
      const result = await validateBaseUrlResolved(
        'https://internal.example.com/v1',
        lookupReturning([{ address: resolved, family: 6 }]),
      );
      expect(result).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });

  it('rejects when ANY resolved record (round-robin / dual-stack) is internal', async () => {
    const result = await validateBaseUrlResolved(
      'https://mixed.example.com/v1',
      lookupReturning([
        { address: '52.84.10.1', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]),
    );
    expect(result).toMatchObject({
      error: 'Internal IPs blocked',
      forbidden: true,
    });
  });

  it('allows public hostnames that resolve to public addresses (the api.openai.com case)', async () => {
    const result = await validateBaseUrlResolved(
      'https://api.openai.com/v1',
      lookupReturning([
        { address: '104.18.7.192', family: 4 },
        { address: '2606:4700::6812:7c0', family: 6 },
      ]),
    );
    expect(result.error).toBeUndefined();
    expect(result.parsed?.hostname).toBe('api.openai.com');
  });

  it('allows hostnames that resolve to loopback (e.g. *.localhost / lvh.me)', async () => {
    const result = await validateBaseUrlResolved(
      'http://app.localhost:11434/v1',
      lookupReturning([{ address: '127.0.0.1', family: 4 }]),
    );
    expect(result.error).toBeUndefined();
  });

  it('falls back to allow-through on DNS resolver errors so transient failures are not 403s', async () => {
    const failingLookup = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    const result = await validateBaseUrlResolved('https://offline.example.com/v1', failingLookup);
    expect(result.error).toBeUndefined();
    expect(failingLookup).toHaveBeenCalledOnce();
  });
});
