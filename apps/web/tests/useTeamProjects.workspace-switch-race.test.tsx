// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  lastResolvedTeamProjects,
  notifyTeamProjectsChanged,
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
} from '../src/collab/useWorkspaceContext';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function selectWorkspaceForSession(
  context: Pick<typeof CONTEXTS.a, 'workspaceId' | 'workspaceMemberId'>,
): void {
  window.sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({
    workspaceId: context.workspaceId,
    workspaceMemberId: context.workspaceMemberId,
  }));
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

  it('remounts from the exact cached catalog without a loader and keeps it when refresh fails', async () => {
    let catalogReads = 0;
    let rejectRefresh!: (reason?: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(jsonResponse({ context: CONTEXTS.a }));
        }
        if (url.includes('/api/workspace/projects/team')) {
          catalogReads += 1;
          if (catalogReads === 1) {
            return Promise.resolve(jsonResponse({ projects: [A_PROJECT] }));
          }
          return new Promise<Response>((_resolve, reject) => {
            rejectRefresh = reject;
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);

    const first = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(first.result.current.projects).toEqual([A_PROJECT]);
    });
    first.unmount();
    resetCoalescedGet();

    const second = renderHook(() => useTeamProjects());
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.projects).toEqual([A_PROJECT]);
    await waitFor(() => expect(rejectRefresh).toBeTypeOf('function'));

    await act(async () => {
      rejectRefresh(new Error('background refresh unavailable'));
      await Promise.resolve();
    });
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.projects).toEqual([A_PROJECT]);
  });

  it('keeps exact last-good rows across a typed catalog outage and converges after recovery', async () => {
    let catalogReads = 0;
    const RECOVERED_PROJECT = { ...A_PROJECT, name: 'Recovered catalog project' };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(jsonResponse({ context: CONTEXTS.a }));
        }
        if (url.includes('/api/workspace/projects/team')) {
          catalogReads += 1;
          if (catalogReads === 1) {
            return Promise.resolve(jsonResponse({ projects: [A_PROJECT] }));
          }
          if (catalogReads === 2) {
            return Promise.resolve(jsonResponse({
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: 'team project catalog is temporarily unavailable',
                retryable: true,
              },
            }, 503));
          }
          return Promise.resolve(jsonResponse({ projects: [RECOVERED_PROJECT] }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.projects).toEqual([A_PROJECT]);
    });

    act(() => notifyTeamProjectsChanged());
    await waitFor(() => expect(catalogReads).toBe(2));
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.projects).toEqual([A_PROJECT]);
    expect(lastResolvedTeamProjects(CONTEXTS.a)).toEqual([A_PROJECT]);

    act(() => notifyTeamProjectsChanged());
    await waitFor(() => {
      expect(catalogReads).toBe(3);
      expect(hook.result.current.projects).toEqual([RECOVERED_PROJECT]);
    });
    expect(hook.result.current.loading).toBe(false);
    expect(lastResolvedTeamProjects(CONTEXTS.a)).toEqual([RECOVERED_PROJECT]);
  });

  it('does not reuse an exact-looking catalog across an account boundary', async () => {
    let catalogReads = 0;
    let resolveNewAccountCatalog!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(jsonResponse({ context: CONTEXTS.a }));
        }
        if (url.includes('/api/workspace/projects/team')) {
          catalogReads += 1;
          if (catalogReads === 1) {
            return Promise.resolve(jsonResponse({ projects: [A_PROJECT] }));
          }
          return new Promise<Response>((resolve) => {
            resolveNewAccountCatalog = resolve;
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => expect(hook.result.current.projects).toEqual([A_PROJECT]));

    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(catalogReads).toBe(2));
    expect(hook.result.current.projects).toEqual([]);
    expect(hook.result.current.loading).toBe(true);

    const NEW_ACCOUNT_PROJECT = { ...A_PROJECT, projectId: 'new-account-project' };
    await act(async () => {
      resolveNewAccountCatalog(jsonResponse({ projects: [NEW_ACCOUNT_PROJECT] }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([NEW_ACCOUNT_PROJECT]);
      expect(hook.result.current.loading).toBe(false);
    });
  });

  it('retains exact catalogs across a seeded workspace switch in the same account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(jsonResponse(workspaceDirectoryFixture([
            CONTEXTS.a,
            CONTEXTS.b,
          ])));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(jsonResponse({ context: CONTEXTS[activeWorkspace] }));
        }
        if (url.includes('/api/workspace/projects/team')) {
          const workspaceId = new Headers(init?.headers).get('x-od-workspace-id');
          return Promise.resolve(jsonResponse({
            projects: workspaceId === CONTEXTS.a.workspaceId ? [A_PROJECT] : [B_PROJECT],
          }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);
    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => expect(hook.result.current.projects).toEqual([A_PROJECT]));

    activeWorkspace = 'b';
    act(() => notifyWorkspaceContextRefresh({ context: CONTEXTS.b }));
    await waitFor(() => expect(hook.result.current.projects).toEqual([B_PROJECT]));

    expect(lastResolvedTeamProjects(CONTEXTS.a)).toEqual([A_PROJECT]);
    expect(lastResolvedTeamProjects(CONTEXTS.b)).toEqual([B_PROJECT]);
  });

  it('starts the team catalog as soon as the directory establishes its read identity', async () => {
    let resolveDirectory!: (response: Response) => void;
    const directoryResponse = new Promise<Response>((resolve) => {
      resolveDirectory = resolve;
    });
    let resolveWorkspaceContext!: (response: Response) => void;
    const workspaceContextResponse = new Promise<Response>((resolve) => {
      resolveWorkspaceContext = resolve;
    });
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        requested.push(url);
        if (url.includes('/api/workspace/directory')) {
          return directoryResponse;
        }
        if (url.includes('/api/workspace/context')) {
          return workspaceContextResponse;
        }
        if (url.includes('/api/workspace/projects/team')) {
          return Promise.resolve(jsonResponse({ projects: [A_PROJECT] }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    selectWorkspaceForSession(CONTEXTS.a);

    const hook = renderHook(() => useTeamProjects());

    await waitFor(() => {
      expect(requested).toEqual(['/api/workspace/directory']);
    });

    await act(async () => {
      resolveDirectory(jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])));
      await directoryResponse;
    });

    await waitFor(() => {
      expect(requested).toContain('/api/workspace/context');
      expect(requested).toContain('/api/workspace/projects/team');
    });
    expect(hook.result.current.projects).toEqual([A_PROJECT]);
    expect(hook.result.current.loading).toBe(false);

    await act(async () => {
      resolveWorkspaceContext(jsonResponse({ context: CONTEXTS.a }));
      await workspaceContextResponse;
    });
  });

  it('discards an older session generation for the same workspace identity', async () => {
    const catalogReads: Array<{
      resolve: (response: Response) => void;
      promise: Promise<Response>;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(
            jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])),
          );
        }
        if (url.includes('/api/workspace/context')) {
          return new Promise<Response>(() => {});
        }
        if (url.includes('/api/workspace/projects/team')) {
          let resolve!: (response: Response) => void;
          const promise = new Promise<Response>((next) => {
            resolve = next;
          });
          catalogReads.push({ resolve, promise });
          return promise;
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => expect(catalogReads).toHaveLength(1));

    act(() => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => expect(catalogReads).toHaveLength(2));

    const currentProject = { ...A_PROJECT, name: 'Current session project' };
    await act(async () => {
      catalogReads[1]!.resolve(jsonResponse({ projects: [currentProject] }));
      await catalogReads[1]!.promise;
    });
    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([currentProject]);
      expect(hook.result.current.loading).toBe(false);
    });

    await act(async () => {
      catalogReads[0]!.resolve(jsonResponse({ projects: [A_PROJECT] }));
      await catalogReads[0]!.promise;
    });
    expect(hook.result.current.projects).toEqual([currentProject]);
  });

  it('does not start a provisional catalog when the selected directory row is missing', async () => {
    let resolveWorkspaceContext!: (response: Response) => void;
    const workspaceContextResponse = new Promise<Response>((resolve) => {
      resolveWorkspaceContext = resolve;
    });
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        requested.push(url);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(
            jsonResponse(workspaceDirectoryFixture([CONTEXTS.b])),
          );
        }
        if (url.includes('/api/workspace/context')) {
          return workspaceContextResponse;
        }
        if (url.includes('/api/workspace/projects/team')) {
          return Promise.resolve(jsonResponse({ projects: [B_PROJECT] }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    selectWorkspaceForSession(CONTEXTS.a);

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(requested).toContain('/api/workspace/context');
    });
    expect(requested).not.toContain('/api/workspace/projects/team');

    await act(async () => {
      resolveWorkspaceContext(jsonResponse({ context: CONTEXTS.b }));
      await workspaceContextResponse;
    });
    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([B_PROJECT]);
      expect(hook.result.current.loading).toBe(false);
    });
  });

  it.each(['request failure', 'identity mismatch'] as const)(
    'clears provisional catalog authority after full context %s',
    async (outcome) => {
      let resolveWorkspaceContext!: (response: Response) => void;
      let rejectWorkspaceContext!: (reason?: unknown) => void;
      const workspaceContextResponse = new Promise<Response>((resolve, reject) => {
        resolveWorkspaceContext = resolve;
        rejectWorkspaceContext = reject;
      });
      let resolveCatalog!: (response: Response) => void;
      const catalogResponse = new Promise<Response>((resolve) => {
        resolveCatalog = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL): Promise<Response> => {
          const url = String(input);
          if (url.includes('/api/workspace/directory')) {
            return Promise.resolve(
              jsonResponse(workspaceDirectoryFixture([CONTEXTS.a])),
            );
          }
          if (url.includes('/api/workspace/context')) {
            return workspaceContextResponse;
          }
          if (url.includes('/api/workspace/projects/team')) {
            return catalogResponse;
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );
      selectWorkspaceForSession(CONTEXTS.a);

      const hook = renderHook(() => useTeamProjects());
      await waitFor(() => {
        expect(resolveCatalog).toBeTypeOf('function');
      });

      await act(async () => {
        if (outcome === 'request failure') {
          rejectWorkspaceContext(new Error('context unavailable'));
        } else {
          resolveWorkspaceContext(jsonResponse({ context: CONTEXTS.b }));
        }
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(hook.result.current.projects).toEqual([]);
        expect(hook.result.current.loading).toBe(false);
      });

      await act(async () => {
        resolveCatalog(jsonResponse({ projects: [A_PROJECT] }));
        await catalogResponse;
      });
      expect(hook.result.current.projects).toEqual([]);
      expect(lastResolvedTeamProjects(CONTEXTS.a)).toBeNull();
    },
  );

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
    // An unseeded refresh is an account boundary. Even if the next account has
    // an identically-shaped Workspace, the previous account's display catalog
    // is no longer a legal last-good snapshot.
    expect(lastResolvedTeamProjects(CONTEXTS.a)).toBeNull();
    expect(lastResolvedTeamProjects(CONTEXTS.b)).toEqual([B_PROJECT]);
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
