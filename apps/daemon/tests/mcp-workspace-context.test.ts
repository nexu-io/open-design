import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceDirectoryItem } from '@open-design/contracts';

import {
  _resetMcpWorkspaceContextCacheForTests,
  resolveMcpWorkspaceContext,
  selectDefaultMcpCandidate,
} from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;

function item(overrides: Partial<WorkspaceDirectoryItem> = {}): WorkspaceDirectoryItem {
  return {
    workspaceId: 'ws-personal',
    workspaceName: 'Personal',
    workspaceType: 'personal',
    workspaceMemberId: 'mem-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    ...overrides,
  };
}

afterEach(() => {
  _resetMcpWorkspaceContextCacheForTests();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('selectDefaultMcpCandidate', () => {
  it('only considers active, live memberships', () => {
    const removed = item({ workspaceId: 'ws-removed', memberStatus: 'removed' });
    const deleted = item({ workspaceId: 'ws-deleted', lifecycleState: 'deleted' });
    const active = item({ workspaceId: 'ws-active' });
    expect(selectDefaultMcpCandidate([removed, deleted, active])).toBe(active);
  });

  it('prefers the preferred workspace when it is an active candidate', () => {
    const team = item({ workspaceId: 'ws-team', workspaceType: 'team' });
    const personal = item({ workspaceId: 'ws-personal' });
    expect(selectDefaultMcpCandidate([team, personal], 'ws-team')).toBe(team);
    expect(selectDefaultMcpCandidate([team, personal], 'missing')).toBe(personal);
  });

  it('prefers activeWorkspaceId over both personal and first-item fallbacks', () => {
    // Reproduces nexu-io/open-design#7613: when activeWorkspaceId points to a
    // non-first team workspace, the MCP must use that workspace — not the first
    // item in the directory list — so local projects are readable (403 was caused
    // by the MCP acting as the wrong workspace).
    const teamA = item({ workspaceId: 'ws-a', workspaceType: 'team', workspaceMemberId: 'mem-a' });
    const teamB = item({ workspaceId: 'ws-b', workspaceType: 'team', workspaceMemberId: 'mem-b' });
    // activeWorkspaceId targets the second (non-first) team workspace.
    expect(selectDefaultMcpCandidate([teamA, teamB], 'ws-b')).toBe(teamB);
    expect(selectDefaultMcpCandidate([teamA, teamB], 'ws-b')).not.toBe(teamA);
  });

  it('prefers a personal workspace over a team workspace, then first candidate', () => {
    const teamA = item({ workspaceId: 'ws-a', workspaceType: 'team' });
    const personal = item({ workspaceId: 'ws-personal' });
    const teamB = item({ workspaceId: 'ws-b', workspaceType: 'team' });
    expect(selectDefaultMcpCandidate([teamA, personal, teamB])).toBe(personal);
    expect(selectDefaultMcpCandidate([teamA, teamB])).toBe(teamA);
  });

  it('returns undefined for empty or fully-inactive lists', () => {
    expect(selectDefaultMcpCandidate([])).toBeUndefined();
    expect(
      selectDefaultMcpCandidate([
        item({ memberStatus: 'removed' }),
        item({ lifecycleState: 'deleted' }),
      ]),
    ).toBeUndefined();
  });
});

describe('resolveMcpWorkspaceContext', () => {
  it('bootstraps the personal workspace and returns both headers', async () => {
    const base = 'http://127.0.0.1:19001';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [item()],
          activeWorkspaceId: null,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ctx = await resolveMcpWorkspaceContext(base);
    expect(ctx).toEqual({
      workspaceId: 'ws-personal',
      workspaceMemberId: 'mem-1',
      workspaceType: 'personal',
      headers: {
        'x-od-workspace-id': 'ws-personal',
        'x-od-workspace-member-id': 'mem-1',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/api/workspace/directory`, expect.anything());
  });

  it('returns null on a directory outage (non-200)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    );
    expect(await resolveMcpWorkspaceContext('http://x')).toBeNull();
  });

  it('returns null when the directory has no active membership (non-vela)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [], activeWorkspaceId: null }), { status: 200 })),
    );
    expect(await resolveMcpWorkspaceContext('http://x')).toBeNull();
  });

  it('caches per baseUrl within the TTL', async () => {
    const base = 'http://127.0.0.1:19001';
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [item()], activeWorkspaceId: null }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await resolveMcpWorkspaceContext(base);
    await resolveMcpWorkspaceContext(base);
    await resolveMcpWorkspaceContext(base);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Different baseUrl re-bootstraps independently.
    await resolveMcpWorkspaceContext('http://127.0.0.1:19002');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('force bypasses the cache and refetches', async () => {
    const base = 'http://127.0.0.1:19001';
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [item()], activeWorkspaceId: null }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await resolveMcpWorkspaceContext(base);
    await resolveMcpWorkspaceContext(base, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off for the failure cooldown after an outage', async () => {
    const base = 'http://127.0.0.1:19001';
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return new Response('unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveMcpWorkspaceContext(base)).toBeNull();
    expect(await resolveMcpWorkspaceContext(base)).toBeNull();
    expect(await resolveMcpWorkspaceContext(base)).toBeNull();
    expect(calls).toBe(1);

    // force breaks the cooldown.
    expect(await resolveMcpWorkspaceContext(base, { force: true })).toBeNull();
    expect(calls).toBe(2);
  });

  it('uses activeWorkspaceId to select the workspace (fixes #7613)', async () => {
    // nexu-io/open-design#7613: MCP ignores activeWorkspaceId and falls back to
    // the first workspace, causing 403 on local projects when the active workspace
    // is not first in the directory list.
    const base = 'http://127.0.0.1:19001';
    const teamA = item({ workspaceId: 'ws-a', workspaceType: 'team', workspaceMemberId: 'mem-a' });
    const teamB = item({ workspaceId: 'ws-b', workspaceType: 'team', workspaceMemberId: 'mem-b' });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [teamA, teamB],
          activeWorkspaceId: 'ws-b', // active is second (not first) in the list
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ctx = await resolveMcpWorkspaceContext(base);
    // Must select ws-b (activeWorkspaceId), NOT ws-a (first item).
    expect(ctx).toEqual({
      workspaceId: 'ws-b',
      workspaceMemberId: 'mem-b',
      workspaceType: 'team',
      headers: {
        'x-od-workspace-id': 'ws-b',
        'x-od-workspace-member-id': 'mem-b',
      },
    });
  });
});
