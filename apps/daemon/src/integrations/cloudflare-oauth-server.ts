// One-shot HTTP listener on 127.0.0.1:56122 for the Cloudflare OAuth callback.
//
// Mirrors the xAI one-shot listener (xai-oauth-server.ts), but on its own
// port so the Cloudflare and xAI flows can never collide. The redirect_uri is
// http://127.0.0.1:56122/callback and the Cloudflare OAuth client must be
// registered with that exact redirect URL.
//
// The listener:
//   - opens 127.0.0.1:56122
//   - accepts a single GET /callback?code=...&state=...
//   - validates state matches the in-flight OAuth dance, invokes
//     onCallback, then closes itself
//   - times out after 30 min if the user never returns from the browser
//   - returns a 4xx + diagnostic HTML if state doesn't match — guards
//     against stale browser tabs replaying an old code

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { renderOAuthResultPage } from '../http/oauth-result-page.js';
import { CLOUDFLARE_PROVIDER_ID } from './cloudflare-oauth.js';

export const CLOUDFLARE_CALLBACK_HOST = '127.0.0.1';
export const CLOUDFLARE_CALLBACK_PORT = 56122;
export const CLOUDFLARE_CALLBACK_PATH = '/callback';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

export type CallbackOutcome =
  | { kind: 'ok'; code: string; state: string }
  | { kind: 'error'; error: string; state?: string };

export interface StartCallbackListenerInput {
  expectedState: string;
  onCallback: (outcome: CallbackOutcome) => Promise<void> | void;
  timeoutMs?: number;
  /** Override port (useful for tests; default 56122). */
  port?: number;
  /** Override host (useful for tests; default 127.0.0.1). */
  host?: string;
}

export interface CallbackListener {
  /** Where the listener is actually bound (informational, esp. for tests). */
  readonly address: { host: string; port: number };
  /** Stop the listener early (e.g. user cancelled OAuth in the UI). */
  stop(): Promise<void>;
}

/**
 * Open a one-shot HTTP listener for the Cloudflare OAuth redirect.
 *
 * Resolves once the listener is bound; callback handling is asynchronous via
 * `onCallback`. The listener self-closes after the first matching callback OR
 * after `timeoutMs` (default 30 min), whichever comes first.
 */
export async function startCallbackListener(
  input: StartCallbackListenerInput,
): Promise<CallbackListener> {
  const host = input.host ?? CLOUDFLARE_CALLBACK_HOST;
  const port = input.port ?? CLOUDFLARE_CALLBACK_PORT;
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
      // Force close after a short grace period so lingering keep-alive
      // sockets don't keep the event loop alive in tests.
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
      res.statusCode = 410;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Listener already consumed.');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(req.url, `http://${host}:${port}`);
    } catch {
      res.statusCode = 400;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Bad request.');
      return;
    }
    // Ignore favicon.ico and any other path so the browser's incidental
    // requests don't consume the slot meant for /callback.
    if (parsed.pathname !== CLOUDFLARE_CALLBACK_PATH) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Not found.');
      return;
    }

    const code = parsed.searchParams.get('code') ?? '';
    const state = parsed.searchParams.get('state') ?? '';
    const errorParam = parsed.searchParams.get('error') ?? '';

    let outcome: CallbackOutcome;
    if (errorParam) {
      outcome = state
        ? { kind: 'error', error: errorParam, state }
        : { kind: 'error', error: errorParam };
    } else if (!code || !state) {
      outcome = { kind: 'error', error: 'missing code or state' };
    } else if (state !== input.expectedState) {
      outcome = { kind: 'error', error: 'state mismatch', state };
    } else {
      outcome = { kind: 'ok', code, state };
    }

    // Decide whether this hit *consumes* the listener. A stray browser tab
    // replaying an old `/callback?state=…` (or `?error=…&state=…`) would
    // otherwise close the singleton :56122 listener before the real
    // Cloudflare redirect can arrive — we share a fixed port, so killing it
    // on a stale request strands the in-flight authorization. Keep the
    // listener open on stale/malformed requests; the real callback will still
    // find it. Consume on:
    //   - ok callback (matched state, code present)
    //   - explicit ?error= without a state (Cloudflare rejected before issuing
    //     state, so there's nothing to match against — safe to consume)
    //   - explicit ?error= with state matching our expectedState (Cloudflare
    //     told the user the dance failed; propagate now instead of waiting for
    //     the 30 min timeout)
    // An ?error= with a *mismatched* state is treated like the stale success
    // replay above: 400 the browser, leave the listener live.
    const errorConsumes =
      Boolean(errorParam) && (!state || state === input.expectedState);
    const consumesListener = outcome.kind === 'ok' || errorConsumes;
    if (consumesListener) {
      consumed = true;
    }

    res.statusCode = outcome.kind === 'ok' ? 200 : 400;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderResultPage(outcome));

    if (!consumesListener) {
      // Stale-tab replay or malformed request — don't surface to the caller
      // and don't tear down the listener. The browser sees the 400 page; the
      // real flow can still complete on a later hit.
      return;
    }

    try {
      await input.onCallback(outcome);
    } catch (err: unknown) {
      console.error('[cloudflare-oauth] onCallback failed:', err);
    } finally {
      void stop();
    }
  };

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use — close any other process listening on ${host}:${port} (e.g. an in-flight Cloudflare OAuth flow) and try again`,
          ),
        );
      } else {
        reject(err);
      }
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
      input.onCallback({
        kind: 'error',
        error: 'OAuth timed out — sign in again',
      }),
    ).catch(() => {
      // already logging in handle(); this branch is best-effort cleanup.
    });
    void stop();
  }, timeoutMs);
  // unref so the timer doesn't keep the event loop alive in tests.
  timer.unref?.();

  const addr = server.address() as AddressInfo;
  return {
    address: { host: addr.address, port: addr.port },
    stop,
  };
}

function renderResultPage(outcome: CallbackOutcome): string {
  if (outcome.kind === 'ok') {
    const origin = `http://127.0.0.1:${process.env.OD_PORT || '7456'}`;
    return renderOAuthResultPage({ ok: true, providerLabel: 'Cloudflare', returnUrl: origin });
  }
  return renderOAuthResultPage({
    ok: false,
    message: outcome.error || 'unknown error',
  });
}
