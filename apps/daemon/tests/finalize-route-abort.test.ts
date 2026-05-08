/**
 * Coverage for the request-lifecycle abort wiring on
 * `POST /api/projects/:id/finalize/anthropic` (mrcfps's PR #974 P1
 * review on server.ts:3831-3837). Without this wiring, a UI-side
 * cancel only aborts the browser fetch — the daemon's 60–120 s
 * Anthropic call keeps running and still writes DESIGN.md after the
 * UI returns to idle.
 *
 * The SDK-level signal contract is exercised by the existing
 * `finalize-design.test.ts` ("propagates AbortError from fetch when
 * the signal is aborted"). What this file pins is the route-level
 * piece: the route attaches a `req.on('close')` listener that flips
 * an AbortController, and that controller's signal is the one
 * threaded into `finalizeDesignPackage`. We prove it by mocking
 * global fetch to capture the daemon-side signal at first call, then
 * aborting the client-side request and asserting the captured
 * signal received an abort event.
 */
import * as http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/projects/:id/finalize/anthropic — request-lifecycle abort', () => {
  let server: http.Server;
  let baseUrl: string;
  const PROJECT_ID = 'finalize-abort-fixture';

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    // Minimal fixture: a project record (so the route's
    // PROJECT_NOT_FOUND check passes) plus an HTML artifact so
    // resolveCurrentArtifact has something to hand the synthesis
    // prompt. The test never reaches the synthesis output, but the
    // pre-Anthropic phases still need their inputs.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Abort fixture' }),
    });
    const projectDir = path.join(dataDir, 'projects', PROJECT_ID);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'deck.html'), '<!doctype html><h1>Hi</h1>');
    await writeFile(
      path.join(projectDir, 'deck.html.artifact.json'),
      JSON.stringify({
        version: 1,
        kind: 'html',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'html',
        exports: ['html'],
        updatedAt: '2026-05-08T00:00:00.000Z',
      }),
    );
    // Add a conversation with one message so the transcript export
    // (phase 3 in finalize-design.ts) doesn't bail.
    const convResp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Initial' }),
    });
    const convBody = (await convResp.json()) as { conversation: { id: string } };
    await fetch(
      `${baseUrl}/api/projects/${PROJECT_ID}/conversations/${convBody.conversation.id}/messages/seed-msg`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          createdAt: 1,
          updatedAt: 1,
          blocks: [{ type: 'text', text: 'hello' }],
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

  it("aborts the daemon-side controller when the client closes the connection", async () => {
    // Use a ref-object so the outer test scope reads the
    // mock-callback's mutation; bare `let` assignments inside vitest
    // mockImplementation closures are narrowed by TS to their initial
    // value because the type system can't prove the callback runs.
    const capture: { signal: AbortSignal | null } = { signal: null };
    let abortReceived: ((value: void) => void) | null = null;
    const abortObserved = new Promise<void>((resolve) => {
      abortReceived = resolve;
    });

    // Replace global fetch ONLY for outbound requests to api.anthropic.com.
    // The first daemon call to the Anthropic endpoint captures the
    // server-side signal and registers an abort listener; the test
    // then aborts the client-side request and waits for the listener
    // to fire.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('api.anthropic.com')) {
        capture.signal = (init as RequestInit | undefined)?.signal ?? null;
        if (capture.signal) {
          capture.signal.addEventListener('abort', () => abortReceived?.());
        }
        // Never resolve under normal conditions — the abort is the
        // only way out. If the signal is already aborted (rare), reject
        // immediately to mirror real fetch's behavior.
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

    // Use the raw http module rather than fetch() so we can directly
    // destroy the underlying socket and guarantee the server side
    // observes the disconnect (undici fetch's abort behaviour can vary
    // by Node version w.r.t. whether the TCP socket is RST'd promptly).
    const url = new URL(`${baseUrl}/api/projects/${PROJECT_ID}/finalize/anthropic`);
    const body = JSON.stringify({ apiKey: 'sk-test', model: 'claude-opus-4-7' });
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
      // We never actually receive a response — by design, the server
      // is hung on the mocked Anthropic call until we destroy the
      // socket. The response handler is registered defensively.
      () => {},
    );
    clientReq.on('error', () => {
      // Socket destroy will surface as ECONNRESET; expected, swallow.
    });
    clientReq.write(body);
    clientReq.end();

    // Wait until the daemon enters the Anthropic call so we know the
    // route's listeners are attached and the request body has been
    // fully read.
    await waitFor(() => capture.signal !== null, 5_000);

    // Forcibly close the client connection. The server's `res.on('close')`
    // fires, the route aborts its server-side controller, and the
    // signal we captured (server-side) receives an abort event.
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
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error('waitFor: predicate did not become true');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
