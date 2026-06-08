/**
 * Mock-server tests for `apps/daemon/src/runtimes/invoke-http.ts`.
 *
 * Spins up a Node `http.Server` on a free port and points the
 * `anthropic` runtime at it via `ANTHROPIC_BASE_URL`. The test
 * exercises:
 *   - happy path: SSE frames parsed into `onEvent` callbacks
 *   - 401: error path through `onError` + `onDone` with status 0
 *   - 200 with empty body: "stream ended before any SSE event arrived"
 *   - missing env: `onError` fires once with the missing-env message
 *   - shouldAbort: caller can short-circuit the in-flight request
 *
 * The fake server uses `127.0.0.1` so `validateBaseUrlResolved`
 * short-circuits on its loopback guard without touching DNS.
 */

import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anthropicAgentDef } from '../../src/runtimes/defs/anthropic.js';
import { invokeHttpAgent, type HttpInvocationLifecycle } from '../../src/runtimes/invoke-http.js';

type Event = Record<string, unknown>;

interface StartedFakeServer {
  url: string;
  setHandler: (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) => void;
  close: () => Promise<void>;
}

async function startFakeServer(): Promise<StartedFakeServer> {
  // Track the latest handler so individual tests can swap it. The
  // server keeps listening across swaps — that way each test gets
  // its own response shape without restarting the listener.
  let currentHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null;
  const server = http.createServer((req, res) => {
    if (currentHandler) currentHandler(req, res);
    else {
      res.statusCode = 500;
      res.end('no handler installed');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    setHandler: (handler) => {
      currentHandler = handler;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function sseFrame(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function recordLifecycle(): {
  events: Event[];
  lifecycle: HttpInvocationLifecycle;
  errors: Error[];
  dones: Array<{ stopReason: string | null; httpStatus: number; usage: unknown }>;
  started: number;
  activities: number;
} {
  const events: Event[] = [];
  const errors: Error[] = [];
  const dones: Array<{ stopReason: string | null; httpStatus: number; usage: unknown }> = [];
  let started = 0;
  let activities = 0;
  return {
    events,
    errors,
    dones,
    get started() {
      return started;
    },
    get activities() {
      return activities;
    },
    lifecycle: {
      onStart: () => {
        started++;
      },
      onActivity: () => {
        activities++;
      },
      onEvent: (ev) => {
        events.push(ev);
      },
      onError: (err) => {
        errors.push(err);
      },
      onDone: (info) => {
        dones.push(info);
      },
      shouldAbort: () => false,
    },
  };
}

describe('invokeHttpAgent', () => {
  let server: StartedFakeServer;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    server = await startFakeServer();
    savedEnv = {
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    };
    process.env.ANTHROPIC_BASE_URL = server.url;
    process.env.ANTHROPIC_AUTH_TOKEN = 'test-token';
    process.env.ANTHROPIC_MODEL = 'claude-test-1';
  });

  afterEach(async () => {
    await server.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('streams SSE frames through onEvent and reports success in onDone', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame('message_start', { message: { id: 'msg_1', usage: { input_tokens: 9 } } }));
      res.write(
        sseFrame('content_block_start', {
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
      );
      res.write(
        sseFrame('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        }),
      );
      res.write(sseFrame('content_block_stop', { index: 0 }));
      res.write(
        sseFrame('message_delta', {
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 3 },
        }),
      );
      res.write(sseFrame('message_stop', {}));
      res.end();
    });

    const rec = recordLifecycle();
    const result = await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-1',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.error).toBeNull();
    expect(result.httpStatus).toBe(200);
    expect(rec.errors).toHaveLength(0);
    expect(rec.dones).toHaveLength(1);
    const done0 = rec.dones[0]!;
    expect(done0.httpStatus).toBe(200);
    expect(done0.usage).toEqual({ input_tokens: 9, output_tokens: 3 });
    expect(done0.stopReason).toBe('end_turn');

    // Sanity-check the parsed event sequence: status:streaming
    // (message_start), text_delta, status:done (message_stop).
    const types = rec.events.map((e) => e.type);
    expect(types).toContain('status');
    expect(types).toContain('text_delta');
    const text = rec.events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { delta: string }).delta)
      .join('');
    expect(text).toBe('hello');

    expect(rec.started).toBe(1);
    expect(rec.activities).toBeGreaterThan(0);
  });

  it('surfaces a 401 as onError + onDone (status 401), no parsed events', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
    });

    const rec = recordLifecycle();
    const result = await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-2',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.httpStatus).toBe(401);
    expect(result.error).not.toBeNull();
    expect(rec.errors).toHaveLength(1);
    expect(rec.errors[0]!.message).toMatch(/HTTP 401/);
    expect(rec.dones).toHaveLength(1);
    expect(rec.dones[0]!.httpStatus).toBe(401);
    // Body parses nothing — only the error event would be visible if
    // a separate `error` SSE frame had been sent, which a 401 JSON
    // response does not include.
    expect(rec.events.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('surfaces "stream ended before any SSE event arrived" when body is empty', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end();
    });

    const rec = recordLifecycle();
    const result = await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-3',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/stream ended before any SSE event/);
    expect(rec.errors).toHaveLength(1);
    expect(rec.dones).toHaveLength(1);
    expect(rec.dones[0]!.httpStatus).toBe(200);
  });

  it('fails fast with a clear error when env is missing ANTHROPIC_BASE_URL', async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = 'still-set';

    const rec = recordLifecycle();
    const result = await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-4',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.httpStatus).toBe(0);
    expect(result.error?.message).toMatch(/ANTHROPIC_BASE_URL/);
    expect(rec.errors).toHaveLength(1);
    expect(rec.dones).toHaveLength(1);
    // No fetch was attempted — onStart must not have fired.
    expect(rec.started).toBe(0);
  });

  it('aborts the in-flight request when shouldAbort flips to true mid-stream', async () => {
    // Server writes a frame every 50ms for 10 frames; the lifecycle's
    // shouldAbort returns true after the 2nd frame, so the data handler
    // trips the AbortController and destroys the readable before the
    // remaining frames arrive.
    const rec = recordLifecycle();
    let abortCount = 0;
    rec.lifecycle.shouldAbort = () => {
      abortCount++;
      return abortCount > 2;
    };

    server.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      let i = 0;
      const interval = setInterval(() => {
        i++;
        if (i > 10) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(
          sseFrame('content_block_delta', {
            index: 0,
            delta: { type: 'text_delta', text: `chunk${i}` },
          }),
        );
      }, 50);
    });

    const result = await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-5',
      env: process.env,
      lifecycle: rec.lifecycle,
      // Short first-byte timeout isn't needed here — the server is
      // local and writes the first frame within 50ms.
    });

    // The abort should prevent the full 10 chunks from being parsed.
    // We accept anywhere from 1 chunk (chunks 1 parsed, chunk 2 trips
    // the data-handler shouldAbort check before streamHandler.feed) up
    // to 9 (chunks 1-N parsed before destroy takes effect) — the
    // exact count depends on whether shouldAbort is first hit in the
    // data handler (pre-feed) or in the streamHandler callback
    // (post-feed). Both are guarded by the same predicate.
    const textChunks = rec.events.filter((e) => e.type === 'text_delta');
    expect(textChunks.length).toBeGreaterThanOrEqual(1);
    expect(textChunks.length).toBeLessThan(10);

    // The lifecycle must have finished — onDone fires exactly once.
    expect(rec.dones).toHaveLength(1);
    // The AbortController may surface the abort reason through
    // `result.error` (when the readable's error event fires before
    // close) or it may be null (when only `close` fires after a
    // graceful destroy). Either way, onDone ran.
    if (result.error) {
      expect(result.error.message).toMatch(/aborted/i);
    }
  });

  it('uses x-api-key header from ANTHROPIC_AUTH_TOKEN on the wire', async () => {
    // Spy on the inbound request headers — the runtime must NOT
    // send a Bearer token (Anthropic uses x-api-key, not Authorization).
    let observedHeaders: http.IncomingHttpHeaders | null = null;
    server.setHandler((req, res) => {
      observedHeaders = req.headers;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame('message_start', { message: { id: 'm' } }));
      res.write(sseFrame('message_stop', {}));
      res.end();
    });

    const rec = recordLifecycle();
    await invokeHttpAgent({
      def: anthropicAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-test-6',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(observedHeaders).not.toBeNull();
    const h = observedHeaders as unknown as http.IncomingHttpHeaders;
    expect(h['x-api-key']).toBe('test-token');
    expect(h['authorization']).toBeUndefined();
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['content-type']).toBe('application/json');
    expect(h.accept).toBe('text/event-stream');
  });
});
