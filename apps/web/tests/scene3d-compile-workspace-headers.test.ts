// @vitest-environment jsdom
//
// `useScene3dCompile`'s manifest GET and compile POST are `fetch` calls, not
// browser navigations — a real request the daemon can authenticate, unlike
// the `<a href>`/`<img src>` surfaces workspace-resource-url.test.ts and
// scene3d-export-menu-workspace-scoping.test.tsx cover. The established
// pattern for a hook's own fetch (useFinalizeProject.ts) is
// `workspaceProjectHeaders(workspaceContext)` spread into `headers`; this
// pins that useScene3dCompile follows it too, for both requests.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { useScene3dCompile } from '../src/hooks/useScene3dCompile';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const workspaceContext = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canShareProjects: true, canWriteSyncedFiles: true },
} as unknown as WorkspaceCollabContext;

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, scenePath: '.', stages: [], issues: [], summary: {} }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useScene3dCompile Workspace identity', () => {
  it('sends no Workspace headers for a local (non-Workspace) project', async () => {
    const fetchMock = stubFetch();
    renderHook(() => useScene3dCompile('p1', '.', null));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit | undefined)?.headers).toBeUndefined();
  });

  it('attaches Workspace identity headers to the manifest fetch', async () => {
    const fetchMock = stubFetch();
    renderHook(() => useScene3dCompile('p1', '.', workspaceContext));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
    });
  });

  it('attaches Workspace identity headers to the compile POST', async () => {
    const fetchMock = stubFetch();
    const hook = renderHook(() => useScene3dCompile('p1', '.', workspaceContext));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await hook.result.current.compile();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toContain('/scene3d/compile');
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'wm-1',
    });
  });
});
