// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { DeletedShareNotices } from '../../src/components/project-actions/DeletedShareNotices';
import { useDeletedShareNotices } from '../../src/components/project-actions/useDeletedShareNotices';
import { I18nProvider } from '../../src/i18n';
import {
  currentWorkspaceContextRequestToken, notifyWorkspaceContextRefresh,
  resetWorkspaceContextCache, useWorkspaceContext, workspaceResourceReadContext,
} from '../../src/collab/useWorkspaceContext';
import { currentWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { workspaceContextFixture, workspaceDirectoryFixture } from '../helpers/workspace-context';

const owner = workspaceContextFixture({
  workspaceId: 'ws-upgrade', workspaceMemberId: 'member-upgrade', role: 'owner',
  billingState: 'free', planId: null,
  permissions: { ...workspaceContextFixture({ workspaceId: 'unused', workspaceMemberId: 'unused' }).permissions, canManageBilling: true },
});
const task = { projectId: 'deleted', filePath: 'old.html', slug: 'old', retrying: false };
let current: WorkspaceCollabContext | null;
let list: () => Promise<Response>;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let state: ReturnType<typeof useWorkspaceContext>;

function Harness() {
  state = useWorkspaceContext();
  // The same authority projection as App, not the retained shell context.
  const notices = useDeletedShareNotices(workspaceResourceReadContext(state), state.resourceReadIdentity?.generation);
  return <I18nProvider initial="en">
    <EntryNavRail view="home" onViewChange={() => {}} onNewProject={() => {}} open
      context={state.context} balanceUsd="0" />
    <DeletedShareNotices state={notices} />
  </I18nProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspaceContextCache();
  resetWorkspaceDirectoryCache();
  current = owner;
  list = async () => Response.json({ tasks: [task] });
  request = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    if (url === '/api/workspace/directory') return Response.json(workspaceDirectoryFixture(current ? [current] : []));
    if (url === '/api/workspace/context') return Response.json({ context: current });
    if (url === '/api/public-file-stops') return list();
    return Response.json({});
  });
  vi.stubGlobal('fetch', request);
  vi.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  resetWorkspaceContextCache();
  resetWorkspaceDirectoryCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const listCalls = () => request.mock.calls.filter(([url]) => url === '/api/public-file-stops');
async function mount() { await act(async () => { render(<Harness />); }); }

it.each(['503', 'malformed200'] as const)('Upgrade preserves the real witness and notice when the next recovery would return %s', async failure => {
  await mount();
  expect(screen.getByRole('alert')).toHaveTextContent('old.html');
  const witness = state.resourceReadIdentity;
  const generation = currentWorkspaceAccountGeneration();
  const token = currentWorkspaceContextRequestToken();
  expect(witness).toBeTruthy();
  expect(listCalls()).toHaveLength(1);
  list = async () => failure === '503'
    ? new Response(null, { status: 503 })
    : Response.json({ tasks: [{ ...task, retrying: 'false' }] });

  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
  const card = screen.getByTestId('entry-top-right-credits-panel');
  fireEvent.click(within(card).getByRole('button', { name: 'Upgrade' }));
  expect(window.open).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(screen.getByRole('alert')).toHaveTextContent('old.html');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('alert')).toHaveTextContent('old.html');
  expect(state.resourceReadIdentity).toEqual(witness);
  expect(currentWorkspaceAccountGeneration()).toBe(generation);
  expect(currentWorkspaceContextRequestToken()).toBe(token);
  // Billing-only refresh must not invent another stop-list read. Actual
  // failed-GET preservation is covered by deleted-share-recovery.test.tsx.
  expect(listCalls()).toHaveLength(1);

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('old.html');
  expect(state.resourceReadIdentity).toEqual(witness);
  expect(currentWorkspaceAccountGeneration()).toBe(generation);
  expect(listCalls()).toHaveLength(1);
});

it.each(['account', 'logout', 'workspace'] as const)('a real %s boundary still removes protected notices', async boundary => {
  await mount();
  expect(screen.getByRole('alert')).toHaveTextContent('old.html');
  const generation = currentWorkspaceAccountGeneration();
  list = async () => Response.json({ tasks: [] });
  await act(async () => {
    if (boundary === 'workspace') {
      current = { ...owner, workspaceId: 'other-workspace', workspaceMemberId: 'other-member' };
      notifyWorkspaceContextRefresh({ context: current });
    } else {
      if (boundary === 'logout') current = null;
      notifyWorkspaceContextRefresh();
    }
  });
  expect(screen.queryByRole('alert')).toBeNull();
  if (boundary !== 'workspace') expect(currentWorkspaceAccountGeneration()).toBeGreaterThan(generation);
  if (boundary === 'logout') expect(state.resourceReadIdentity).toBeNull();
  if (boundary === 'workspace') expect(workspaceResourceReadContext(state)?.workspaceId).toBe('other-workspace');
});

it('a real account boundary rejects a late old-account recovery response', async () => {
  let resolve!: (response: Response) => void;
  list = () => new Promise<Response>(done => { resolve = done; });
  await mount();
  expect(listCalls()).toHaveLength(1);
  const signal = listCalls()[0]?.[1]?.signal;
  list = async () => Response.json({ tasks: [] });
  await act(async () => { notifyWorkspaceContextRefresh(); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve(Response.json({ tasks: [task] })); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(listCalls()).toHaveLength(2);
});
