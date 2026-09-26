// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { useDeletedShareNotices } from '../../src/components/project-actions/useDeletedShareNotices';
import { DeletedShareNotices } from '../../src/components/project-actions/DeletedShareNotices';
import { deleteProject } from '../../src/state/projects';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../../src/components/amrLoginPolling';
const context: WorkspaceCollabContext = { workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'owner', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
const rows = [{ filePath: 'auto.html', slug: 'stable-auto', retrying: true }, { filePath: 'manual.html', slug: 'stable-manual', retrying: false }];
const request = vi.fn<typeof fetch>();
beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });
function Harness() {
  const state = useDeletedShareNotices(context);
  return <><button onClick={() => void deleteProject('gone', context, state.capture('gone', context))}>Delete</button><DeletedShareNotices state={state} /></>;
}
it('renders real deletion failures as global Toast, queues each file, and never retries automatically', async () => {
  request.mockImplementation(async () => Response.json({ ok: true, shareResiduals: rows }));
  render(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Delete')));
  const failure = screen.getByRole('alert');
  expect(failure).toHaveClass('od-toast', 'tone-error', 'placement-top');
  expect(within(failure).getByText(/manual\.html.*could not be stopped/i)).toBeVisible();
  expect(within(failure).getByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.queryByText('auto.html')).toBeNull();
  fireEvent.click(within(failure).getByRole('button', { name: /dismiss/i }));
  expect(within(screen.getByRole('status')).getByText(/Stopping the share link.*auto\.html/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/api/projects/gone', expect.objectContaining({ method: 'DELETE' }));
});
it('S14-ERR manual Toast action retries the exact deleted file and clears only a confirmed stop', async () => {
  request.mockResolvedValueOnce(Response.json({ ok: true, shareResiduals: [rows[1]] }))
    .mockResolvedValueOnce(Response.json({ status: 'stopped', projectId: 'gone',
      filePath: 'manual.html', slug: 'stable-manual' }));
  render(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Delete')));
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith('/api/public-file-stops/retry', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ projectId: 'gone', filePath: 'manual.html', slug: 'stable-manual' }),
  }));
  expect(screen.queryByRole('alert')).toBeNull();
});
it('S14-ERR failed manual retry stays visible until dismissed and never fires a second request', async () => {
  request.mockResolvedValueOnce(Response.json({ ok: true, shareResiduals: [rows[1]] }))
    .mockResolvedValueOnce(Response.json({ error: 'stop not confirmed' }, { status: 503 }));
  render(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Delete')));
  await act(async () => fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })));
  expect(within(screen.getByRole('alert')).getByText(/manual\.html.*could not be stopped/i)).toBeVisible();
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
});
it('retains concurrent deletion groups, delivers once, and removes only a confirmed stopped file', async () => {
  const { result } = renderHook(() => useDeletedShareNotices(context));
  const receive = result.current.capture('gone', context);
  act(() => { receive(rows); receive(rows); result.current.capture('second', context)(rows); });
  expect(result.current.notices).toHaveLength(2);
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const notice = result.current.notices[0]!;
  let pending!: Promise<void>;
  act(() => { pending = result.current.retry(notice, notice.rows[1]!); void result.current.retry(notice, notice.rows[1]!); });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/api/public-file-stops/retry', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-od-workspace-id': 'ws' }), body: JSON.stringify({ projectId: 'gone', filePath: 'manual.html', slug: 'stable-manual' }) }));
  await act(async () => { finish(Response.json({ projectId: 'gone', filePath: 'manual.html', slug: 'stable-manual', status: 'stopped' })); await pending; });
  expect(result.current.notices[0]!.rows).toEqual([rows[0]]);
  expect(result.current.notices[1]!.rows).toEqual(rows);
});
it.each([502, 404, 200])('retains terminal evidence for failed or unconfirmed retry %s and never retries automatically', async status => {
  request.mockResolvedValue(Response.json({ status: 'unknown' }, { status }));
  const { result } = renderHook(() => useDeletedShareNotices(context));
  act(() => result.current.capture('gone', context)(rows));
  const notice = result.current.notices[0]!;
  await act(async () => result.current.retry(notice, notice.rows[1]!));
  expect(result.current.notices[0]!.rows[1]!).toMatchObject({ ...rows[1]!, busy: false, failed: true });
  expect(request).toHaveBeenCalledTimes(1);
});
it('self-healing rows cannot trigger manual retry even through the handler', async () => {
  const { result } = renderHook(() => useDeletedShareNotices(context));
  act(() => result.current.capture('gone', context)(rows));
  await act(async () => result.current.retry(result.current.notices[0]!, rows[0]!));
  expect(request).not.toHaveBeenCalled();
});
it('account boundaries hide existing notices and reject late once-only delivery', async () => {
  const { result } = renderHook(() => useDeletedShareNotices(context));
  const late = result.current.capture('late', context);
  act(() => result.current.capture('gone', context)(rows));
  act(() => { advanceWorkspaceAccountGeneration('new-account'); window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)); });
  expect(result.current.notices).toEqual([]);
  act(() => late(rows));
  expect(result.current.notices).toEqual([]);
});
it('workspace change rejects stale retry and response; navigating without changing scope preserves notices', async () => {
  const { result, rerender } = renderHook(value => useDeletedShareNotices(value), { initialProps: context });
  act(() => result.current.capture('gone', context)(rows));
  const old = result.current.notices[0]!;
  rerender({ ...context });
  expect(result.current.notices).toHaveLength(1);
  rerender({ ...context, workspaceId: 'other' });
  expect(result.current.notices).toEqual([]);
  await act(async () => result.current.retry(old, old.rows[1]!));
  expect(request).not.toHaveBeenCalled();
});
it('never expires once-only delivery or schedules a retry', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useDeletedShareNotices(context));
  act(() => result.current.capture('gone', context)(rows));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(result.current.notices[0]!.rows).toEqual(rows);
  expect(request).not.toHaveBeenCalled();
});
it('an old-account retry completion cannot restore a notice after account switch', async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useDeletedShareNotices(context));
  act(() => result.current.capture('gone', context)(rows));
  const notice = result.current.notices[0]!;
  let pending!: Promise<void>;
  act(() => { pending = result.current.retry(notice, notice.rows[1]!); });
  act(() => { advanceWorkspaceAccountGeneration('new'); window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)); });
  await act(async () => { finish(Response.json({ status: 'stopped', projectId: 'gone', filePath: 'manual.html', slug: 'stable-manual' })); await pending; });
  expect(result.current.notices).toEqual([]);
});
it('manual dismissal affects only its group', () => {
  const { result } = renderHook(() => useDeletedShareNotices(context));
  act(() => { result.current.capture('first', context)(rows); result.current.capture('second', context)(rows); });
  act(() => result.current.dismiss(result.current.notices[0]!.id));
  expect(result.current.notices.map(item => item.projectId)).toEqual(['second']);
});
