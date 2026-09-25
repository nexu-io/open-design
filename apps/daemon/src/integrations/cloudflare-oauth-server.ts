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
  /** Exchange + persist the token; resolve true on success, false on failure
   * so the listener can render the durable outcome instead of a blind 200. */
  onCallback: (outcome: CallbackOutcome) => Promise<boolean> | boolean;
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

  // Memoized so every caller awaits the SAME close: the daemon's /start drains
  // a listener the callback already began stopping, and must not bind the
  // port before that close has actually finished.
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (!stopping) stopping = closeServer();
    return stopping;
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
    //   - explicit ?error= with state matching our expectedState (Cloudflare
    //     told the user the dance failed; propagate now instead of waiting for
    //     the 30 min timeout)
    // An ?error= with a *mismatched* or *missing* state is treated like the
    // stale success replay above: 400 the browser, leave the listener live.
    // The state is the only proof the request came from OUR dance — anything
    // on this machine can GET 127.0.0.1:56122/callback?error=x, and a
    // state-less error consuming the slot would let it kill the flow.
    const errorConsumes = Boolean(errorParam) && state === input.expectedState;
    const consumesListener = outcome.kind === 'ok' || errorConsumes;
    if (consumesListener) {
      consumed = true;
      // Cancel the 30-minute self-close timeout once the listener is consumed:
      // a callback arriving just before the deadline must not be killed
      // mid-token-exchange by the reaper (the browser would see a reset).
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // For an 'ok' callback, exchange the code and persist the token BEFORE
    // rendering, so the browser sees the durable outcome — an invalid code,
    // upstream failure, or disk error must not show a false success page.
    if (outcome.kind === 'ok') {
      let success = false;
      try {
        success = (await input.onCallback(outcome)) !== false;
      } catch (err: unknown) {
        console.error('[cloudflare-oauth] onCallback failed:', err);
      }
      res.statusCode = success ? 200 : 502;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        renderResultPage(
          success
            ? outcome
            : { kind: 'error', error: 'Token exchange failed — close this tab and try again.' },
        ),
      );
      void stop();
      return;
    }

    // Error outcome: render 400 immediately (no exchange to run).
    res.statusCode = 400;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderResultPage(outcome));

    if (!consumesListener) {
      // Stale-tab replay or malformed request — don't surface to the caller
      // and don't tear down the listener. The browser sees the 400 page; the
      // real flow can still complete on a later hit.
      return;
    }
    // A consuming error (Cloudflare rejected the dance, or the user declined)
    // must reach the daemon the same way an ok callback does: without this the
    // daemon never clears its activeListener and the UI polls until the 30 min
    // timeout fires.
    try {
      await input.onCallback(outcome);
    } catch (err: unknown) {
      console.error('[cloudflare-oauth] onCallback failed:', err);
    }
    void stop();
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
