// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: () => ({ connected: false }),
}));
import { resetCoalescedGet } from '../src/lib/coalesced-get';
import { resetWorkspaceContextCache, resetTeamProjectsCache, notifyTeamProjectsChanged, useTeamProjects, useWorkspaceContext } from '../src/collab/useWorkspaceContext';
import { workspaceContextFixture, workspaceDirectoryFixture } from './helpers/workspace-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetCoalescedGet();
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  sessionStorage.clear();
});

it.each(['personal', 'team'] as const)('settles loading after %s catalog is unavailable', async (workspaceType) => {
  const context = workspaceContextFixture({ workspaceId: 'diagnostic-ws', workspaceMemberId: 'diagnostic-member', workspaceType });
  sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId }));
  let denied = true;
  const catalogRequests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/workspace/directory')) return Response.json(workspaceDirectoryFixture([context]));
    if (url.includes('/api/workspace/context')) return Response.json({ context });
    if (url.includes('/api/workspace/projects/team')) {
      catalogRequests.push(url);
      return denied ? Response.json({ error: 'WORKSPACE_ACCESS_DENIED' }, { status: 403 }) : Response.json({ projects: [] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
  const hook = renderHook(() => ({ context: useWorkspaceContext(), catalog: useTeamProjects() }));
  await act(async () => {});
  expect(hook.result.current.context.context?.workspaceId).toBe(context.workspaceId);
  expect(hook.result.current.context.loading).toBe(false);
  expect(hook.result.current.context.identityChangePending).toBe(false);
  expect(hook.result.current.catalog.projects).toEqual([]);
  expect(hook.result.current.catalog.loading).toBe(false);
  expect(hook.result.current.catalog.error).toBe(workspaceType === 'team' ? 'unavailable' : undefined);
  if (workspaceType === 'personal') expect(catalogRequests).toEqual([]);
  denied = false;
  await act(async () => notifyTeamProjectsChanged());
  expect(hook.result.current.catalog.loading).toBe(false);
  expect(hook.result.current.catalog.error).toBeUndefined();
});
