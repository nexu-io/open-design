import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';
import {
  _resetMcpDaemonAuthForTests,
  configureMcpDaemonAuth,
  mcpDaemonAuthHeaders,
  resolveMcpApiToken,
} from '../src/mcp-daemon-auth.js';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;
const REMOTE = 'http://10.0.0.5:7456';
const TOKEN = 'remote-daemon-token';

function authorizationOf(init: RequestInit | undefined): string | null {
  return init?.headers ? new Headers(init.headers).get('authorization') : null;
}

// #9019: `od mcp --daemon-url http://<server>:7456` against a daemon that
// enforces OD_API_TOKEN. Every daemon request must carry the bearer token for
// that origin, and nothing may change for a local, token-less setup.
describe('od mcp daemon API token (#9019)', () => {
  afterEach(() => {
    _resetMcpDaemonAuthForTests();
    _resetMcpWorkspaceContextCacheForTests();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('sends the bearer token on every daemon request of a workspace-scoped tool call', async () => {
    configureMcpDaemonAuth({ token: TOKEN, daemonUrl: REMOTE });
    const seen: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, authorization: authorizationOf(init) });
      if (url.endsWith('/api/workspace/directory')) {
        return new Response(JSON.stringify({ items: [], activeWorkspaceId: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }));

    await handleMcpToolCall(REMOTE, 'list_projects', {});

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.map((call) => call.url)).toContain(`${REMOTE}/api/workspace/directory`);
    for (const call of seen) expect(call.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the token on a catalog tool that carries no workspace headers', async () => {
    configureMcpDaemonAuth({ token: TOKEN, daemonUrl: REMOTE });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ skills: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall(REMOTE, 'list_skills', {});

    expect(fetchMock).toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect(authorizationOf(init)).toBe(`Bearer ${TOKEN}`);
    }
  });

  it('never sends the token to a different origin, such as a rediscovered local daemon', async () => {
    configureMcpDaemonAuth({ token: TOKEN, daemonUrl: REMOTE });
    const local = 'http://127.0.0.1:61234';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ skills: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall(local, 'list_skills', {});

    expect(fetchMock).toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect(authorizationOf(init)).toBeNull();
    }
    expect(mcpDaemonAuthHeaders(`${local}/api/skills`)).toEqual({});
    expect(mcpDaemonAuthHeaders(`${REMOTE}/api/skills`)).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('leaves requests untouched when no token is configured', async () => {
    configureMcpDaemonAuth({ token: '   ', daemonUrl: REMOTE });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ skills: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall(REMOTE, 'list_skills', {});

    expect(fetchMock).toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect(authorizationOf(init)).toBeNull();
    }
  });

  it('keeps the token out of the tool result when the daemon rejects the request', async () => {
    configureMcpDaemonAuth({ token: TOKEN, daemonUrl: REMOTE });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));

    const result = await handleMcpToolCall(REMOTE, 'list_skills', {});

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('resolveMcpApiToken (#9019)', () => {
  it('prefers --api-token-file over OD_API_TOKEN and trims the file', () => {
    expect(resolveMcpApiToken({
      tokenFile: '/run/secrets/od',
      env: { OD_API_TOKEN: 'from-env' },
      readFile: () => '  from-file\n',
    })).toBe('from-file');
  });

  it('falls back to OD_API_TOKEN, and to null when neither is set', () => {
    expect(resolveMcpApiToken({ env: { OD_API_TOKEN: ' from-env ' } })).toBe('from-env');
    expect(resolveMcpApiToken({ env: {} })).toBeNull();
    expect(resolveMcpApiToken({ env: { OD_API_TOKEN: '   ' } })).toBeNull();
  });

  it('rejects an unreadable or empty token file without echoing its contents', () => {
    expect(() => resolveMcpApiToken({
      tokenFile: '/missing',
      env: {},
      readFile: () => {
        throw Object.assign(new Error('secret-in-message'), { code: 'ENOENT' });
      },
    })).toThrow('cannot read --api-token-file /missing (ENOENT)');
    expect(() => resolveMcpApiToken({ tokenFile: '/empty', env: {}, readFile: () => ' \n' }))
      .toThrow('--api-token-file /empty is empty');
  });
});
