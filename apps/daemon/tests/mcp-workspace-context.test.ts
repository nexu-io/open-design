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
});
