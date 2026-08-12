/**
 * Regression coverage for the `od://` protocol proxy in
 * apps/packaged/src/protocol.ts.
 *
 * The packaged Electron entry registers `od://` as the loader for the
 * web runtime and forwards every renderer request to the local web
 * sidecar through Node's global `fetch` (which is undici under the
 * hood). Without a try/catch in the handler, undici throwing
 * `setTypeOfService EINVAL` from socket internals on certain macOS /
 * VPN configurations bubbled up to Electron's default uncaught
 * exception handler — surfacing as a native "JavaScript error in
 * main process" dialog the moment the user did anything that
 * triggered a fetch (e.g. Settings → Pets → Community).
 *
 * @see https://github.com/nexu-io/open-design/issues/895
 */

// `protocol.handle` from the `electron` module is invoked at import
// time inside `apps/packaged/src/protocol.ts`. Stub the module before
// importing so the test environment doesn't need a real Electron
// runtime.
import { vi } from 'vitest';

vi.mock('electron', () => ({
  // `registerOdProtocol` resolves its proxy fetch through `net.fetch`
  // (Chromium's network stack). Stubbed here so the registration tests can
  // drive the real handler that `protocol.handle` receives.
  net: {
    fetch: vi.fn(),
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { net, protocol } from 'electron';
import { handleOdRequest, registerOdProtocol } from '../src/protocol.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('od:// protocol proxy', () => {
  it('proxies the request through fetchImpl with the rewritten target URL', async () => {
    const captured: Request[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      captured.push(input as Request);
      return new Response('ok', { status: 200 });
    };

    const request = new Request('od://app/api/codex-pets/sync', { method: 'POST' });
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('http://127.0.0.1:17579/api/codex-pets/sync');
    expect(captured[0]!.method).toBe('POST');
  });

  // Font loads are CORS-mode requests per the CSS Fonts spec; without an
  // ACAO header on the proxied response Chromium fails them closed and
  // every packaged icon glyph renders as a tofu square (while plain
  // fetch() of the same URL succeeds, which is what made this hard to
  // diagnose). The proxy must therefore stamp CORS allowance on every
  // response it forwards, streamed or bodyless.
  it('stamps Access-Control-Allow-Origin on proxied responses so CORS-mode font loads succeed', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('ttf-bytes', { status: 200, headers: { 'content-type': 'font/ttf' } });

    const request = new Request('od://app/remixicon.ttf');
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toBe('font/ttf');
  });

  // net.fetch decompresses the upstream body but leaves the encoding
  // headers in place; forwarding them makes renderer-side consumers that
  // honor them (the font loader) gunzip plain bytes and fail. The proxy
  // must strip the stale framing headers.
  it('strips stale content-encoding/length/transfer-encoding from proxied responses', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('plain-after-decode', {
        status: 200,
        headers: {
          'content-type': 'font/ttf',
          'content-encoding': 'gzip',
          'content-length': '99999',
          'transfer-encoding': 'chunked',
        },
      });

    const request = new Request('od://app/remixicon.ttf');
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('transfer-encoding')).toBeNull();
    expect(response.headers.get('content-type')).toBe('font/ttf');
    expect(await response.text()).toBe('plain-after-decode');
  });

  it('stamps CORS allowance on bodyless upstream responses too', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 204 });

    const request = new Request('od://app/api/projects/x', { method: 'DELETE' });
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('preserves the request path, search, and hash when rewriting to the web sidecar', async () => {
    const captured: Request[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      captured.push(input as Request);
      return new Response('', { status: 204 });
    };

    const request = new Request('od://app/api/projects?limit=5#section', { method: 'GET' });
    await handleOdRequest(request, 'http://127.0.0.1:42424/', fetchImpl);

    const target = new URL(captured[0]!.url);
    expect(target.host).toBe('127.0.0.1:42424');
    expect(target.pathname).toBe('/api/projects');
    expect(target.search).toBe('?limit=5');
    // `Request` strips the hash fragment per the Fetch spec, but the
    // pathname + search above are the values the proxy is responsible
    // for getting right. Pin those.
  });

  // The flagship #895 regression: undici can throw `setTypeOfService
  // EINVAL` mid-fetch from socket internals. Without the try/catch
  // wrapper around the handler's fetch call, that rejection propagates
  // up to Electron's default uncaught exception handler and surfaces
  // as a native "JavaScript error in main process" dialog. The
  // handler must instead return a 502 Response so the renderer sees
  // a normal failure and the process keeps running.
  it('returns a 502 Response when the underlying fetch rejects (issue #895)', async () => {
    const fetchImpl: typeof fetch = async () => {
      const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
      error.code = 'EINVAL';
      error.syscall = 'setTypeOfService';
      throw error;
    };

    const request = new Request('od://app/api/codex-pets/sync', { method: 'POST' });
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);

    expect(response.status).toBe(502);
    const body = (await response.json()) as {
      error: string;
      message: string;
      code?: string;
      target: string;
    };
    expect(body.error).toBe('OD_PROTOCOL_PROXY_FAILED');
    expect(body.message).toContain('setTypeOfService');
    expect(body.code).toBe('EINVAL');
    expect(body.target).toBe('http://127.0.0.1:17579/api/codex-pets/sync');
  });

  it('does not throw when fetch rejects (the actual #895 root-cause guard)', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('socket hang up');
    };

    // The promise must resolve with a Response, never reject.
    await expect(
      handleOdRequest(new Request('od://app/'), 'http://127.0.0.1:1/', fetchImpl),
    ).resolves.toBeInstanceOf(Response);
  });

  it('handles non-Error rejection values without throwing', async () => {
    const fetchImpl: typeof fetch = async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'sync timeout';
    };

    const response = await handleOdRequest(
      new Request('od://app/api/probe'),
      'http://127.0.0.1:1/',
      fetchImpl,
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { message: string };
    expect(body.message).toBe('sync timeout');
  });

  // The web sidecar can die and be respawned on a fresh random port
  // mid-session (an update handoff reaped it on 2026-07-25). When
  // `registerOdProtocol` snapshotted the URL, the proxy stayed pinned
  // to the dead port for the rest of the process lifetime and every
  // renderer fetch 502'd until the user quit and relaunched the app.
  // The handler must therefore re-resolve the target on each request.
  it('resolves the web runtime URL on every request instead of snapshotting it', async () => {
    const handleMock = vi.mocked(protocol.handle);
    handleMock.mockClear();

    // `registerOdProtocol` wires the handler to Electron's `net.fetch`, so
    // stub that rather than probing real ports: a port-based test
    // would silently pass or fail depending on whatever happens to be
    // listening on the developer's machine.
    const targets: string[] = [];
    vi.mocked(net.fetch).mockImplementation((async (input: Request) => {
      targets.push(input.url);
      return new Response('ok', { status: 200 });
    }) as unknown as typeof net.fetch);

    let current = 'http://127.0.0.1:50401';
    registerOdProtocol(() => current);

    const handler = handleMock.mock.calls[0]?.[1] as (
      request: Request,
    ) => Promise<Response>;
    expect(handler).toBeTypeOf('function');

    await handler(new Request('od://app/api/runs'));

    // The sidecar dies and comes back on a different ephemeral port.
    current = 'http://127.0.0.1:59530';

    await handler(new Request('od://app/api/runs'));

    expect(targets).toEqual([
      'http://127.0.0.1:50401/api/runs',
      'http://127.0.0.1:59530/api/runs',
    ]);
  });
});

// On first launch the top navigation `od://app/` flows through the same
// handler. If undici throws its transient socket error (#895) on that
// single attempt, the synthetic 502 below IS the document the window
// renders — the React app never mounts and the splash reveals a raw 502
// after its ceiling. Idempotent requests must absorb a transient throw
// by retrying before surfacing the 502.
describe('od:// proxy cancellation plumbing (SSE pool-slot leak guard)', () => {
  it('aborts the upstream fetch when the returned body stream is cancelled', async () => {
    let upstreamAborted = false;
    const fetchImpl: typeof fetch = async (input) => {
      const req = input as Request;
      req.signal.addEventListener('abort', () => {
        upstreamAborted = true;
      });
      // Never-ending SSE-like stream.
      const body = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise(() => {});
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };

    const request = new Request('od://app/api/workspace/events');
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);
    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    // The protocol consumer tears the response down (renderer closed the
    // EventSource) — the upstream connection must be released.
    await response.body!.cancel();
    expect(upstreamAborted).toBe(true);
  });

  it('aborts the upstream fetch when the incoming request signal fires', async () => {
    let upstreamAborted = false;
    const fetchImpl: typeof fetch = async (input) => {
      const req = input as Request;
      req.signal.addEventListener('abort', () => {
        upstreamAborted = true;
      });
      return new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => {}); } }), {
        status: 200,
      });
    };

    const controller = new AbortController();
    const request = new Request('od://app/api/workspace/events', { signal: controller.signal });
    const response = await handleOdRequest(request, 'http://127.0.0.1:17579/', fetchImpl);
    expect(response.status).toBe(200);

    controller.abort();
    // Abort listeners fire synchronously; give the microtask queue one tick.
    await Promise.resolve();
    expect(upstreamAborted).toBe(true);
  });
});

describe('od:// protocol transient retry', () => {
  const transientSocketError = (): Error => {
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    error.syscall = 'setTypeOfService';
    return error;
  };
  const noDelay = { delay: async () => {} };

  it('retries a GET whose first attempt throws a transient socket error and returns the eventual success', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) throw transientSocketError();
      return new Response('ok', { status: 200 });
    };

    const response = await handleOdRequest(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      fetchImpl,
      noDelay,
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('gives up after the bounded attempt budget and returns the 502 proxy-failure document', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw transientSocketError();
    };

    const response = await handleOdRequest(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      fetchImpl,
      noDelay,
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; code?: string };
    expect(body.error).toBe('OD_PROTOCOL_PROXY_FAILED');
    expect(body.code).toBe('EINVAL');
    expect(calls).toBe(3);
  });

  it('does not retry non-idempotent methods', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw transientSocketError();
    };

    const response = await handleOdRequest(
      new Request('od://app/api/codex-pets/sync', { method: 'POST' }),
      'http://127.0.0.1:17579/',
      fetchImpl,
      noDelay,
    );

    expect(response.status).toBe(502);
    expect(calls).toBe(1);
  });

  it('does not retry when the upstream resolves with an HTTP 5xx Response', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('upstream says no', { status: 502 });
    };

    const response = await handleOdRequest(
      new Request('od://app/api/projects'),
      'http://127.0.0.1:17579/',
      fetchImpl,
      noDelay,
    );

    // Resolved responses are app-level answers the renderer owns — the
    // web sidecar's own daemon-proxy 502s must reach the SPA untouched.
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('upstream says no');
    expect(calls).toBe(1);
  });

  it('waits the configured backoff between attempts', async () => {
    const waits: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      throw transientSocketError();
    };

    await handleOdRequest(new Request('od://app/'), 'http://127.0.0.1:17579/', fetchImpl, {
      delay: async (ms: number) => {
        waits.push(ms);
      },
    });

    expect(waits).toEqual([150, 300]);
  });
});

/**
 * Rapid tab switching (project page ⇄ Community) cancels the renderer's
 * in-flight subresource requests by design. Those cancellations were reaching
 * the retry loop as if they were transient socket faults: because
 * `fetchOdTargetOnce` forwards the already-aborted incoming signal to the
 * upstream, every one of the 3 attempts rejected instantly, and the handler
 * then manufactured a 502 "gateway failure" for a request the client had
 * simply walked away from.
 *
 * Evidence — packaged 0.16.2-beta.139 desktop log, 84 × `net::ERR_FAILED`
 * clustered exactly inside navigation bursts, all for fonts/icons
 * (AlbertSans, Assistant-*.woff2, brand-icon.svg, agent-icons/*.svg) plus a
 * POST `presence/leave`, which is precisely the request a project page fires
 * as it unmounts.
 *
 * A client-cancelled request must cost one attempt, no backoff, and must not
 * be reported as an upstream failure.
 */
describe('od:// proxy client-cancellation is not an upstream failure', () => {
  const abortError = (): Error => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  };

  const abortAwareFetch = (counter: { calls: number }): typeof fetch =>
    (async (input: Request) => {
      counter.calls += 1;
      if (input.signal?.aborted === true) throw abortError();
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

  it('does not burn the retry budget on an already-cancelled request', async () => {
    const counter = { calls: 0 };
    const controller = new AbortController();
    controller.abort();
    const waits: number[] = [];

    await handleOdRequest(
      new Request('od://app/fonts/AlbertSans-VariableFont_wght.ttf', {
        signal: controller.signal,
      }),
      'http://127.0.0.1:17579/',
      abortAwareFetch(counter),
      {
        delay: async (ms: number) => {
          waits.push(ms);
        },
      },
    );

    expect(counter.calls).toBe(1);
    expect(waits).toEqual([]);
  });

  it('reports a client cancellation as such, not as a synthetic 502 gateway failure', async () => {
    const counter = { calls: 0 };
    const controller = new AbortController();
    controller.abort();

    const response = await handleOdRequest(
      new Request('od://app/api/projects/p-1/presence/leave', {
        method: 'POST',
        signal: controller.signal,
      }),
      'http://127.0.0.1:17579/',
      abortAwareFetch(counter),
      { delay: async () => {} },
    );

    expect(response.status).not.toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('OD_PROTOCOL_CLIENT_ABORTED');
  });

  it('stops retrying the moment the client aborts mid-flight', async () => {
    const counter = { calls: 0 };
    const controller = new AbortController();
    const fetchImpl: typeof fetch = (async (input: Request) => {
      counter.calls += 1;
      // First attempt fails transiently; the user navigates away during the
      // backoff, so no further attempt should be made.
      if (counter.calls === 1) {
        controller.abort();
        const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
        error.code = 'EINVAL';
        throw error;
      }
      if (input.signal?.aborted === true) throw abortError();
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const response = await handleOdRequest(
      new Request('od://app/agent-icons/opencode.svg', { signal: controller.signal }),
      'http://127.0.0.1:17579/',
      fetchImpl,
      { delay: async () => {} },
    );

    expect(counter.calls).toBe(1);
    expect(response.status).not.toBe(502);
  });
});

/**
 * Local resource exhaustion must FAIL FAST — the proxy's two resilience
 * layers (undici fallback after a net.fetch rejection, linear-backoff
 * transient retry) both amplify load, and when the failure IS "this machine
 * is out of sockets/file descriptors", amplification is exactly wrong:
 * during the incident that motivated this, the undici fallback doubled every
 * failing request (7890 fallback fetches measured) and the retry loop added
 * another 1334 attempts on top, each consuming precisely the resource the
 * machine had run out of.
 *
 * Electron's net.fetch surfaces these as plain Errors whose MESSAGE carries
 * the `net::ERR_...` token while `code` stays unset; Node/undici surfaces
 * them as ErrnoExceptions with a `code`. Both shapes must be recognized.
 *
 * Errors outside the explicit exhaustion whitelist must keep today's
 * behavior: ECONNREFUSED still buys the full retry budget (it covers the
 * daemon startup race) and generic net.fetch rejections still fall back to
 * undici (that fallback rescues real Electron transport regressions such as
 * CSS-mask GETs).
 */
describe('od:// proxy fails fast on local resource exhaustion', () => {
  beforeEach(() => {
    vi.mocked(protocol.handle).mockClear();
    vi.mocked(net.fetch).mockReset();
  });

  const registeredHandler = (): ((request: Request) => Promise<Response>) => {
    const calls = vi.mocked(protocol.handle).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls.at(-1)![1] as (request: Request) => Promise<Response>;
  };

  /** Electron net.fetch shape: token in the message, `code` unset. */
  const exhaustionByMessage = (): Error => new Error('net::ERR_INSUFFICIENT_RESOURCES');

  /** Node/undici shape: token in `code`. */
  const exhaustionByCode = (code: string): Error => {
    const error = new Error(`connect ${code} 127.0.0.1:17579`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  };

  it('does not double a net::ERR_INSUFFICIENT_RESOURCES failure through the undici fallback', async () => {
    vi.mocked(net.fetch).mockRejectedValue(exhaustionByMessage());
    const undiciFetch = vi.fn(async (_input: Request | string | URL) =>
      new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', undiciFetch);

    registerOdProtocol(() => 'http://127.0.0.1:61424/');
    const handler = registeredHandler();
    const response = await handler(new Request('od://app/agent-icons/opencode.svg'));

    // Exhaustion must cost exactly one upstream attempt: no undici double,
    // no retry amplification, an honest 502 to the renderer.
    expect(undiciFetch).not.toHaveBeenCalled();
    expect(vi.mocked(net.fetch)).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('OD_PROTOCOL_PROXY_FAILED');
    expect(body.message).toContain('ERR_INSUFFICIENT_RESOURCES');
  });

  it('does not burn the retry budget when only the message carries net::ERR_INSUFFICIENT_RESOURCES', async () => {
    let calls = 0;
    const waits: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw exhaustionByMessage();
    };

    const response = await handleOdRequest(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      fetchImpl,
      {
        delay: async (ms: number) => {
          waits.push(ms);
        },
      },
    );

    expect(calls).toBe(1);
    expect(waits).toEqual([]);
    expect(response.status).toBe(502);
  });

  it.each(['EMFILE', 'ENFILE', 'EADDRNOTAVAIL', 'ENOBUFS'])(
    'does not burn the retry budget on %s',
    async (code) => {
      let calls = 0;
      const waits: number[] = [];
      const fetchImpl: typeof fetch = async () => {
        calls += 1;
        throw exhaustionByCode(code);
      };

      const response = await handleOdRequest(
        new Request('od://app/'),
        'http://127.0.0.1:17579/',
        fetchImpl,
        {
          delay: async (ms: number) => {
            waits.push(ms);
          },
        },
      );

      expect(calls).toBe(1);
      expect(waits).toEqual([]);
      expect(response.status).toBe(502);
      const body = (await response.json()) as { code?: string };
      expect(body.code).toBe(code);
    },
  );

  // Guard: ECONNREFUSED is NOT exhaustion — it is the daemon/web sidecar not
  // being up yet, and the retry budget is exactly what bridges that startup
  // race. Fast-failing it would regress packaged first-launch.
  it('still spends the full retry budget on ECONNREFUSED', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw exhaustionByCode('ECONNREFUSED');
    };

    const response = await handleOdRequest(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      fetchImpl,
      { delay: async () => {} },
    );

    expect(calls).toBe(3);
    expect(response.status).toBe(502);
  });

  // Guard: a generic net.fetch rejection still gets the undici fallback —
  // that fallback exists because Electron can reject specific renderer-owned
  // subresource requests (CSS-mask GETs) that undici serves fine.
  it('still falls back to undici on a generic net::ERR_FAILED', async () => {
    vi.mocked(net.fetch).mockRejectedValue(new Error('net::ERR_FAILED'));
    const undiciFetch = vi.fn(async (_input: Request | string | URL) =>
      new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', undiciFetch);

    registerOdProtocol(() => 'http://127.0.0.1:61424/');
    const handler = registeredHandler();
    const response = await handler(new Request('od://app/agent-icons/opencode.svg'));

    expect(response.status).toBe(200);
    expect(undiciFetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * The od:// proxy target must be RESOLVED PER REQUEST, never captured as a
 * constant at registration time.
 *
 * Two failure shapes motivated this:
 *
 * 1. The registration site used to hand `registerOdProtocol` a plain string
 *    (`sidecars.web.url`), so the address the proxy forwards to was frozen at
 *    boot. Nothing in today's packaged runtime re-spawns the web sidecar, so
 *    that string cannot go stale on its own — but the coupling is invisible,
 *    and the moment anything re-resolves the sidecar (supervision, reconnect,
 *    a second bring-up) the protocol layer would keep hammering the dead port
 *    while every renderer resource fails ERR_CONNECTION_REFUSED. Resolving
 *    through a provider makes the protocol layer correct by construction
 *    instead of correct by accident.
 * 2. The registration site papered over a missing address with
 *    `?? "http://127.0.0.1:0"`. Port 0 is "pick me an ephemeral port" for a
 *    LISTENER; as a CONNECT target it is meaningless, so an unavailable web
 *    runtime surfaced as a confusing connection error against a nonsense port
 *    instead of an honest "the web runtime is not up".
 */
describe('od:// protocol target resolution', () => {
  beforeEach(() => {
    vi.mocked(protocol.handle).mockClear();
    vi.mocked(net.fetch).mockReset();
  });

  const registeredHandler = (): ((request: Request) => Promise<Response>) => {
    const calls = vi.mocked(protocol.handle).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls.at(-1)![1] as (request: Request) => Promise<Response>;
  };

  it('follows the web sidecar address when it changes after registration', async () => {
    const captured: string[] = [];
    vi.mocked(net.fetch).mockImplementation((async (input: Request) => {
      captured.push(input.url);
      return new Response('ok', { status: 200 });
    }) as unknown as typeof net.fetch);

    // The address the provider reports is what the proxy must use — including
    // after it changes. A registration that snapshots the first value keeps
    // forwarding to the retired port forever.
    let webRuntimeUrl: string | null = 'http://127.0.0.1:61424/';
    registerOdProtocol(() => webRuntimeUrl);
    const handler = registeredHandler();

    const first = await handler(new Request('od://app/_next/static/chunk-a.js'));
    expect(first.status).toBe(200);

    webRuntimeUrl = 'http://127.0.0.1:52001/';

    const second = await handler(new Request('od://app/_next/static/chunk-b.js'));
    expect(second.status).toBe(200);

    expect(captured).toEqual([
      'http://127.0.0.1:61424/_next/static/chunk-a.js',
      'http://127.0.0.1:52001/_next/static/chunk-b.js',
    ]);
  });

  it('falls back to undici when net.fetch rejects a CSS-mask GET', async () => {
    vi.mocked(net.fetch).mockRejectedValue(new Error('net::ERR_FAILED'));
    const undiciFetch = vi.fn(async (_input: Request | string | URL) =>
      new Response('<svg viewBox="0 0 24 24"></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }));
    vi.stubGlobal('fetch', undiciFetch);

    registerOdProtocol(() => 'http://127.0.0.1:61424/');
    const handler = registeredHandler();
    const response = await handler(new Request('od://app/agent-icons/opencode.svg'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('<svg');
    expect(vi.mocked(net.fetch)).toHaveBeenCalledTimes(1);
    expect(undiciFetch).toHaveBeenCalledTimes(1);
    expect((undiciFetch.mock.calls[0]![0] as Request).url)
      .toBe('http://127.0.0.1:61424/agent-icons/opencode.svg');
  });

  it('does not replay a non-idempotent request through undici when net.fetch rejects', async () => {
    vi.mocked(net.fetch).mockRejectedValue(new Error('net::ERR_FAILED'));
    const undiciFetch = vi.fn(async (_input: Request | string | URL) =>
      new Response('unexpected', { status: 200 }));
    vi.stubGlobal('fetch', undiciFetch);

    registerOdProtocol(() => 'http://127.0.0.1:61424/');
    const handler = registeredHandler();
    const response = await handler(new Request('od://app/api/projects', { method: 'POST' }));

    expect(response.status).toBe(502);
    expect(vi.mocked(net.fetch)).toHaveBeenCalledTimes(1);
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it('answers a missing web runtime address with a structured 503 instead of dialling a placeholder port', async () => {
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response('ok', { status: 200 });
    };

    const response = await handleOdRequest(
      new Request('od://app/_next/static/chunk-a.js'),
      null,
      fetchImpl,
      { delay: async () => {} },
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; target?: string };
    expect(body.error).toBe('OD_PROTOCOL_TARGET_UNAVAILABLE');
    // Nothing may be dialled: there is no address to dial, and 127.0.0.1:0 is
    // not a real one.
    expect(fetchCalls).toBe(0);
    expect(JSON.stringify(body)).not.toContain('127.0.0.1:0');
  });

  it('surfaces the 503 through the registered handler when the provider reports no address', async () => {
    vi.mocked(net.fetch).mockImplementation((async () => {
      throw new Error('net.fetch must not be reached without a target');
    }) as unknown as typeof net.fetch);

    registerOdProtocol(() => null);
    const handler = registeredHandler();

    const response = await handler(new Request('od://app/'));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('OD_PROTOCOL_TARGET_UNAVAILABLE');
    expect(vi.mocked(net.fetch)).not.toHaveBeenCalled();
  });

  it('never rejects on a malformed target, so a bad address cannot reach the Electron uncaught handler', async () => {
    // `toWebRuntimeUrl` used to run OUTSIDE the handler's try/catch, so a
    // non-parseable address threw straight out of the protocol handler — the
    // exact "JavaScript error in main process" dialog the #895 catch exists to
    // prevent.
    const fetchImpl: typeof fetch = async () => new Response('ok', { status: 200 });

    await expect(
      handleOdRequest(new Request('od://app/'), 'not-a-url', fetchImpl, { delay: async () => {} }),
    ).resolves.toBeInstanceOf(Response);
  });
});
