// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { useCommentSyncState } from '../../../src/components/share/useCommentSyncState';
import { AMR_LOGIN_STATUS_EVENT } from '../../../src/components/amrLoginPolling';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';
const context: WorkspaceCollabContext = {
  workspaceId: 'workspace', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const paused = { pending: 1, lastError: null, sessionMissing: true, shareStopped: null };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });
describe('production comment sync state reader', () => {
  it('starts unknown and sends scoped no-store GET to the real route', async () => {
    fetchMock.mockResolvedValue(Response.json(paused));
    const { result } = renderHook(() => useCommentSyncState('p/a', context));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(paused));
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p%2Fa/comment-sync-state', expect.objectContaining({
      cache: 'no-store', headers: expect.objectContaining({ 'x-od-workspace-id': 'workspace', 'x-od-workspace-member-id': 'member' }),
    }));
  });
  it.each([null, {}, { ...paused, sessionMissing: 'true' }])('keeps absent or malformed state unknown', async body => {
    fetchMock.mockResolvedValue(Response.json(body));
    const { result } = renderHook(() => useCommentSyncState('p', context));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });
  it('does not turn an HTTP failure into a healthy state', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const { result } = renderHook(() => useCommentSyncState('p', context));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });
  it('rereads after login and retains historical errors without deriving current failure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(paused));
    const { result } = renderHook(() => useCommentSyncState('p', context));
    await waitFor(() => expect(result.current?.sessionMissing).toBe(true));
    const recovered = { ...paused, pending: 0, sessionMissing: false, lastError: 'COMMENT_SYNC_DELIVERY_FAILED' };
    fetchMock.mockResolvedValue(Response.json(recovered));
    act(() => window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(recovered));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('keeps same-scope observation during a focus refresh and applies its result', async () => {
    const current = { ...paused, sessionMissing: false, pending: 0,
      backfill: { state: 'failed' as const, filePath: 'index.html', publicationRevision: 'r1', retryable: true } };
    fetchMock.mockResolvedValueOnce(Response.json(current));
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useCommentSyncState('p', context, { filePath: 'index.html' }));
    await waitFor(() => expect(result.current).toEqual(current));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toEqual(current);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const completed = { ...current, backfill: { ...current.backfill, state: 'succeeded' as const, retryable: false } };
    await act(async () => { finish(Response.json(completed)); });
    expect(result.current).toEqual(completed);
  });

  it('fences late old-account responses even if project and membership stay equal', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useCommentSyncState('p', context));
    fetchMock.mockResolvedValue(Response.json(null));
    act(() => { advanceWorkspaceAccountGeneration('other'); window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)); });
    await act(async () => { finish(Response.json(paused)); });
    expect(result.current).toBeNull();
  });
  it('clears old state synchronously when changing project', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(paused));
    const { result, rerender } = renderHook(project => useCommentSyncState(project, context), { initialProps: 'a' });
    await waitFor(() => expect(result.current).toEqual(paused));
    fetchMock.mockResolvedValue(Response.json(null));
    rerender('b');
    expect(result.current).toBeNull();
  });
});
