import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the one-shot listener so tests don't actually bind 127.0.0.1:56121
// and don't race each other. The real listener is covered by
// xai-oauth-server.test.ts. Tests below only need to assert routes
// behaviour: starting the dance, exposing status, wiping tokens.
const { onCallbackHolder, stopMock, startMock } = vi.hoisted(() => {
  const holder: {
    current: ((outcome: any) => Promise<void> | void) | null;
  } = { current: null };
  const stop = vi.fn(async () => {});
  const start = vi.fn(async (input: any) => {
    holder.current = input.onCallback;
    return {
      address: { host: '127.0.0.1', port: 56121 },
      stop,
    };
  });
  return { onCallbackHolder: holder, stopMock: stop, startMock: start };
});

const {
  proxyDispatcherCloseMock,
  proxyDispatcherFactoryMock,
  proxyDispatcherToken,
} = vi.hoisted(() => {
  const dispatcher = { tag: 'xai-test-dispatcher' };
  const close = vi.fn(async () => {});
  const factory = vi.fn(() => ({
    close,
    requestInit: { dispatcher },
  }));
  return {
    proxyDispatcherCloseMock: close,
    proxyDispatcherFactoryMock: factory,
    proxyDispatcherToken: dispatcher,
  };
});

vi.mock('../src/xai-oauth-server.js', () => ({
  XAI_CALLBACK_HOST: '127.0.0.1',
  XAI_CALLBACK_PORT: 56121,
  XAI_CALLBACK_PATH: '/callback',
  startCallbackListener: startMock,
}));

vi.mock('../src/connectionTest.js', () => ({
  proxyDispatcherRequestInit: proxyDispatcherFactoryMock,
}));

import {
  extractAnswerText,
  extractUrlCitations,
  registerXaiRoutes,
} from '../src/routes/xai.js';
import {
  XAI_OAUTH_AUTHORIZATION_ENDPOINT,
  XAI_OAUTH_TOKEN_ENDPOINT,
} from '../src/xai-oauth.js';

interface TestApp {
  baseUrl: string;
  close(): Promise<void>;
}

/** Cast `await jsonOf(r)` from `unknown` to a usable shape. The daemon's
 * tsconfig.tests.json runs with `strict + exactOptionalPropertyTypes`,
 * so direct field access on `unknown` is rejected. The endpoints under
 * test return ad-hoc JSON shapes, so a permissive `any` keeps the
 * call sites readable instead of repeating cast boilerplate. */
async function jsonOf<T = any>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

async function startTestApp(projectRoot: string): Promise<TestApp> {
  const app = express();
  app.use(express.json());

  const resolvedPortRef = { current: 0 };
  const httpDeps = {
    createSseResponse: () => undefined,
    isLocalSameOrigin: () => true,
    requireLocalDaemonRequest: () => true,
    resolvedPortRef,
    sendApiError: () => undefined,
    sendLiveArtifactRouteError: () => undefined,
    sendMulterError: () => undefined,
  };
  const pathDeps = {
    ARTIFACTS_DIR: '',
    BUNDLED_PETS_DIR: '',
    DESIGN_SYSTEMS_DIR: '',
    DESIGN_TEMPLATES_DIR: '',
    OD_BIN: '',
    PROJECT_ROOT: projectRoot,
    PROJECTS_DIR: '',
    PROMPT_TEMPLATES_DIR: '',
    RUNTIME_DATA_DIR: '',
    RUNTIME_DATA_DIR_CANONICAL: '',
    SKILLS_DIR: '',
    USER_DESIGN_SYSTEMS_DIR: '',
    USER_DESIGN_TEMPLATES_DIR: '',
    USER_SKILLS_DIR: '',
  };

  registerXaiRoutes(app, {
    http: httpDeps as any,
    paths: pathDeps as any,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  resolvedPortRef.current = addr.port;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('xai-routes', () => {
  let projectRoot: string;
  let app: TestApp;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-xai-routes-'));
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    onCallbackHolder.current = null;
    startMock.mockClear();
    stopMock.mockClear();
    proxyDispatcherCloseMock.mockClear();
    proxyDispatcherFactoryMock.mockClear();
    app = await startTestApp(projectRoot);
  });

  afterEach(async () => {
    await app.close();
    globalThis.fetch = realFetch;
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalDataDir == null) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('POST /api/xai/oauth/start mints an authorize URL and opens a callback listener', async () => {
    const r = await fetch(`${app.baseUrl}/api/xai/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(200);
    const body = await jsonOf(r);
    expect(body.authorizeUrl).toContain(XAI_OAUTH_AUTHORIZATION_ENDPOINT);
    expect(body.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.callback).toEqual({ host: '127.0.0.1', port: 56121 });
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0]![0].expectedState).toBe(body.state);
  });

  it('starting twice replaces the in-flight listener', async () => {
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    // Second call must have stopped the first listener before opening a new one.
    expect(stopMock).toHaveBeenCalled();
    expect(startMock).toHaveBeenCalledTimes(2);
  });

  it('GET /api/xai/auth/status returns connected:false when no token is stored', async () => {
    const r = await fetch(`${app.baseUrl}/api/xai/auth/status`);
    expect(r.status).toBe(200);
    const body = await jsonOf(r);
    expect(body).toEqual({ connected: false, listening: false });
  });

  it('GET /api/xai/auth/status reflects an in-flight listener', async () => {
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    const r = await fetch(`${app.baseUrl}/api/xai/auth/status`);
    const body = await jsonOf(r);
    expect(body.connected).toBe(false);
    expect(body.listening).toBe(true);
  });

  it('callback success path stores a token and clears the listener', async () => {
    // Start the OAuth flow.
    const startResp = await fetch(`${app.baseUrl}/api/xai/oauth/start`, {
      method: 'POST',
    });
    const { state } = await jsonOf(startResp);

    // Stub the xAI token endpoint that completeXAIAuth will hit.
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === XAI_OAUTH_TOKEN_ENDPOINT) {
        expect(init?.dispatcher).toBe(proxyDispatcherToken);
        return new Response(
          JSON.stringify({
            access_token: 'fresh-bearer',
            refresh_token: 'rt-1',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // Pass-through anything else (status check uses fetch too via real fetch).
      return realFetch(input, init);
    }) as typeof fetch;

    // Fire the mocked callback as if the browser had returned.
    expect(onCallbackHolder.current).toBeTruthy();
    await onCallbackHolder.current!({ kind: 'ok', code: 'auth-code', state });

    // Status should now report connected.
    const statusResp = await fetch(`${app.baseUrl}/api/xai/auth/status`);
    const status = await jsonOf(statusResp);
    expect(status.connected).toBe(true);
    expect(status.scope).toBe('openid profile');
    expect(status.listening).toBe(false); // listener cleared after handleCallback
    expect(typeof status.expiresAt).toBe('number');
    expect(proxyDispatcherFactoryMock).toHaveBeenCalledTimes(1);
    expect(proxyDispatcherCloseMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/xai/oauth/complete (paste-back) exchanges code and stores token', async () => {
    const startResp = await fetch(`${app.baseUrl}/api/xai/oauth/start`, {
      method: 'POST',
    });
    const { state } = await jsonOf(startResp);

    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === XAI_OAUTH_TOKEN_ENDPOINT) {
        expect(init?.dispatcher).toBe(proxyDispatcherToken);
        return new Response(
          JSON.stringify({
            access_token: 'pasted-bearer',
            refresh_token: 'rt-paste',
            token_type: 'Bearer',
            expires_in: 7200,
            scope: 'openid profile',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const completeResp = await fetch(
      `${app.baseUrl}/api/xai/oauth/complete`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, code: 'pasted-code-123' }),
      },
    );
    expect(completeResp.status).toBe(200);
    expect((await jsonOf(completeResp)).ok).toBe(true);

    const status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then(
      (r) => jsonOf(r),
    );
    expect(status.connected).toBe(true);
    expect(status.scope).toBe('openid profile');
    expect(status.listening).toBe(false);
    // Paste-back must stop the loopback listener so it doesn't dangle.
    expect(stopMock).toHaveBeenCalled();
    expect(proxyDispatcherFactoryMock).toHaveBeenCalledTimes(1);
    expect(proxyDispatcherCloseMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/xai/oauth/complete rejects empty state or code', async () => {
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    const r1 = await fetch(`${app.baseUrl}/api/xai/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: '', code: 'c' }),
    });
    expect(r1.status).toBe(400);

    const r2 = await fetch(`${app.baseUrl}/api/xai/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 's', code: '   ' }),
    });
    expect(r2.status).toBe(400);
  });

  it('POST /api/xai/oauth/complete surfaces an unknown state as 400', async () => {
    const r = await fetch(`${app.baseUrl}/api/xai/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'never-issued', code: 'c' }),
    });
    expect(r.status).toBe(400);
    const body = await jsonOf(r);
    expect(body.error).toMatch(/state not found/i);
  });

  it('callback error path does not store a token', async () => {
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    expect(onCallbackHolder.current).toBeTruthy();
    await onCallbackHolder.current!({
      kind: 'error',
      error: 'access_denied',
    });
    const status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then(
      (r) => jsonOf(r),
    );
    expect(status.connected).toBe(false);
  });

  it('POST /api/xai/search rejects missing/blank query with 400', async () => {
    const r1 = await fetch(`${app.baseUrl}/api/xai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r1.status).toBe(400);

    const r2 = await fetch(`${app.baseUrl}/api/xai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    expect(r2.status).toBe(400);
  });

  it('POST /api/xai/search returns 401 when no credentials are available', async () => {
    const r = await fetch(`${app.baseUrl}/api/xai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'who launched grok 4.3' }),
    });
    expect(r.status).toBe(401);
    const body = await jsonOf(r);
    expect(body.error).toMatch(/no xAI credentials/i);
  });

  it('POST /api/xai/search forwards bearer + x_search options to xAI Responses API and parses the response', async () => {
    // Pre-stage a stored xAI key the way Settings → Grok would.
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { default: pathMod } = await import('node:path');
    const cfgPath = pathMod.join(projectRoot, '.od', 'media-config.json');
    await mkdir(pathMod.dirname(cfgPath), { recursive: true });
    await writeFile(
      cfgPath,
      JSON.stringify({
        providers: {
          grok: { apiKey: 'stored-test-bearer', baseUrl: 'https://xai.example.test/v1' },
        },
      }),
      'utf8',
    );

    let xaiHit = 0;
    let bodyConsumed = false;
    proxyDispatcherCloseMock.mockImplementationOnce(async () => {
      expect(bodyConsumed).toBe(true);
    });
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('xai.example.test')) {
        xaiHit += 1;
        expect(url).toBe('https://xai.example.test/v1/responses');
        expect(init?.dispatcher).toBe(proxyDispatcherToken);
        const headers = init?.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer stored-test-bearer');
        expect(headers['content-type']).toBe('application/json');
        const reqBody = JSON.parse(String(init?.body));
        expect(reqBody.model).toBe('grok-4.20-reasoning');
        expect(reqBody.input).toEqual([
          { role: 'user', content: 'latest hermes-agent release notes' },
        ]);
        expect(reqBody.tools[0]).toEqual({
          type: 'x_search',
          allowed_x_handles: ['NousResearch', 'xai'],
          from_date: '2026-05-01',
        });
        return {
          ok: true,
          status: 200,
          text: vi.fn(async () => {
            bodyConsumed = true;
            return JSON.stringify({
              output: [
                {
                  content: [
                    {
                      text: 'Hermes 0.11 shipped xAI integration on 5/15.',
                      annotations: [
                        {
                          type: 'url_citation',
                          url: 'https://x.com/NousResearch/status/123',
                          start_index: 0,
                          end_index: 7,
                        },
                        {
                          type: 'url_citation',
                          url: 'https://x.com/xai/status/456',
                          start_index: 8,
                          end_index: 15,
                        },
                      ],
                    },
                  ],
                },
              ],
            });
          }),
        } as unknown as Response;
      }
      // Pass through anything that isn't an xAI call (the test's own
      // request to the local express server).
      return realFetch(input, init);
    }) as typeof fetch;

    const r = await fetch(`${app.baseUrl}/api/xai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'latest hermes-agent release notes',
        allowed_x_handles: ['NousResearch', 'xai'],
        from_date: '2026-05-01',
      }),
    });
    expect(r.status).toBe(200);
    const body = await jsonOf(r);
    expect(body.answer).toContain('xAI integration');
    expect(body.citations).toEqual([
      'https://x.com/NousResearch/status/123',
      'https://x.com/xai/status/456',
    ]);
    expect(body.model).toBe('grok-4.20-reasoning');
    expect(xaiHit).toBe(1);
    expect(proxyDispatcherFactoryMock).toHaveBeenCalledTimes(1);
    expect(proxyDispatcherCloseMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/xai/search surfaces upstream errors as 502', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { default: pathMod } = await import('node:path');
    const cfgPath = pathMod.join(projectRoot, '.od', 'media-config.json');
    await mkdir(pathMod.dirname(cfgPath), { recursive: true });
    await writeFile(
      cfgPath,
      JSON.stringify({ providers: { grok: { apiKey: 'k' } } }),
      'utf8',
    );
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('api.x.ai')) {
        return new Response('{"error":{"message":"rate limited"}}', {
          status: 429,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const r = await fetch(`${app.baseUrl}/api/xai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'q' }),
    });
    expect(r.status).toBe(502);
    expect((await jsonOf(r)).error).toMatch(/xAI 429/);
  });

  it('POST /api/xai/oauth/cancel stops the listener without touching the stored token', async () => {
    const startResp = await fetch(`${app.baseUrl}/api/xai/oauth/start`, {
      method: 'POST',
    });
    const { state } = await jsonOf(startResp);

    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === XAI_OAUTH_TOKEN_ENDPOINT) {
        return new Response(
          JSON.stringify({
            access_token: 'persisted-bearer',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    }) as typeof fetch;

    // Stage a real connected state via the paste-back path so we have a
    // token on disk, then start a *second* OAuth flow (which opens a
    // new listener) and Cancel it.
    await onCallbackHolder.current!({ kind: 'ok', code: 'c', state });
    let status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then((r) =>
      jsonOf(r),
    );
    expect(status.connected).toBe(true);

    // Open another OAuth flow — that opens a new listener.
    await fetch(`${app.baseUrl}/api/xai/oauth/start`, { method: 'POST' });
    stopMock.mockClear();

    const cancelResp = await fetch(`${app.baseUrl}/api/xai/oauth/cancel`, {
      method: 'POST',
    });
    expect(cancelResp.status).toBe(200);
    expect((await jsonOf(cancelResp)).ok).toBe(true);
    expect(stopMock).toHaveBeenCalled();

    // Token survives — Cancel is non-destructive.
    status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then((r) =>
      jsonOf(r),
    );
    expect(status.connected).toBe(true);
    expect(status.listening).toBe(false);
  });

  it('POST /api/xai/oauth/cancel is a no-op when no listener is in flight', async () => {
    const r = await fetch(`${app.baseUrl}/api/xai/oauth/cancel`, {
      method: 'POST',
    });
    expect(r.status).toBe(200);
    expect((await jsonOf(r)).ok).toBe(true);
  });

  it('POST /api/xai/oauth/disconnect wipes a stored token', async () => {
    const startResp = await fetch(`${app.baseUrl}/api/xai/oauth/start`, {
      method: 'POST',
    });
    const { state } = await jsonOf(startResp);

    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === XAI_OAUTH_TOKEN_ENDPOINT) {
        return new Response(
          JSON.stringify({
            access_token: 'fresh-bearer',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    }) as typeof fetch;

    await onCallbackHolder.current!({ kind: 'ok', code: 'c', state });
    let status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then((r) =>
      jsonOf(r),
    );
    expect(status.connected).toBe(true);

    const r = await fetch(`${app.baseUrl}/api/xai/oauth/disconnect`, {
      method: 'POST',
    });
    expect(r.status).toBe(200);
    expect((await jsonOf(r)).ok).toBe(true);

    status = await fetch(`${app.baseUrl}/api/xai/auth/status`).then((r) =>
      jsonOf(r),
    );
    expect(status.connected).toBe(false);
  });
});

describe('xAI Responses API parsers', () => {
  it('extractAnswerText prefers output_text when present', () => {
    expect(
      extractAnswerText({ output_text: 'inline answer', output: [] }),
    ).toBe('inline answer');
  });

  it('extractAnswerText falls back to walking output[].content[].text', () => {
    expect(
      extractAnswerText({
        output: [
          { content: [{ text: 'first line' }, { text: 'second line' }] },
          { content: [{ text: 'third line' }] },
        ],
      }),
    ).toBe('first line\nsecond line\nthird line');
  });

  it('extractAnswerText returns empty string for malformed payloads', () => {
    expect(extractAnswerText(null)).toBe('');
    expect(extractAnswerText('not an object')).toBe('');
    expect(extractAnswerText({ output: 'not an array' })).toBe('');
  });

  it('extractUrlCitations dedupes url_citation annotations', () => {
    expect(
      extractUrlCitations({
        output: [
          {
            content: [
              {
                annotations: [
                  { type: 'url_citation', url: 'https://x.com/a' },
                  { type: 'url_citation', url: 'https://x.com/b' },
                  { type: 'url_citation', url: 'https://x.com/a' }, // dup
                ],
              },
              {
                annotations: [
                  { type: 'something_else', url: 'https://x.com/c' },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual(['https://x.com/a', 'https://x.com/b']);
  });

  it('extractUrlCitations returns [] for missing annotations', () => {
    expect(extractUrlCitations({ output: [] })).toEqual([]);
    expect(extractUrlCitations(null)).toEqual([]);
  });
});

describe('xai-routes — cross-origin guard', () => {
  let projectRoot: string;
  let app: TestApp;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-xai-routes-co-'));
    onCallbackHolder.current = null;
    startMock.mockClear();
    stopMock.mockClear();

    const expressApp = express();
    expressApp.use(express.json());

    const resolvedPortRef = { current: 0 };
    const httpDeps = {
      createSseResponse: () => undefined,
      isLocalSameOrigin: () => false, // simulate cross-origin
      requireLocalDaemonRequest: () => false,
      resolvedPortRef,
      sendApiError: () => undefined,
      sendLiveArtifactRouteError: () => undefined,
      sendMulterError: () => undefined,
    };
    const pathDeps = { PROJECT_ROOT: projectRoot } as any;

    registerXaiRoutes(expressApp, {
      http: httpDeps as any,
      paths: pathDeps,
    });

    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const addr = server.address() as AddressInfo;
    resolvedPortRef.current = addr.port;
    app = {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    };
  });

  afterEach(async () => {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('rejects all six endpoints when isLocalSameOrigin is false', async () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['POST', '/api/xai/oauth/start'],
      ['POST', '/api/xai/oauth/complete'],
      ['POST', '/api/xai/oauth/cancel'],
      ['GET', '/api/xai/auth/status'],
      ['POST', '/api/xai/oauth/disconnect'],
      ['POST', '/api/xai/search'],
    ];
    for (const [method, path] of cases) {
      const r = await fetch(`${app.baseUrl}${path}`, { method });
      expect(r.status).toBe(403);
      expect((await jsonOf(r)).error).toMatch(/cross-origin/);
    }
    expect(startMock).not.toHaveBeenCalled();
  });
});
