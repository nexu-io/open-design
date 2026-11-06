// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type PublicFileStopListResponse, type WorkspaceCollabContext } from '@open-design/contracts';
import { useDeletedShareNotices } from '../../src/components/project-actions/useDeletedShareNotices';
import { DeletedShareNotices } from '../../src/components/project-actions/DeletedShareNotices';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration, workspaceProjectHeaders } from '../../src/collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../../src/components/amrLoginPolling';

const context: WorkspaceCollabContext = { workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'owner', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
const task = { projectId: 'gone', filePath: 'file.html', slug: 'stable', retrying: false };
const list: PublicFileStopListResponse = { tasks: [task] };
const request = vi.fn<typeof fetch>();
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function mount() {
  const initialProps: { current: WorkspaceCollabContext | null; generation: string } = { current: context, generation: 'verified-1' };
  return renderHook(({ current, generation }) => useDeletedShareNotices(current, generation), {
    initialProps,
  });
}
async function flush() { await act(async () => {}); }
beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

it('mount and remount rediscover exhausted persisted tasks using the real DTO and exact headers, never POST', async () => {
  request.mockImplementation(async () => Response.json(list));
  const first = mount();
  await flush();
  expect(first.result.current.notices[0]?.rows).toEqual([{ filePath: task.filePath, slug: task.slug, retrying: false, recovered: true }]);
  expect(request).toHaveBeenCalledWith('/api/public-file-stops', expect.objectContaining({ headers: workspaceProjectHeaders(context), signal: expect.any(AbortSignal) }));
  first.unmount();
  const second = mount();
  await flush();
  expect(second.result.current.notices).toHaveLength(1);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every(([url, options]) => url === '/api/public-file-stops' && !options?.method)).toBe(true);
});

it('merges every project and exact file/slug once, keeps local-only residuals on an authoritative empty list', async () => {
  request.mockImplementation(async () => Response.json({ tasks: [] }));
  const hook = mount();
  await flush();
  act(() => hook.result.current.capture('gone', context)([{ filePath: task.filePath, slug: task.slug, retrying: false }, { filePath: 'local.html', slug: 'unqueued', retrying: false }]));
  request.mockImplementation(async () => Response.json({ tasks: [task, task, { ...task, slug: 'other' }, { ...task, projectId: 'second' }] } satisfies PublicFileStopListResponse));
  hook.rerender({ current: context, generation: 'verified-2' });
  await flush();
  expect(hook.result.current.notices).toHaveLength(2);
  expect(hook.result.current.notices[0]?.rows).toHaveLength(3);
  act(() => hook.result.current.capture('gone', context)([{ filePath: task.filePath, slug: task.slug, retrying: false }]));
  expect(hook.result.current.notices[0]?.rows).toHaveLength(3);
  request.mockImplementation(async () => Response.json({ tasks: [] }));
  hook.rerender({ current: context, generation: 'verified-3' });
  await flush();
  expect(hook.result.current.notices).toHaveLength(1);
  expect(hook.result.current.notices[0]?.rows.map(row => row.slug)).toEqual(['stable', 'unqueued']);
});

it.each([
  ['503', () => new Response('', { status: 503 })],
  ['401', () => new Response('', { status: 401 })],
  ['403', () => new Response('', { status: 403 })],
  ['nonJSON', () => new Response('<html>')],
  ['missing tasks', () => Response.json({})],
  ['malformed tail', () => Response.json({ tasks: [task, { ...task, retrying: 'false' }] })],
  ['empty identity', () => Response.json({ tasks: [{ ...task, slug: '' }] })],
] as const)('%s does not clear same-scope recovered or local warnings or partially apply a list', async (_name, response) => {
  request.mockImplementation(async () => Response.json(list));
  const hook = mount();
  await flush();
  act(() => hook.result.current.capture('local', context)([{ filePath: 'local.html', slug: 'local', retrying: false }]));
  const before = hook.result.current.notices;
  request.mockImplementation(async () => response());
  hook.rerender({ current: context, generation: 'verified-2' });
  await flush();
  expect(hook.result.current.notices).toEqual(before);
});

it.each(['stop', 'dismiss', 'capture'] as const)('a GET issued before %s cannot resurrect or erase local operations', async operation => {
  request.mockImplementation(async () => Response.json(list));
  const hook = mount();
  await flush();
  const late = deferred();
  request.mockImplementation((url) => url === '/api/public-file-stops' ? late.promise : Promise.resolve(Response.json({ ...task, status: 'stopped' })));
  hook.rerender({ current: context, generation: 'verified-2' });
  const notice = hook.result.current.notices[0]!;
  if (operation === 'stop') await act(async () => hook.result.current.retry(notice, notice.rows[0]!));
  if (operation === 'dismiss') act(() => hook.result.current.dismissRow(notice.id, notice.rows[0]!));
  if (operation === 'capture') act(() => hook.result.current.capture('new', context)([{ filePath: 'new.html', slug: 'local', retrying: false }]));
  const before = hook.result.current.notices;
  await act(async () => { late.resolve(Response.json(operation === 'capture' ? { tasks: [] } : list)); });
  expect(hook.result.current.notices).toEqual(before);
  expect(hook.result.current.notices).toHaveLength(operation === 'capture' ? 2 : 0);
});

it('null, inactive and unverified identities do not recover', async () => {
  const hook = mount();
  hook.unmount();
  request.mockClear();
  renderHook(() => useDeletedShareNotices(null, 'verified'));
  renderHook(() => useDeletedShareNotices({ ...context, memberStatus: 'removed' }, 'verified'));
  renderHook(() => useDeletedShareNotices({ ...context, lifecycleState: 'locked' }, 'verified'));
  renderHook(() => useDeletedShareNotices(context));
  await flush();
  expect(request).not.toHaveBeenCalled();
});

it.each(['account', 'workspace', 'logout', 'unmount'] as const)('%s aborts and isolates deferred recovery; account event alone cannot reuse retained authority', async boundary => {
  const late = deferred();
  const next = deferred();
  request.mockReturnValueOnce(late.promise).mockReturnValue(next.promise);
  const hook = mount();
  const signal = request.mock.calls[0]?.[1]?.signal;
  act(() => hook.result.current.capture('local', context)([{ filePath: 'local.html', slug: 'local', retrying: false }]));
  if (boundary === 'account') act(() => { advanceWorkspaceAccountGeneration('other-account'); window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)); });
  if (boundary === 'workspace') hook.rerender({ current: { ...context, workspaceId: 'other' }, generation: 'verified-2' });
  if (boundary === 'logout') hook.rerender({ current: null, generation: 'verified-2' });
  if (boundary === 'unmount') hook.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => { late.resolve(Response.json(list)); });
  if (boundary !== 'unmount') expect(hook.result.current.notices).toEqual([]);
  if (boundary === 'workspace') {
    await act(async () => { next.resolve(Response.json({ tasks: [{ ...task, projectId: 'new-workspace' }] })); });
    expect(hook.result.current.notices.map(notice => notice.projectId)).toEqual(['new-workspace']);
    expect(request).toHaveBeenLastCalledWith('/api/public-file-stops', expect.objectContaining({ headers: expect.objectContaining({ 'x-od-workspace-id': 'other' }) }));
  }
  if (boundary === 'account') {
    expect(request).toHaveBeenCalledTimes(1);
    request.mockImplementation(async () => Response.json(list));
    hook.rerender({ current: context, generation: 'new-account-verified' });
    await flush();
    expect(hook.result.current.notices).toHaveLength(1);
  }
});

it('unmounted GET cannot deliver into a remount', async () => {
  const late = deferred();
  request.mockReturnValueOnce(late.promise).mockImplementation(async () => Response.json({ tasks: [] }));
  const first = mount();
  first.unmount();
  const second = mount();
  await act(async () => { late.resolve(Response.json(list)); });
  expect(second.result.current.notices).toEqual([]);
});

it('fresh persisted eligibility updates an exact local row without making absence proof of its stop', async () => {
  request.mockImplementation(async () => Response.json({ tasks: [] }));
  const hook = mount();
  await flush();
  act(() => hook.result.current.capture(task.projectId, context)([{ filePath: task.filePath, slug: task.slug, retrying: true }]));
  request.mockImplementation(async () => Response.json(list));
  hook.rerender({ current: context, generation: 'verified-2' });
  await flush();
  expect(hook.result.current.notices[0]?.rows).toEqual([{ filePath: task.filePath, slug: task.slug, retrying: false }]);
});

it('recovery issued during a manual retry cannot replace its row before the exact POST completes', async () => {
  request.mockImplementation(async () => Response.json(list));
  const hook = mount();
  await flush();
  const stopped = deferred();
  const get = deferred();
  request.mockImplementation(url => url === '/api/public-file-stops' ? get.promise : stopped.promise);
  const notice = hook.result.current.notices[0]!;
  let retry!: Promise<void>;
  act(() => { retry = hook.result.current.retry(notice, notice.rows[0]!); });
  hook.rerender({ current: context, generation: 'verified-2' });
  await act(async () => { get.resolve(Response.json(list)); });
  expect(hook.result.current.notices[0]?.id).toBe(notice.id);
  expect(hook.result.current.notices[0]?.rows[0]?.busy).toBe(true);
  await act(async () => { stopped.resolve(Response.json({ ...task, status: 'stopped' })); await retry; });
  expect(hook.result.current.notices).toEqual([]);
});

it('recovered automatic-budget eligibility is not rendered as an executing stop', async () => {
  request.mockImplementation(async () => Response.json({ tasks: [{ ...task, retrying: true }] }));
  function Harness() { return <DeletedShareNotices state={useDeletedShareNotices(context, 'verified')} />; }
  render(<Harness />);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be stopped/i);
  expect(screen.queryByRole('status')).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});
