// Coverage for the /api/test/connection route. Hits status mapping for each
// provider protocol and uses fake CLI bins for deterministic agent outcomes.

import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createAgentSink,
  isSmokeOkReply,
  redactSecrets,
  testAgentConnection,
  testProviderConnection,
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

async function withFakeOpenCode<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('opencode', script, run);
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
      });
    } finally {
      process.env.PATH = oldPath;
      await fsp.rm(dir, { recursive: true, force: true });
    }
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
