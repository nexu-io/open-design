// One-shot HTTP listener on 127.0.0.1:56121 for the xAI OAuth callback.
//
// xAI OAuth uses a Hermes-issued client_id whose registered redirect_uri
// is hard-locked to http://127.0.0.1:56121/callback (Hermes itself runs
// a short-lived listener on this port). We mirror the same shape so the
// PoC can reuse the same client_id without re-registering with xAI.
// Once Open Design has its own client_id, the daemon's normal HTTP port
// can take over and this whole file goes away.
//
// The listener:
//   - opens 127.0.0.1:56121
//   - accepts a single GET /callback?code=...&state=...
//   - validates state matches the in-flight OAuth dance, invokes
//     onCallback, then closes itself
//   - times out after 30 min if the user never returns from the browser
//   - returns a 4xx + diagnostic HTML if state doesn't match — guards
//     against stale browser tabs replaying an old code

import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const XAI_CALLBACK_HOST = '127.0.0.1';
export const XAI_CALLBACK_PORT = 56121;
export const XAI_CALLBACK_PATH = '/callback';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

export type CallbackOutcome =
  | { kind: 'ok'; code: string; state: string }
  | { kind: 'error'; error: string; state?: string };

export interface StartCallbackListenerInput {
  expectedState: string;
  onCallback: (outcome: CallbackOutcome) => Promise<void> | void;
  timeoutMs?: number;
  /** Override port (useful for tests; default 56121). */
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
 * Open a one-shot HTTP listener for the xAI OAuth redirect.
 *
 * Resolves once the listener is bound; callback handling is asynchronous
 * via `onCallback`. The listener self-closes after the first matching
 * callback OR after `timeoutMs` (default 30 min), whichever comes first.
 */
export async function startCallbackListener(
  input: StartCallbackListenerInput,
): Promise<CallbackListener> {
  const host = input.host ?? XAI_CALLBACK_HOST;
  const port = input.port ?? XAI_CALLBACK_PORT;
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
    if (parsed.pathname !== XAI_CALLBACK_PATH) {
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

    // Decide whether this hit *consumes* the listener. A stray browser
    // tab replaying an old `/callback?state=…` (or `?error=…&state=…`)
    // would otherwise close the singleton :56121 listener before the
    // real xAI redirect can arrive — we share a fixed port, so killing
    // it on a stale request strands the in-flight authorization. Keep
    // the listener open on stale/malformed requests; the real callback
    // will still find it. Consume on:
    //   - ok callback (matched state, code present)
    //   - explicit ?error= without a state (xAI rejected before issuing
    //     state, so there's nothing to match against — safe to consume)
    //   - explicit ?error= with state matching our expectedState (xAI
    //     told the user the dance failed; propagate now instead of
    //     waiting for the 30 min timeout)
    // An ?error= with a *mismatched* state is treated like the stale
    // success replay above: 400 the browser, leave the listener live.
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
      // Stale-tab replay or malformed request — don't surface to the
      // caller and don't tear down the listener. The browser sees the
      // 400 page; the real flow can still complete on a later hit.
      return;
    }

    try {
      await input.onCallback(outcome);
    } catch (err: unknown) {
      console.error('[xai-oauth] onCallback failed:', err);
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
            `Port ${port} is already in use — close any other process listening on ${host}:${port} (e.g. an in-flight Hermes or Open Design OAuth flow) and try again`,
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
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Open Design — xAI authorized</title></head>
<body style="font:14px system-ui;padding:40px;max-width:480px;margin:auto;text-align:center;color:#222;">
  <h1 style="font-size:18px;margin:0 0 12px;">Authorized!</h1>
  <p style="color:#666;">Open Design now has access to your SuperGrok subscription. You can close this tab and return to Open Design.</p>
</body></html>`;
  }
  const reason = escapeHtml(outcome.error || 'unknown error');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Open Design — sign-in failed</title></head>
<body style="font:14px system-ui;padding:40px;max-width:480px;margin:auto;text-align:center;color:#222;">
  <h1 style="font-size:18px;margin:0 0 12px;">Sign-in failed</h1>
  <p style="color:#c00;">${reason}</p>
  <p style="color:#666;">Close this tab and click <em>Sign in with X</em> again in Open Design.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
