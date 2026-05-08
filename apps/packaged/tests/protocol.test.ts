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
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
}));

import { afterEach, describe, expect, it } from 'vitest';

import { handleOdRequest } from '../src/protocol.js';

afterEach(() => {
  vi.restoreAllMocks();
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
});
