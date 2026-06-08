/**
 * Mock-server tests for the OpenAI-compatible HTTP runtime path
 * (`apps/daemon/src/runtimes/invoke-http.ts` →
 * `invokeOpenaiAgent`).
 *
 * Mirrors `tests/runtimes/invoke-http.test.ts` in shape: spins up a
 * Node `http.Server` on a free port and points the runtime at it
 * via `OPENAI_BASE_URL`. Exercises the same lifecycle as the
 * Anthropic adapter (happy path, 401, empty body, missing env,
 * shouldAbort, header verification) so the two stay symmetric.
 */

import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openaiCompatibleAgentDef } from '../../src/runtimes/defs/openai-compatible.js';
import { invokeOpenaiAgent, type HttpInvocationLifecycle } from '../../src/runtimes/invoke-http.js';

type Event = Record<string, unknown>;

interface StartedFakeServer {
  url: string;
  setHandler: (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) => void;
  close: () => Promise<void>;
}

async function startFakeServer(): Promise<StartedFakeServer> {
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

function dataFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
function doneFrame(): string {
  return 'data: [DONE]\n\n';
}

function recordLifecycle(): {
  events: Event[];
  lifecycle: HttpInvocationLifecycle;
  errors: Error[];
  dones: Array<{ stopReason: string | null; httpStatus: number; usage: unknown }>;
  started: number;
} {
  const events: Event[] = [];
  const errors: Error[] = [];
  const dones: Array<{ stopReason: string | null; httpStatus: number; usage: unknown }> = [];
  let started = 0;
  return {
    events,
    errors,
    dones,
    get started() {
      return started;
    },
    lifecycle: {
      onStart: () => {
        started++;
      },
      onActivity: () => {},
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

describe('invokeOpenaiAgent', () => {
  let server: StartedFakeServer;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    server = await startFakeServer();
    savedEnv = {
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    };
    process.env.OPENAI_BASE_URL = server.url;
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.OPENAI_MODEL = 'deepseek-chat';
  });

  afterEach(async () => {
    await server.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('streams text_delta events through onEvent and finishes on [DONE]', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(
        dataFrame({
          choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
        }),
      );
      res.write(
        dataFrame({
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }),
      );
      res.write(
        dataFrame({
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        }),
      );
      res.write(
        dataFrame({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }),
      );
      res.write(
        dataFrame({
          choices: [],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      );
      res.write(doneFrame());
      res.end();
    });

    const rec = recordLifecycle();
    const result = await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-1',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.error).toBeNull();
    expect(result.httpStatus).toBe(200);
    expect(rec.errors).toHaveLength(0);
    expect(rec.dones).toHaveLength(1);
    const done0 = rec.dones[0]!;
    expect(done0.httpStatus).toBe(200);
    expect(done0.usage).toEqual({ input_tokens: 5, output_tokens: 2 });
    expect(done0.stopReason).toBe('stop');

    const text = rec.events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { delta: string }).delta)
      .join('');
    expect(text).toBe('Hello world');
    expect(rec.started).toBe(1);
  });

  it('surfaces a 401 as onError + onDone (status 401), no parsed events', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid api key', type: 'auth_error' } }));
    });

    const rec = recordLifecycle();
    const result = await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-2',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.httpStatus).toBe(401);
    expect(result.error).not.toBeNull();
    expect(rec.errors).toHaveLength(1);
    expect(rec.errors[0]!.message).toMatch(/HTTP 401/);
    expect(rec.dones).toHaveLength(1);
    expect(rec.dones[0]!.httpStatus).toBe(401);
  });

  it('surfaces "stream ended before any SSE event arrived" when body is empty', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end();
    });

    const rec = recordLifecycle();
    const result = await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-3',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/stream ended before any SSE event/);
    expect(rec.errors).toHaveLength(1);
    expect(rec.dones).toHaveLength(1);
    expect(rec.dones[0]!.httpStatus).toBe(200);
  });

  it('fails fast with a clear error when env is missing OPENAI_BASE_URL', async () => {
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;

    const rec = recordLifecycle();
    const result = await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-4',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.httpStatus).toBe(0);
    expect(result.error?.message).toMatch(/OPENAI_BASE_URL/);
    expect(rec.errors).toHaveLength(1);
    expect(rec.dones).toHaveLength(1);
    expect(rec.started).toBe(0);
  });

  it('accepts DEEPSEEK_API_KEY as a fallback alias for OPENAI_API_KEY', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-alias';

    let observedHeaders: http.IncomingHttpHeaders | null = null;
    server.setHandler((req, res) => {
      observedHeaders = req.headers;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(dataFrame({
        choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
      }));
      res.write(doneFrame());
      res.end();
    });

    const rec = recordLifecycle();
    const result = await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-5',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    expect(result.error).toBeNull();
    const h = observedHeaders as unknown as http.IncomingHttpHeaders;
    expect(h.authorization).toBe('Bearer sk-deepseek-alias');
  });

  it('uses Bearer Authorization header (not x-api-key) and POSTs to /v1/chat/completions', async () => {
    let observedHeaders: http.IncomingHttpHeaders | null = null;
    let observedUrl = '';
    let observedBody = '';
    server.setHandler((req, res) => {
      observedHeaders = req.headers;
      observedUrl = req.url ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        observedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(dataFrame({
          choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
        }));
        res.write(doneFrame());
        res.end();
      });
    });

    const rec = recordLifecycle();
    await invokeOpenaiAgent({
      def: openaiCompatibleAgentDef,
      prompt: 'ping',
      model: null,
      runId: 'run-openai-6',
      env: process.env,
      lifecycle: rec.lifecycle,
    });

    const h = observedHeaders as unknown as http.IncomingHttpHeaders;
    expect(h.authorization).toBe('Bearer sk-test-openai');
    expect(h['x-api-key']).toBeUndefined();
    expect(h['content-type']).toBe('application/json');
    expect(h.accept).toBe('text/event-stream');

    expect(observedUrl).toBe('/v1/chat/completions');

    const body = JSON.parse(observedBody) as { model: string; stream: boolean; messages: Array<{ role: string; content: string }> };
    expect(body.model).toBe('deepseek-chat');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });
});
