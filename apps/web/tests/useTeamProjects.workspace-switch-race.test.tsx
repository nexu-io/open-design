// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  lastResolvedTeamProjects,
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
} from '../src/collab/useWorkspaceContext';
import { useProjectCollab } from '../src/collab/useProjectCollab';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const CONTEXTS = {
  a: workspaceContextFixture({ workspaceId: 'ws-a', workspaceMemberId: 'mem-a' }),
  b: workspaceContextFixture({ workspaceId: 'ws-b', workspaceMemberId: 'mem-b' }),
};

const B_PROJECT = {
  projectId: 'project-b',
  ownerMemberId: 'mem-b',
  name: 'Workspace B project',
};
const A_PROJECT = {
  projectId: 'project-a',
  ownerMemberId: 'mem-a',
  name: 'Workspace A project',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useTeamProjects workspace-switch races', () => {
  let activeWorkspace: keyof typeof CONTEXTS;
  let rejectWorkspaceA!: (reason?: unknown) => void;

  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    activeWorkspace = 'a';

    vi.stubGlobal(
      'fetch',
      vi.fn(
        (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const url = String(input);
          if (url.includes('/api/workspace/directory')) {
            return Promise.resolve(
              jsonResponse(workspaceDirectoryFixture([CONTEXTS[activeWorkspace]])),
            );
          }
          if (url.includes('/api/workspace/context')) {
            return Promise.resolve(
              jsonResponse({ context: CONTEXTS[activeWorkspace] }),
            );
          }
          if (url.includes('/api/workspace/projects/team')) {
            const workspaceId = new Headers(init?.headers).get(
              'x-od-workspace-id',
            );
            if (workspaceId === CONTEXTS.a.workspaceId) {
              return new Promise<Response>((_resolve, reject) => {
                rejectWorkspaceA = reject;
              });
            }
            if (workspaceId === CONTEXTS.b.workspaceId) {
              return Promise.resolve(jsonResponse({ projects: [B_PROJECT] }));
            }
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
  });

  it('keeps workspace B data when workspace A rejects after B has succeeded', async () => {
    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(rejectWorkspaceA).toBeTypeOf('function');
    });

    activeWorkspace = 'b';
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });

    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.projects).toEqual([B_PROJECT]);
    });

    await act(async () => {
      rejectWorkspaceA(new Error('workspace A request failed late'));
      await Promise.resolve();
    });

    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.projects).toEqual([B_PROJECT]);
  });

  it('masks workspace A catalog while the workspace B identity read is pending', async () => {
    let holdWorkspaceContext = false;
    let resolveWorkspaceContext!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const url = String(input);
          if (url.includes('/api/workspace/directory')) {
            return Promise.resolve(
              jsonResponse(workspaceDirectoryFixture([CONTEXTS[activeWorkspace]])),
            );
          }
          if (url.includes('/api/workspace/context')) {
            if (!holdWorkspaceContext) {
              return Promise.resolve(
                jsonResponse({ context: CONTEXTS[activeWorkspace] }),
              );
            }
            return new Promise<Response>((resolve) => {
              resolveWorkspaceContext = resolve;
            });
          }
          if (url.includes('/api/workspace/projects/team')) {
            const workspaceId = new Headers(init?.headers).get(
              'x-od-workspace-id',
            );
            if (workspaceId === CONTEXTS.a.workspaceId) {
              return Promise.resolve(jsonResponse({ projects: [A_PROJECT] }));
            }
            if (workspaceId === CONTEXTS.b.workspaceId) {
              return Promise.resolve(jsonResponse({ projects: [B_PROJECT] }));
            }
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        },
      ),
    );

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([A_PROJECT]);
      expect(hook.result.current.loading).toBe(false);
    });
    expect(lastResolvedTeamProjects()).toEqual([A_PROJECT]);

    activeWorkspace = 'b';
    holdWorkspaceContext = true;
    act(() => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(resolveWorkspaceContext).toBeTypeOf('function');
    });

    expect(hook.result.current.projects).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    expect(lastResolvedTeamProjects()).toBeNull();

    await act(async () => {
      holdWorkspaceContext = false;
      resolveWorkspaceContext(jsonResponse({ context: CONTEXTS.b }));
    });
    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([B_PROJECT]);
      expect(hook.result.current.loading).toBe(false);
    });
    expect(lastResolvedTeamProjects()).toEqual([B_PROJECT]);
    expect(lastResolvedTeamProjects(CONTEXTS.a)).toEqual([A_PROJECT]);
    expect(lastResolvedTeamProjects(CONTEXTS.b)).toEqual([B_PROJECT]);

    // The shell is currently on B, but a still-mounted A project view must
    // consult A's catalog. B contains `project-b`; A does not. Borrowing the
    // ambient B cache would therefore fail closed and make this A-local project
    // read-only while another tab/navigation has B active.
    const projectInA = renderHook(() =>
      useProjectCollab(B_PROJECT.projectId, {
        workspaceContext: CONTEXTS.a,
        workspaceContextLoading: false,
      }),
    );
    await waitFor(() => {
      expect(projectInA.result.current.viewerOnly).toBe(false);
    });
  });

  it('settles an identity without a workspace to an empty catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(jsonResponse(workspaceDirectoryFixture([])));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(jsonResponse({ context: null }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });
    expect(hook.result.current.projects).toEqual([]);
    expect(lastResolvedTeamProjects()).toBeNull();
  });
});
