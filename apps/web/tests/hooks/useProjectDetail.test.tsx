// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { useProjectDetail } from '../../src/hooks/useProjectDetail';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  };
}

describe('useProjectDetail', () => {
  it('uses an exact bootstrap detail without repeating the project read', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const project = {
      id: 'p-bootstrap',
      name: 'Bootstrapped',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      workspaceId: 'workspace-a',
    };

    const { result } = renderHook(() => useProjectDetail(
      project.id,
      teamContext(),
      'workspace-a',
      { project, resolvedDir: '/tmp/od/projects/p-bootstrap' },
    ));

    expect(result.current).toMatchObject({
      project,
      resolvedDir: '/tmp/od/projects/p-bootstrap',
      loading: false,
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces resolvedDir when the daemon includes it in the response', async () => {
    mockFetchOnce({
      project: { id: 'p1', name: 'Acme', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
      resolvedDir: '/tmp/od/projects/p1',
    });

    const { result } = renderHook(() => useProjectDetail('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.resolvedDir).toBe('/tmp/od/projects/p1');
    expect(result.current.project?.id).toBe('p1');
  });

  it('falls back to metadata.baseDir when the daemon omits resolvedDir', async () => {
    mockFetchOnce({
      project: {
        id: 'p2',
        name: 'Imported',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 1,
        metadata: { kind: 'prototype', baseDir: '/Users/me/projects/imported' },
      },
    });

    const { result } = renderHook(() => useProjectDetail('p2'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resolvedDir).toBe('/Users/me/projects/imported');
  });

  it('returns resolvedDir: null when neither resolvedDir nor metadata.baseDir is present', async () => {
    mockFetchOnce({
      project: { id: 'p3', name: 'Stale daemon', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
    });

    const { result } = renderHook(() => useProjectDetail('p3'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resolvedDir).toBeNull();
  });

  it('captures error state when the request returns non-OK', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });

    const { result } = renderHook(() => useProjectDetail('p4'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });

  it('sends exact workspace authority when reading a bound project detail', async () => {
    const fetchMock = mockFetchOnce({
      project: {
        id: 'p-bound',
        name: 'Bound',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 1,
        workspaceId: 'workspace-a',
      },
      resolvedDir: '/tmp/od/projects/p-bound',
    });

    const { result } = renderHook(() =>
      useProjectDetail('p-bound', teamContext(), 'workspace-a'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers)).toMatchObject(expect.any(Headers));
    expect(new Headers(init?.headers).get('x-od-workspace-id')).toBe('workspace-a');
    expect(new Headers(init?.headers).get('x-od-workspace-member-id')).toBe('member-a');
  });

  it('does not issue a headerless detail read for a known bound project', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() =>
      useProjectDetail('p-bound', teamContext(), 'workspace-b'),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toContain('workspace authority');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
