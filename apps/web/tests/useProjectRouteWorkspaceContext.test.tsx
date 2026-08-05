// @vitest-environment jsdom

import { useEffect } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  projectResourceReadsCanStart,
  useProjectRouteWorkspaceContext,
} from '../src/collab/useProjectRouteWorkspaceContext';
import {
  currentWorkspaceAccountGeneration,
  notifyWorkspaceContextRefresh,
  resetWorkspaceContextCache,
  type WorkspaceContextState,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from '../src/collab/workspace-identity';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const PROJECT_ID = 'project-deep-link';
const PROJECT_ENDPOINTS = [
  `/api/projects/${PROJECT_ID}/folders`,
  `/api/projects/${PROJECT_ID}/collab/status`,
  `/api/projects/${PROJECT_ID}/workspace-scope`,
  `/api/projects/${PROJECT_ID}`,
  `/api/projects/${PROJECT_ID}/files`,
  `/api/projects/${PROJECT_ID}/conversations`,
  `/api/projects/${PROJECT_ID}/tabs`,
  `/api/projects/${PROJECT_ID}/live-artifacts`,
] as const;

const WORKSPACE_A = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
  role: 'owner',
  workspaceName: 'Workspace A',
});
const WORKSPACE_B = workspaceContextFixture({
  workspaceId: 'workspace-b',
  workspaceMemberId: 'member-b',
  role: 'member',
  workspaceName: 'Workspace B',
});

interface RequestRecord {
  url: string;
  headers: Headers;
}

function ProjectResourceFanout(props: {
  persistedWorkspaceId?: string;
  ambientState: WorkspaceContextState;
}) {
  const resolved = useProjectRouteWorkspaceContext(
    props.persistedWorkspaceId,
    props.ambientState,
  );
  const authorityKey = workspaceIdentityCacheKey(resolved.context);
  const canStart = projectResourceReadsCanStart(
    props.persistedWorkspaceId,
    resolved,
  );

  useEffect(() => {
    if (!canStart) return;
    const headers = resolved.context
      ? workspaceProjectHeaders(resolved.context)
      : undefined;
    for (const endpoint of PROJECT_ENDPOINTS) {
      void fetch(endpoint, headers ? { headers } : undefined);
    }
  }, [authorityKey, canStart, resolved.context]);

  return <output data-testid="scope">{canStart ? authorityKey : 'waiting'}</output>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetWorkspaceContextCache();
});

describe('fresh project route Workspace gate', () => {
  it('adopts a bootstrap witness without waiting for the ambient directory read', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(() => useProjectRouteWorkspaceContext(
      WORKSPACE_A.workspaceId,
      { context: null, loading: true },
      WORKSPACE_A,
    ));

    expect(hook.result.current).toMatchObject({
      context: WORKSPACE_A,
      loading: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('separates ambient Workspace selection from real account generations', () => {
    expect(currentWorkspaceAccountGeneration()).toBe(0);
    notifyWorkspaceContextRefresh({ context: WORKSPACE_B });
    expect(currentWorkspaceAccountGeneration()).toBe(0);
    notifyWorkspaceContextRefresh();
    expect(currentWorkspaceAccountGeneration()).toBe(1);
  });

  it('waits for persisted Workspace A and emits exactly one fully scoped resource wave even when ambient is B', async () => {
    let resolveDirectory!: (response: Response) => void;
    const directoryResponse = new Promise<Response>((resolve) => {
      resolveDirectory = resolve;
    });
    const requests: RequestRecord[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url === '/api/workspace/directory') return directoryResponse;
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <ProjectResourceFanout
        persistedWorkspaceId={WORKSPACE_A.workspaceId}
        ambientState={{ context: WORKSPACE_B, loading: false }}
      />,
    );

    expect(view.getByTestId('scope').textContent).toBe('waiting');
    expect(requests.map((request) => request.url)).toEqual(['/api/workspace/directory']);
    expect(
      requests.filter((request) => request.url.startsWith(`/api/projects/${PROJECT_ID}`)),
    ).toHaveLength(0);

    await act(async () => {
      resolveDirectory(new Response(JSON.stringify(workspaceDirectoryFixture([
        WORKSPACE_A,
        WORKSPACE_B,
      ])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      await directoryResponse;
    });

    await waitFor(() => {
      expect(view.getByTestId('scope').textContent).toBe(
        workspaceIdentityCacheKey(WORKSPACE_A),
      );
    });

    const projectRequests = requests.filter(
      (request) => request.url.startsWith(`/api/projects/${PROJECT_ID}`),
    );
    expect(projectRequests.map((request) => request.url)).toEqual(PROJECT_ENDPOINTS);
    for (const endpoint of PROJECT_ENDPOINTS) {
      expect(projectRequests.filter((request) => request.url === endpoint)).toHaveLength(1);
    }
    for (const request of projectRequests) {
      expect(request.headers.get('x-od-workspace-id')).toBe(WORKSPACE_A.workspaceId);
      expect(request.headers.get('x-od-workspace-member-id')).toBe(
        WORKSPACE_A.workspaceMemberId,
      );
      expect(request.headers.get('x-od-workspace-id')).not.toBe(
        WORKSPACE_B.workspaceId,
      );
    }
    expect(
      projectRequests.filter(
        (request) =>
          !request.headers.get('x-od-workspace-id')
          || !request.headers.get('x-od-workspace-member-id'),
      ),
    ).toHaveLength(0);
    expect(requests.filter((request) => request.url === '/api/workspace/directory')).toHaveLength(1);
  });

  it('keeps an anonymous unbound local project on the immediate headerless compatibility lane', async () => {
    const requests: RequestRecord[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <ProjectResourceFanout
        ambientState={{ context: null, loading: false }}
      />,
    );

    await waitFor(() => {
      expect(view.getByTestId('scope').textContent).toBe('none');
      expect(requests).toHaveLength(PROJECT_ENDPOINTS.length);
    });
    expect(requests.map((request) => request.url)).toEqual(PROJECT_ENDPOINTS);
    expect(requests.some((request) => request.url === '/api/workspace/directory')).toBe(false);
    for (const request of requests) {
      expect(request.headers.get('x-od-workspace-id')).toBeNull();
      expect(request.headers.get('x-od-workspace-member-id')).toBeNull();
    }
  });

  it('derives the complete read authority from directory role/lifecycle instead of ambient defaults', async () => {
    const lockedAdmin = workspaceContextFixture({
      workspaceId: 'workspace-locked',
      workspaceMemberId: 'member-admin',
      role: 'admin',
      lifecycleState: 'locked',
      workspaceName: 'Locked team',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(workspaceDirectoryFixture([lockedAdmin])),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )));

    let resolved: WorkspaceCollabContext | null = null;
    function Probe() {
      const state = useProjectRouteWorkspaceContext(
        lockedAdmin.workspaceId,
        { context: WORKSPACE_B, loading: false },
      );
      resolved = state.context;
      return null;
    }
    render(<Probe />);

    await waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({
      workspaceId: lockedAdmin.workspaceId,
      workspaceMemberId: lockedAdmin.workspaceMemberId,
      workspaceType: 'team',
      role: 'admin',
      lifecycleState: 'locked',
      permissions: {
        canShareProjects: false,
        canWriteSyncedFiles: false,
      },
    });
  });

  it('surfaces a terminal denial and recovers through an explicit fresh retry', async () => {
    let membershipAvailable = false;
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(workspaceDirectoryFixture(
        membershipAvailable ? [WORKSPACE_A] : [],
      )),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(() => useProjectRouteWorkspaceContext(
      WORKSPACE_A.workspaceId,
      { context: WORKSPACE_B, loading: false },
    ));

    await waitFor(() => {
      expect(hook.result.current).toMatchObject({
        context: null,
        loading: false,
        failure: 'forbidden',
      });
    });

    membershipAvailable = true;
    act(() => hook.result.current.retry());

    await waitFor(() => {
      expect(hook.result.current.context?.workspaceId).toBe(WORKSPACE_A.workspaceId);
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.failure).toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed across an account generation change and never reuses old member headers', async () => {
    const oldMembership = WORKSPACE_A;
    const newMembership = {
      ...WORKSPACE_A,
      workspaceMemberId: 'member-a-new-account',
    };
    let resolveFreshDirectory!: (response: Response) => void;
    const freshDirectory = new Promise<Response>((resolve) => {
      resolveFreshDirectory = resolve;
    });
    let directoryReads = 0;
    const requests: RequestRecord[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url === '/api/workspace/directory') {
        directoryReads += 1;
        if (directoryReads === 1) {
          return new Response(JSON.stringify(workspaceDirectoryFixture([oldMembership])), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return freshDirectory;
      }
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const view = render(
      <ProjectResourceFanout
        persistedWorkspaceId={WORKSPACE_A.workspaceId}
        ambientState={{ context: WORKSPACE_B, loading: false }}
      />,
    );
    await waitFor(() => {
      expect(view.getByTestId('scope').textContent).toBe(
        workspaceIdentityCacheKey(oldMembership),
      );
    });
    expect(
      requests.filter((request) => request.url.startsWith(`/api/projects/${PROJECT_ID}`)),
    ).toHaveLength(PROJECT_ENDPOINTS.length);

    act(() => notifyWorkspaceContextRefresh());

    expect(view.getByTestId('scope').textContent).toBe('waiting');
    expect(
      requests.filter((request) => request.url.startsWith(`/api/projects/${PROJECT_ID}`)),
    ).toHaveLength(PROJECT_ENDPOINTS.length);

    await act(async () => {
      resolveFreshDirectory(new Response(
        JSON.stringify(workspaceDirectoryFixture([newMembership])),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ));
      await freshDirectory;
    });

    await waitFor(() => {
      expect(view.getByTestId('scope').textContent).toBe(
        workspaceIdentityCacheKey(newMembership),
      );
    });
    const projectRequests = requests.filter(
      (request) => request.url.startsWith(`/api/projects/${PROJECT_ID}`),
    );
    expect(projectRequests).toHaveLength(PROJECT_ENDPOINTS.length * 2);
    expect(
      projectRequests.slice(PROJECT_ENDPOINTS.length).every(
        (request) =>
          request.headers.get('x-od-workspace-member-id')
          === newMembership.workspaceMemberId,
      ),
    ).toBe(true);
  });
});
