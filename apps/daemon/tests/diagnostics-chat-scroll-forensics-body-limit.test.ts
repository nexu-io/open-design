// Regression: the chat-scroll forensics capture is silently truncated by the
// GLOBAL 4mb JSON parser, so the only bundles that matter never arrive.
//
// The defect
// ----------
// `chatScrollForensicsBodyParser` is sized at 24mb
// (`src/diagnostics-client-evidence.ts`) precisely because a capture carries
// the chat log's full `outerHTML` — the renderer truncates its own side at 8MB
// (`apps/web/src/observability/chat-scroll-forensics.ts`) and the envelope
// carries TWO of them (`live` and `retained`). But that parser is attached to
// the route, and the route is registered thousands of lines AFTER the
// app-level `app.use(express.json({ limit: '4mb' }))`. `express.json` is a
// no-op once a body has already been read, so the global parser claims — and
// rejects — the body first. The 24mb parser never runs.
//
// The failure is silent by construction: `uploadChatScrollForensics` returns
// `res.ok` and never throws, so the colleague sees a normal export and we get
// a bundle with no renderer evidence in it. The longer the transcript, the
// more certain the loss — which inverts the whole point of the endpoint,
// because a transcript long enough to freeze is a transcript too long to send.
//
// Why this file exists next to `diagnostics-chat-scroll-forensics.test.ts`
// -----------------------------------------------------------------------
// That suite calls `chatScrollForensicsHandler` directly with a hand-made
// `{ body }` object. Handler-level specs cannot see this bug at all: they never
// go through express, so parser ORDER — the entire defect — is invisible to
// them, and they stayed green while the endpoint was broken. Everything here
// therefore goes over a real socket into a real `startServer()` app, which is
// the only vantage point from which mount order is observable.

import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHAT_SCROLL_FORENSICS_PATH } from '../src/diagnostics-client-evidence.js';

/** Over the global 4mb ceiling, comfortably under the route's own 24mb. */
const OVER_GLOBAL_LIMIT_BYTES = 6 * 1024 * 1024;

let daemon: http.Server | undefined;
let daemonShutdown: (() => Promise<void> | void) | undefined;
let baseUrl = '';
let dataDir = '';

const PREV_DATA_DIR = process.env.OD_DATA_DIR;

interface PostResult {
  /** Null when the server tore the upload down before answering. */
  status: number | null;
  body: string;
  /** Socket-level failure code, when there was no response at all. */
  transportError: string | null;
}

/**
 * POST over a real socket.
 *
 * Deliberately `node:http` rather than `fetch`: when body-parser refuses an
 * oversized body it answers mid-upload and stops reading, and undici surfaces
 * that as an opaque `TypeError: fetch failed` about half the time. The raw
 * client lets the spec record BOTH shapes — a real status line, or the reset
 * that stands in for one — so "the daemon refused this body" is observable
 * either way.
 */
function post(url: string, body: string): Promise<PostResult> {
  return new Promise((resolve) => {
    const target = new URL(url);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? null,
            body: Buffer.concat(chunks).toString('utf8'),
            transportError: null,
          }),
        );
        res.on('error', () =>
          resolve({ status: res.statusCode ?? null, body: '', transportError: 'response_stream_error' }),
        );
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      resolve({ status: null, body: '', transportError: error.code ?? error.message });
    });
    req.end(body);
  });
}

/**
 * An envelope shaped like the real one, padded to `bytes`.
 *
 * The padding sits under `live.forensics.dom.outerHTML` rather than in a
 * throwaway key, because that IS where the weight lives in production: a
 * serialized chat log.
 */
function forensicsEnvelopeOfSize(bytes: number): string {
  const skeleton = JSON.stringify({
    version: 1,
    capturedAtIso: new Date().toISOString(),
    live: {
      available: true,
      reason: null,
      forensics: { version: 1, dom: { captured: true, outerHTML: '' } },
    },
    retained: { available: false, capturedAtIso: null, ageMs: null, forensics: null },
    note: 'body-limit spec',
  });
  const padding = Math.max(0, bytes - Buffer.byteLength(skeleton));
  return skeleton.replace('"outerHTML":""', `"outerHTML":"${'x'.repeat(padding)}"`);
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-forensics-body-limit-'));
  process.env.OD_DATA_DIR = dataDir;

  // Dynamic import AFTER OD_DATA_DIR is set: RUNTIME_DATA_DIR resolves at
  // module-eval time, so a static import would pin the real data dir.
  const { startServer } = await import('../src/server.js');
  const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  daemon = started.server;
  daemonShutdown = started.shutdown;
});

afterEach(async () => {
  if (daemonShutdown) {
    await Promise.race([
      Promise.resolve(daemonShutdown()),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  daemon?.closeAllConnections?.();
  if (daemon) await new Promise<void>((resolve) => daemon!.close(() => resolve()));
  daemon = undefined;
  daemonShutdown = undefined;
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  if (PREV_DATA_DIR === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = PREV_DATA_DIR;
}, 20_000);

describe('chat-scroll forensics body limit, through the real express app', () => {
  it('accepts a capture larger than the global 4mb ceiling', async () => {
    const envelope = forensicsEnvelopeOfSize(OVER_GLOBAL_LIMIT_BYTES);
    // Guard the fixture itself: a padding bug that produced a small body would
    // make this spec pass for the wrong reason.
    expect(Buffer.byteLength(envelope)).toBeGreaterThan(4 * 1024 * 1024);
    expect(Buffer.byteLength(envelope)).toBeLessThan(24 * 1024 * 1024);

    const result = await post(`${baseUrl}${CHAT_SCROLL_FORENSICS_PATH}`, envelope);

    // eslint-disable-next-line no-console
    console.log(
      `[FORENSICS BODY LIMIT] bytes=${Buffer.byteLength(envelope)} status=${result.status} `
      + `transportError=${result.transportError} body=${result.body.slice(0, 200)}`,
    );

    expect({ status: result.status, transportError: result.transportError }).toEqual({
      status: 200,
      transportError: null,
    });
    expect(JSON.parse(result.body)).toMatchObject({ ok: true, receivedAtIso: expect.any(String) });
  }, 30_000);

  it('leaves every other API route on the conservative 4mb ceiling', async () => {
    // The fix must be a route-scoped parser registered ahead of the global one,
    // not a bigger global limit: raising the global would widen the parse
    // surface of every route in the daemon. `express.json` is app-level
    // middleware, so it runs — and refuses — before routing, which is why an
    // unrouted path is a clean probe of the global ceiling alone.
    const result = await post(
      `${baseUrl}/api/__body-limit-probe`,
      forensicsEnvelopeOfSize(OVER_GLOBAL_LIMIT_BYTES),
    );

    // eslint-disable-next-line no-console
    console.log(
      `[GLOBAL CEILING] status=${result.status} transportError=${result.transportError} `
      + `body=${result.body.slice(0, 200)}`,
    );

    // Either shape counts as a refusal; what must never happen is the body
    // being parsed and the request reaching routing (404).
    const refused = result.status === 413 || (result.status === null && result.transportError != null);
    expect(refused).toBe(true);
  }, 30_000);
});
