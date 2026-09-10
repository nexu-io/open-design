// One-shot loopback listener for the OrcaRouter OAuth redirect (Flow A).
//
// Opens an ephemeral port on 127.0.0.1, accepts exactly one
// `GET /cb?code=…&state=…`, hands the outcome to the caller, and closes.
//
// OrcaRouter validates `callback_url` as "https on any host/port, or http on
// loopback" and imposes no port restriction, so unlike the xAI flow we do not
// need a fixed port: `port: 0` lets the OS pick a free one, which sidesteps the
// EADDRINUSE singletons the fixed-port flow has to work around.
//
// Shape mirrors `integrations/xai-oauth-server.ts` on purpose — same one-shot
// lifecycle, same stale-replay guard, same state check — but the branding, the
// callback path, and the port policy are OrcaRouter's, so it is a sibling file
// rather than a parameterisation of another provider's listener.

import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { ORCAROUTER_REDIRECT_PATH } from './orcarouter-oauth.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export type OrcaRouterCallbackOutcome =
  | { kind: 'ok'; code: string; state: string }
  | { kind: 'error'; error: string; state?: string };

export interface StartOrcaRouterCallbackListenerInput {
  /**
   * The state this listener should accept, read lazily on each request.
   *
   * It is a getter rather than a value because the port has to be bound before
   * the authorize URL can name a callback, and the authorize URL is what mints
   * the state — so the real state only exists after the listener is up. Until
   * the caller writes it, the getter returns '' and every request fails the
   * state check, which leaves the listener live for the real callback.
   */
  expectedState: () => string;
  onCallback: (outcome: OrcaRouterCallbackOutcome) => Promise<void> | void;
  timeoutMs?: number;
  port?: number;
  host?: string;
  path?: string;
}

export interface OrcaRouterCallbackListener {
  readonly address: { host: string; port: number };
  stop(): Promise<void>;
}

/**
 * Constant-time comparison of the echoed state against the one we minted.
 *
 * `timingSafeEqual` throws on length mismatch, so the length is compared first
 * — that check leaks only the length, which is fixed for our own tokens and is
 * not secret.
 */
export function safeStateEquals(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export async function startOrcaRouterCallbackListener(
  input: StartOrcaRouterCallbackListenerInput,
): Promise<OrcaRouterCallbackListener> {
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 0;
  const path = input.path ?? ORCAROUTER_REDIRECT_PATH;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let consumed = false;
  let stopped = false;
  let serverRef: http.Server | null = null;
  let timer: NodeJS.Timeout | null = null;

  const closeServer = () =>
    new Promise<void>((resolve) => {
      const s = serverRef;
      serverRef = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!s) return resolve();
      s.close(() => resolve());
      const reaper = setTimeout(() => {
        try {
          s.closeAllConnections?.();
        } catch {
          // ignore
        }
      }, 100);
      reaper.unref?.();
    });

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await closeServer();
  };

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (consumed || !req.url) {
      respond(res, 410, 'Already handled.', 'This authorization was already completed.');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(req.url, `http://${host}:${port}`);
    } catch {
      respond(res, 400, 'Bad request.', 'The authorization response could not be read.');
      return;
    }
    // Browsers make incidental requests (favicon, etc). They must not consume
    // the single slot that belongs to the real callback.
    if (parsed.pathname !== path) {
      respond(res, 404, 'Not found.', 'This address only serves the OrcaRouter callback.');
      return;
    }

    const code = parsed.searchParams.get('code') ?? '';
    const state = parsed.searchParams.get('state') ?? '';
    const errorParam = parsed.searchParams.get('error') ?? '';
    const errorDescription = parsed.searchParams.get('error_description') ?? '';

    const expectedState = input.expectedState();
    const stateMatches =
      Boolean(expectedState) && safeStateEquals(expectedState, state);

    let outcome: OrcaRouterCallbackOutcome;
    // The state check comes first. It is the only thing standing between this
    // listener and a code that somebody else's page dropped on it.
    if (!state || !stateMatches) {
      outcome = {
        kind: 'error',
        error: state ? 'state mismatch' : 'missing state',
        ...(state ? { state } : {}),
      };
    } else if (errorParam) {
      outcome = {
        kind: 'error',
        error: errorDescription ? `${errorParam}: ${errorDescription}` : errorParam,
        state,
      };
    } else if (!code) {
      outcome = { kind: 'error', error: 'missing code', state };
    } else {
      outcome = { kind: 'ok', code, state };
    }

    // A stale tab replaying an old request (or an unmatched state) leaves the
    // listener live so the real redirect can still arrive. Only a matching
    // state consumes it — approve or deny, the user's decision is terminal.
    const consumes = stateMatches;
    if (consumes) consumed = true;

    if (outcome.kind === 'ok') {
      respond(res, 200, 'Connected.', 'You can close this tab and return to OpenDesign.');
    } else {
      respond(res, 400, 'Sign-in failed.', escapeHtml(outcome.error));
    }

    if (!consumes) return;

    try {
      await input.onCallback(outcome);
    } catch (err: unknown) {
      console.error('[orcarouter-oauth] callback handler failed:', err);
    } finally {
      void stop();
    }
  };

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`OrcaRouter callback port ${port} is already in use on ${host}`)
          : err,
      );
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      resolve();
    });
  });

  serverRef = server;
  timer = setTimeout(() => {
    Promise.resolve(
      input.onCallback({ kind: 'error', error: 'authorization timed out — start again' }),
    ).catch(() => {
      // handle() already logs; this is best-effort cleanup.
    });
    void stop();
  }, timeoutMs);
  timer.unref?.();

  const addr = server.address() as AddressInfo;
  return { address: { host: addr.address, port: addr.port }, stop };
}

function respond(
  res: http.ServerResponse,
  status: number,
  title: string,
  body: string,
): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>OpenDesign — ${escapeHtml(title)}</title></head>
<body style="font:14px system-ui;padding:40px;max-width:480px;margin:auto;text-align:center;color:#222;">
  <h1 style="font-size:18px;margin:0 0 12px;">${escapeHtml(title)}</h1>
  <p style="color:#666;">${body}</p>
</body></html>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
