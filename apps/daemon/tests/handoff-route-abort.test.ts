/**
 * Coverage for the request-lifecycle abort wiring on
 * `POST /api/projects/:id/handoff`. Mirrors the rationale from
 * `finalize-route-abort.test.ts`: without `res.on('close')` flipping
 * an AbortController that is then threaded into the synthesis call,
 * a UI-side cancel would only abort the browser fetch — the daemon's
 * Anthropic call would keep running and consume tokens after the
 * client has walked away.
 */
import * as http from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/projects/:id/handoff — request-lifecycle abort', () => {
  let server: http.Server;
  let baseUrl: string;
  let conversationId: string;
  const PROJECT_ID = 'handoff-abort-fixture';

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');

    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Handoff abort fixture' }),
    });
    const projectDir = path.join(dataDir, 'projects', PROJECT_ID);
    await mkdir(projectDir, { recursive: true });

    const convResp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Initial' }),
    });
    const convBody = (await convResp.json()) as { conversation: { id: string } };
    conversationId = convBody.conversation.id;
    await fetch(
      `${baseUrl}/api/projects/${PROJECT_ID}/conversations/${convBody.conversation.id}/messages/seed-msg`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content: 'hello',
        }),
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('aborts the daemon-side controller when the client closes the connection', async () => {
    const capture: { signal: AbortSignal | null } = { signal: null };
    let abortReceived: ((value: void) => void) | null = null;
    const abortObserved = new Promise<void>((resolve) => {
      abortReceived = resolve;
    });

    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('api.anthropic.com')) {
        capture.signal = (init as RequestInit | undefined)?.signal ?? null;
        if (capture.signal) {
          capture.signal.addEventListener('abort', () => abortReceived?.());
        }
        return new Promise((_resolve, reject) => {
          if (capture.signal?.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          capture.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return realFetch(input, init);
    });

    const url = new URL(`${baseUrl}/api/projects/${PROJECT_ID}/handoff`);
    const body = JSON.stringify({ conversationId, apiKey: 'sk-test', model: 'claude-opus-4-7' });
    const clientReq = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      () => {},
    );
    clientReq.on('error', () => {
      // Socket destroy surfaces as ECONNRESET; expected, swallow.
    });
    clientReq.write(body);
    clientReq.end();

    await waitFor(() => capture.signal !== null, 5_000);

    clientReq.destroy();

    await Promise.race([
      abortObserved,
      new Promise<void>((_resolve, reject) =>
        setTimeout(() => reject(new Error('server-side signal never aborted')), 5_000),
      ),
    ]);

    expect(capture.signal?.aborted).toBe(true);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error('waitFor: predicate did not become true');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
