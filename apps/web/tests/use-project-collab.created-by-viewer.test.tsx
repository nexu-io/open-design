// @vitest-environment jsdom
//
// recvpZzWYQrhZQ: a freshly created project flashed the "共享项目不能编辑"
// read-only banner for ~3s before flipping to editable. Issue #99's
// `knownOwnedByViewer` fix (see use-project-collab.context-seed.test.tsx) only
// relaxes the single-writer gate once the hub catalog already lists the
// project. A project the viewer just created is never in that catalog yet —
// it was only just created, not shared — so `knownUnshared` stayed false and
// the project-level gate kept failing closed until the catalog and/or
// `/collab/status` happened to answer. `markProjectCreatedByViewer` gives the
// hook a same-session signal it can trust immediately, independent of either
// network read.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  markProjectCreatedByViewer,
  resetProjectsCreatedByViewerCache,
  resolveProjectWriterAuthority,
  useProjectCollab,
} from '../src/collab/useProjectCollab';
import {
  createProject,
  duplicatePluginAsProject,
  duplicateProject,
} from '../src/state/projects';
import {
  projectWorkspaceContext,
  projectWorkspaceScopeReady,
  useProjectWorkspaceScope,
} from '../src/collab/useProjectWorkspaceScope';
import {
  lastResolvedTeamProjects,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';

function teamContext(
  overrides: {
    workspaceId?: string;
    workspaceMemberId?: string;
  } = {},
): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: overrides.workspaceId ?? 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: overrides.workspaceMemberId ?? 'wm-1',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    displayName: 'Ma Shu',
  };
}

const DEFAULT_TEAM_CONTEXT = teamContext();

const PERSONAL_CONTEXT: WorkspaceCollabContext = {
  ...teamContext({
    workspaceId: 'ws-personal',
    workspaceMemberId: 'wm-personal',
  }),
  workspaceType: 'personal',
  role: 'owner',
  permissions: buildWorkspacePermissions({
    role: 'owner',
    lifecycleState: 'active',
  }),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

/** Resolves the workspace context only; the team catalog and collab status
 *  both hang forever — modeling the residual window where a brand-new
 *  project's own project view mounts before the (separate, shell-owned)
 *  catalog request has come back. */
function installContextOnlyResolvingFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/directory')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [teamContext()] }),
      } as unknown as Response;
    }
    if (pathname.endsWith('/workspace/context')) {
      return { ok: true, status: 200, json: async () => ({ context: teamContext() }) } as unknown as Response;
    }
    return new Promise<Response>(() => {
      /* team catalog + collab status never resolve */
    });
  }) as typeof fetch;
}

/** Seeds the module-level workspace-context cache without ever warming the
 *  team-catalog cache, so `lastResolvedTeamProjects()` stays null. */
async function warmContextOnly() {
  installContextOnlyResolvingFetch();
  const ctx = renderHook(() => useWorkspaceContext());
  await waitFor(() => expect(ctx.result.current.loading).toBe(false));
  ctx.unmount();
}

function installFullyHangingFetch() {
  globalThis.fetch = vi.fn(async () => new Promise<Response>(() => {})) as typeof fetch;
}

function installOtherOwnerStatusFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/presence/heartbeat')) {
      return Response.json({ present: [{ memberId: DEFAULT_TEAM_CONTEXT.workspaceMemberId }] });
    }
    if (pathname.endsWith('/collab/status')) {
      return Response.json({
        publishedVersion: 1,
        syncState: 'synced',
        ownerMemberId: 'wm-other-owner',
      });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
}

function installProjectCreationFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname === '/api/projects') {
      return Response.json({
        project: { id: 'p-home-create' },
        conversationId: 'conv-home-create',
      });
    }
    if (pathname.endsWith('/duplicate')) {
      return Response.json({
        project: { id: 'p-duplicate' },
        conversationId: 'conv-duplicate',
        copiedFiles: [],
      });
    }
    if (pathname.endsWith('/duplicate-project')) {
      return Response.json({
        ok: true,
        projectId: 'p-plugin-duplicate',
        conversationId: 'conv-plugin-duplicate',
        relPath: 'index.html',
        project: { id: 'p-plugin-duplicate' },
        sourcePluginId: 'plugin-a',
        sourceEntry: 'index.html',
        copiedFiles: 1,
        skippedFiles: 0,
        warnings: [],
      });
    }
    return new Promise<Response>(() => {
      /* collab status and presence remain unresolved */
    });
  }) as typeof fetch;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  resetProjectsCreatedByViewerCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  resetProjectsCreatedByViewerCache();
  vi.restoreAllMocks();
});

describe('useProjectCollab: project created by the viewer this session', () => {
  it('lets explicit shared non-owner status override provisional ownership evidence', () => {
    expect(resolveProjectWriterAuthority({
      workspaceReadOnly: false,
      workspaceContextReadOnly: false,
      lostAccessAfterUnshare: false,
      shared: true,
      isOwner: false,
      knownOwnedByViewer: true,
      createdByViewerThisSession: true,
      syncState: 'synced',
    })).toBe('denied');
  });

  it('still fails closed for an unmarked project while the team catalog has not loaded yet', async () => {
    // Sanity check the scenario: the catalog genuinely never warmed.
    await warmContextOnly();
    expect(lastResolvedTeamProjects(DEFAULT_TEAM_CONTEXT)).toBeNull();

    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-unmarked', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    }));

    expect(project.result.current.viewerOnly).toBe(true);
    expect(project.result.current.writerAuthority).toBe('pending');
  });

  it('does not fail closed for a project the viewer created this session, even before the team catalog loads', async () => {
    await warmContextOnly();
    expect(lastResolvedTeamProjects(DEFAULT_TEAM_CONTEXT)).toBeNull();

    installFullyHangingFetch();
    markProjectCreatedByViewer('p-new', DEFAULT_TEAM_CONTEXT);
    const project = renderHook(() => useProjectCollab('p-new', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    }));

    await waitFor(() => {
      expect(project.result.current.viewerOnly).toBe(false);
      expect(project.result.current.writerAuthority).toBe('allowed');
    });
  });

  it('lets explicit other-owner status revoke a stale same-session writer marker', async () => {
    markProjectCreatedByViewer('p-reassigned', DEFAULT_TEAM_CONTEXT);
    installOtherOwnerStatusFetch();

    const project = renderHook(() => useProjectCollab('p-reassigned', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    }));

    await waitFor(() => expect(project.result.current.syncState).toBe('synced'));
    expect(project.result.current.isOwner).toBe(false);
    expect(project.result.current.viewerOnly).toBe(true);
    expect(project.result.current.writerAuthority).toBe('denied');
  });

  it('keeps a Home-created project writable while its exact project scope is still loading', async () => {
    installProjectCreationFetch();
    await createProject({
      name: 'Home project',
      skillId: null,
      designSystemId: null,
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    });

    const project = renderHook(() => useProjectCollab('p-home-create', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
      workspaceContextLoading: true,
    }));

    expect(project.result.current.viewerOnly).toBe(false);
  });

  it('keeps a duplicated project writable while its exact project scope is still loading', async () => {
    installProjectCreationFetch();
    await duplicateProject('p-source', {}, DEFAULT_TEAM_CONTEXT);

    const project = renderHook(() => useProjectCollab('p-duplicate', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
      workspaceContextLoading: true,
    }));

    expect(project.result.current.viewerOnly).toBe(false);
  });

  it('keeps a template Remix writable while its exact project scope is still loading', async () => {
    installProjectCreationFetch();
    await duplicatePluginAsProject('plugin-a', {}, DEFAULT_TEAM_CONTEXT);

    const project = renderHook(() => useProjectCollab('p-plugin-duplicate', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
      workspaceContextLoading: true,
    }));

    expect(project.result.current.viewerOnly).toBe(false);
  });

  it('keeps an unmarked project fail-closed while exact project scope is loading', async () => {
    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-not-created-here', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
      workspaceContextLoading: true,
    }));

    expect(project.result.current.viewerOnly).toBe(true);
  });

  it('scopes the signal to the exact project id — an unrelated project still fails closed', async () => {
    await warmContextOnly();

    installFullyHangingFetch();
    markProjectCreatedByViewer('p-new', DEFAULT_TEAM_CONTEXT);
    const project = renderHook(() => useProjectCollab('p-someone-elses', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    }));

    expect(project.result.current.viewerOnly).toBe(true);
  });

  it('clears between tests via the reset seam', async () => {
    markProjectCreatedByViewer('p-leftover', DEFAULT_TEAM_CONTEXT);
    resetProjectsCreatedByViewerCache();

    await warmContextOnly();
    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-leftover', {
      workspaceContext: DEFAULT_TEAM_CONTEXT,
    }));

    expect(project.result.current.viewerOnly).toBe(true);
  });

  it('does not carry a same-id creation signal from workspace A into workspace B', async () => {
    const workspaceA = teamContext({ workspaceId: 'ws-a', workspaceMemberId: 'wm-a' });
    const workspaceB = teamContext({ workspaceId: 'ws-b', workspaceMemberId: 'wm-b' });
    markProjectCreatedByViewer('p-same-id', workspaceA);

    const hangingFetch = (async () => new Promise<Response>(() => {})) as typeof fetch;
    const project = renderHook(
      ({ workspaceContext }) => useProjectCollab('p-same-id', {
        workspaceContext,
        fetch: hangingFetch,
      }),
      { initialProps: { workspaceContext: workspaceA } },
    );
    expect(project.result.current.viewerOnly).toBe(false);

    project.rerender({ workspaceContext: workspaceB });
    await waitFor(() => {
      expect(project.result.current.viewerOnly).toBe(true);
    });
  });

  it('keeps a created project read-only once daemon status confirms another owner', async () => {
    const workspace = teamContext({ workspaceId: 'ws-b', workspaceMemberId: 'wm-viewer' });
    markProjectCreatedByViewer('p-now-shared', workspace);

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/presence/heartbeat')) {
        payload = { present: [{ memberId: 'wm-viewer' }] };
      } else if (pathname.endsWith('/collab/status')) {
        payload = {
          publishedVersion: 2,
          materializedVersion: 2,
          syncState: 'synced',
          ownerMemberId: 'wm-someone-else',
        };
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;
    const project = renderHook(() => useProjectCollab('p-now-shared', {
      workspaceContext: workspace,
      fetch: fetchImpl,
    }));

    await waitFor(() => {
      expect(project.result.current.syncState).toBe('synced');
    });
    expect(project.result.current.viewerOnly).toBe(true);
  });

  it('recovers a reloaded Personal project from delayed scope and status reads without a creation marker', async () => {
    const scopeResponse = deferred<Response>();
    const statusResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace-scope')) return scopeResponse.promise;
      if (pathname.endsWith('/collab/status')) return statusResponse.promise;
      if (pathname.endsWith('/presence/heartbeat')) {
        return Promise.resolve(Response.json({
          present: [{ memberId: PERSONAL_CONTEXT.workspaceMemberId }],
        }));
      }
      return Promise.resolve(Response.json({ ok: true }));
    });
    globalThis.fetch = fetchMock as typeof fetch;

    // resetProjectsCreatedByViewerCache() in beforeEach models a hard reload:
    // the browser's same-session creation witness no longer exists. The
    // persisted project binding and fresh daemon answers must be sufficient.
    const project = renderHook(() => {
      const scope = useProjectWorkspaceScope(
        'p-reloaded-personal',
        PERSONAL_CONTEXT,
        PERSONAL_CONTEXT.workspaceId,
      );
      const collab = useProjectCollab('p-reloaded-personal', {
        workspaceContext: projectWorkspaceContext(scope.scope),
        workspaceContextLoading: scope.loading,
      });
      return {
        scope,
        collab,
        previewAuthorized: projectWorkspaceScopeReady(scope.scope),
      };
    });

    expect(project.result.current.previewAuthorized).toBe(false);
    expect(project.result.current.collab.viewerOnly).toBe(true);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/workspace-scope'),
        expect.any(Object),
      );
    });

    await act(async () => {
      scopeResponse.resolve(Response.json({
        scope: {
          kind: 'personal',
          projectId: 'p-reloaded-personal',
          workspaceId: PERSONAL_CONTEXT.workspaceId,
          visibility: 'personal',
          context: PERSONAL_CONTEXT,
        },
      }));
    });
    await waitFor(() => {
      expect(project.result.current.previewAuthorized).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/collab/status'),
        expect.any(Object),
      );
    });

    await act(async () => {
      statusResponse.resolve(Response.json({
        publishedVersion: null,
        materializedVersion: null,
        syncState: 'local_only',
        ownerMemberId: null,
      }));
    });
    await waitFor(() => {
      expect(project.result.current.collab.viewerOnly).toBe(false);
      expect(project.result.current.collab.writerAuthority).toBe('allowed');
    });
  });
});
