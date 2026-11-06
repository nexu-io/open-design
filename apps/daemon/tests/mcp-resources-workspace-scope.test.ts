import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _listMcpResources,
  _readMcpResource,
  createMcpDaemonTarget,
  OPEN_DESIGN_BRIEF_APP_RESOURCE,
} from '../src/mcp.js';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;
const BASE = 'http://127.0.0.1:19001';

const DIRECTORY = {
  items: [
    {
      workspaceId: 'ws-personal',
      workspaceName: 'Personal',
      workspaceType: 'personal',
      workspaceMemberId: 'mem-1',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
    },
  ],
  activeWorkspaceId: null,
};

function directoryResponse(): Response {
  return new Response(JSON.stringify(DIRECTORY), { status: 200 });
}

function target() {
  return createMcpDaemonTarget({ daemonUrl: BASE });
}

afterEach(() => {
  _resetMcpWorkspaceContextCacheForTests();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('MCP workspace-scoped resource handlers (#6770)', () => {
  it('list_resources forwards workspace headers on /api/skills and /api/design-systems', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/workspace/directory')) return directoryResponse();
      if (url.endsWith('/api/skills')) {
        return new Response(
          JSON.stringify({ skills: [{ id: 'deck', name: 'Deck', description: 'Build a deck.' }] }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/design-systems')) {
        return new Response(
          JSON.stringify({
            designSystems: [
              {
                id: 'brand-1',
                title: 'Personal Brand',
                summary: 'Owned by the personal workspace.',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await _listMcpResources(target());

    // directory bootstrap
    expect(calls.some((c) => c.url.endsWith('/api/workspace/directory'))).toBe(true);
    // both listing calls were made
    const skillCall = calls.find((c) => c.url.endsWith('/api/skills'));
    const dsCall = calls.find((c) => c.url.endsWith('/api/design-systems'));
    expect(skillCall).toBeTruthy();
    expect(dsCall).toBeTruthy();
    // both carry the workspace headers — this is the regression from #6770:
    // before the fix they were headerless and the daemon returned the NO-SCOPE
    // catalog, hiding claimed Personal design systems from the MCP client.
    expect((skillCall?.init?.headers as Record<string, string>)['x-od-workspace-id']).toBe('ws-personal');
    expect((skillCall?.init?.headers as Record<string, string>)['x-od-workspace-member-id']).toBe('mem-1');
    expect((dsCall?.init?.headers as Record<string, string>)['x-od-workspace-id']).toBe('ws-personal');
    expect((dsCall?.init?.headers as Record<string, string>)['x-od-workspace-member-id']).toBe('mem-1');

    // the personal design system actually shows up
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain('od://skills/deck/SKILL.md');
    expect(uris).toContain('od://design-systems/brand-1/DESIGN.md');
  });

  it('list_resources falls back to headerless behavior when no workspace context resolves', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/workspace/directory')) {
        // No active membership — non-vela fallback.
        return new Response(JSON.stringify({ items: [], activeWorkspaceId: null }), { status: 200 });
      }
      if (url.endsWith('/api/skills')) {
        return new Response(JSON.stringify({ skills: [] }), { status: 200 });
      }
      if (url.endsWith('/api/design-systems')) {
        return new Response(JSON.stringify({ designSystems: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await _listMcpResources(target());

    const skillCall = calls.find((c) => c.url.endsWith('/api/skills'));
    const dsCall = calls.find((c) => c.url.endsWith('/api/design-systems'));
    expect(skillCall?.init?.headers).toBeUndefined();
    expect(dsCall?.init?.headers).toBeUndefined();
    // Built-in resources still listed.
    expect(result.resources.some((r) => r.uri === OPEN_DESIGN_BRIEF_APP_RESOURCE)).toBe(true);
    expect(result.resources.some((r) => r.uri === 'od://focus/active')).toBe(true);
  });

  it('read_resource forwards workspace headers when reading a Personal design system', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/workspace/directory')) return directoryResponse();
      if (url.match(/\/api\/design-systems\/[^/]+$/u)) {
        return new Response(
          JSON.stringify({
            designSystem: {
              id: 'brand-1',
              body: 'palette: indigo/violet\nfonts: Inter\nvoice: crisp',
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await _readMcpResource(target(), 'od://design-systems/brand-1/DESIGN.md');

    const read = calls.find((c) => c.url.endsWith('/api/design-systems/brand-1'));
    expect(read).toBeTruthy();
    // Without this header, the daemon returns `404 design system not found`
    // for a Personal design system the workspace actually owns (#6770).
    expect((read?.init?.headers as Record<string, string>)['x-od-workspace-id']).toBe('ws-personal');
    expect((read?.init?.headers as Record<string, string>)['x-od-workspace-member-id']).toBe('mem-1');

    expect(result.contents[0]?.mimeType).toBe('text/markdown');
    expect(result.contents[0]?.text).toContain('palette: indigo/violet');
  });

  it('read_resource still serves the brief app resource without touching the daemon', async () => {
    const fetchMock = vi.fn(async () => new Response('should-not-be-called', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await _readMcpResource(target(), OPEN_DESIGN_BRIEF_APP_RESOURCE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.contents[0]?.mimeType).toBe('text/html;profile=mcp-app');
  });

  it('read_resource rejects unsupported URIs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    await expect(
      _readMcpResource(target(), 'od://unknown/foo/bar'),
    ).rejects.toThrow(/unsupported resource URI/u);
  });
});
