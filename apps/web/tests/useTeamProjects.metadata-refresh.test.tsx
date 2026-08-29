// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  readProjectDisplaySnapshot,
  resetProjectDisplaySnapshots,
  writeProjectDisplaySnapshot,
  projectDisplaySnapshotKey,
} from '../src/state/project-display-cache';
import {
  currentWorkspaceAccountGeneration,
  notifyTeamProjectsChanged,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  TEAM_PROJECTS_CHANGED_EVENT,
  useTeamProjects,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-viewer',
});

const INITIAL_PROJECTS = [
  {
    projectId: 'project-renamed',
    ownerMemberId: 'member-owner',
    name: 'Before rename',
  },
  {
    projectId: 'project-unrelated',
    ownerMemberId: 'member-other',
    name: 'Unrelated current name',
  },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useTeamProjects targeted metadata refresh', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetProjectDisplaySnapshots();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetProjectDisplaySnapshots();
  });

  it('patches only the renamed row without blanking or rolling back an unrelated row', async () => {
    const metadataRefresh = deferred<Response>();
    let catalogReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXT])));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXT }));
      }
      if (url.includes('/api/workspace/projects/team')) {
        catalogReads += 1;
        if (catalogReads === 1) {
          return Promise.resolve(jsonResponse({ projects: INITIAL_PROJECTS }));
        }
        return metadataRefresh.promise;
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));

    const hook = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.projects).toEqual(INITIAL_PROJECTS);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(TEAM_PROJECTS_CHANGED_EVENT, {
        detail: {
          type: 'team-projects-changed',
          projectId: 'project-renamed',
          kind: 'metadata',
        },
      }));
    });

    await waitFor(() => expect(catalogReads).toBe(2));
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.projects).toEqual(INITIAL_PROJECTS);

    metadataRefresh.resolve(jsonResponse({
      projects: [
        {
          projectId: 'project-renamed',
          ownerMemberId: 'member-owner',
          name: 'After rename',
        },
        // A broad catalog response can be older for an unrelated row. The
        // targeted metadata signal only authorizes replacing its projectId.
        {
          projectId: 'project-unrelated',
          ownerMemberId: 'member-other',
          name: 'Unrelated stale name',
        },
      ],
    }));

    await waitFor(() => {
      expect(hook.result.current.projects).toEqual([
        {
          projectId: 'project-renamed',
          ownerMemberId: 'member-owner',
          name: 'After rename',
        },
        INITIAL_PROJECTS[1],
      ]);
    });
    expect(hook.result.current.loading).toBe(false);
  });

  it('discards an older same-project metadata response after a newer event updates the row and snapshots', async () => {
    const olderMetadataRefresh = deferred<Response>();
    const newerMetadataRefresh = deferred<Response>();
    let catalogReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXT])));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXT }));
      }
      if (url.includes('/api/workspace/projects/team')) {
        catalogReads += 1;
        if (catalogReads === 1) {
          return Promise.resolve(jsonResponse({ projects: INITIAL_PROJECTS }));
        }
        return catalogReads === 2
          ? olderMetadataRefresh.promise
          : newerMetadataRefresh.promise;
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));

    const hooks = [
      renderHook(() => useTeamProjects()),
      renderHook(() => useTeamProjects()),
    ];
    await waitFor(() => {
      for (const hook of hooks) {
        expect(hook.result.current.loading).toBe(false);
        expect(hook.result.current.projects).toEqual(INITIAL_PROJECTS);
      }
    });
    const displayScope = {
      accountGeneration: currentWorkspaceAccountGeneration(),
      context: CONTEXT,
      view: 'recent' as const,
    };
    writeProjectDisplaySnapshot(displayScope, [{
      id: 'project-renamed',
      name: 'Before rename',
      skillId: null,
      designSystemId: null,
      workspaceId: CONTEXT.workspaceId,
      createdAt: 1,
      updatedAt: 1,
    }]);

    act(() => {
      window.dispatchEvent(new CustomEvent(TEAM_PROJECTS_CHANGED_EVENT, {
        detail: {
          type: 'team-projects-changed',
          projectId: 'project-renamed',
          kind: 'metadata',
        },
      }));
      window.dispatchEvent(new CustomEvent(TEAM_PROJECTS_CHANGED_EVENT, {
        detail: {
          type: 'team-projects-changed',
          projectId: 'project-renamed',
          kind: 'metadata',
        },
      }));
    });

    await waitFor(() => expect(catalogReads).toBe(3));
    newerMetadataRefresh.resolve(jsonResponse({
      projects: [{
        projectId: 'project-renamed',
        ownerMemberId: 'member-owner',
        name: 'Newest rename',
        updatedAt: 3,
      }, INITIAL_PROJECTS[1]],
    }));
    await waitFor(() => {
      for (const hook of hooks) {
        expect(hook.result.current.projects[0]?.name).toBe('Newest rename');
      }
      expect(
        readProjectDisplaySnapshot(projectDisplaySnapshotKey(displayScope))?.projects[0]?.name,
      ).toBe('Newest rename');
    });

    olderMetadataRefresh.resolve(jsonResponse({
      projects: [{
        projectId: 'project-renamed',
        ownerMemberId: 'member-owner',
        name: 'Older rename',
        updatedAt: 2,
      }, INITIAL_PROJECTS[1]],
    }));
    await act(async () => {
      await olderMetadataRefresh.promise;
      await Promise.resolve();
    });

    for (const hook of hooks) {
      expect(hook.result.current.projects[0]?.name).toBe('Newest rename');
      expect(hook.result.current.loading).toBe(false);
    }
    expect(
      readProjectDisplaySnapshot(projectDisplaySnapshotKey(displayScope))?.projects[0]?.name,
    ).toBe('Newest rename');
  });

  it('keeps adjacent broad catalog events distinct while sharing each event across consumers', async () => {
    const olderCatalogRefresh = deferred<Response>();
    const newerCatalogRefresh = deferred<Response>();
    let catalogReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(jsonResponse(workspaceDirectoryFixture([CONTEXT])));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXT }));
      }
      if (url.includes('/api/workspace/projects/team')) {
        catalogReads += 1;
        if (catalogReads === 1) {
          return Promise.resolve(jsonResponse({ projects: INITIAL_PROJECTS }));
        }
        return catalogReads === 2
          ? olderCatalogRefresh.promise
          : newerCatalogRefresh.promise;
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));

    const hooks = [
      renderHook(() => useTeamProjects()),
      renderHook(() => useTeamProjects()),
    ];
    await waitFor(() => {
      for (const hook of hooks) {
        expect(hook.result.current.loading).toBe(false);
        expect(hook.result.current.projects).toEqual(INITIAL_PROJECTS);
      }
    });
    expect(catalogReads).toBe(1);

    const displayScope = {
      accountGeneration: currentWorkspaceAccountGeneration(),
      context: CONTEXT,
      view: 'team' as const,
    };
    writeProjectDisplaySnapshot(displayScope, [{
      id: 'project-renamed',
      name: 'Before rename',
      skillId: null,
      designSystemId: null,
      workspaceId: CONTEXT.workspaceId,
      createdAt: 1,
      updatedAt: 1,
    }]);

    act(() => notifyTeamProjectsChanged());
    await waitFor(() => expect(catalogReads).toBe(2));

    // This is a distinct catalog change, not another consumer reacting to E1.
    // It must start req3 even though it arrives inside forceCoalescedGet's
    // 250ms burst window; both mounted consumers must still share that req3.
    act(() => notifyTeamProjectsChanged());
    await waitFor(() => expect(catalogReads).toBe(3));

    newerCatalogRefresh.resolve(jsonResponse({
      projects: [{
        projectId: 'project-renamed',
        ownerMemberId: 'member-owner',
        name: 'Newest catalog name',
        updatedAt: 3,
      }, INITIAL_PROJECTS[1]],
    }));
    await waitFor(() => {
      for (const hook of hooks) {
        expect(hook.result.current.projects[0]?.name).toBe('Newest catalog name');
      }
      expect(
        readProjectDisplaySnapshot(projectDisplaySnapshotKey(displayScope))?.projects[0]?.name,
      ).toBe('Newest catalog name');
    });

    olderCatalogRefresh.resolve(jsonResponse({
      projects: [{
        projectId: 'project-renamed',
        ownerMemberId: 'member-owner',
        name: 'Older catalog name',
        updatedAt: 2,
      }, INITIAL_PROJECTS[1]],
    }));
    await act(async () => {
      await olderCatalogRefresh.promise;
      await Promise.resolve();
    });

    expect(catalogReads).toBe(3);
    for (const hook of hooks) {
      expect(hook.result.current.projects[0]?.name).toBe('Newest catalog name');
      expect(hook.result.current.loading).toBe(false);
    }
    expect(
      readProjectDisplaySnapshot(projectDisplaySnapshotKey(displayScope))?.projects[0]?.name,
    ).toBe('Newest catalog name');
  });
});
