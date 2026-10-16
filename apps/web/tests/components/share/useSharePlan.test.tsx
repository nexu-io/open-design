// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { useSharePlan } from '../../../src/components/share/useSharePlan';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';

const plan = { fileCount: 1, totalBytes: 12, exceedsSizeLimit: false, exclusions: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const request = vi.fn<typeof fetch>();
const workspace: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const input = { projectId: 'p1', filePath: 'index.html', workspaceContext: null as WorkspaceCollabContext | null, enabled: true, contentKey: 'a' };
beforeEach(() => { request.mockReset(); resetWorkspaceAccountGeneration(); vi.stubGlobal('fetch', request); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('OPEND-3771 share preflight recovery', () => {
  it('reports rejection after a queued click; clicking after failure cannot publish', async () => {
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSharePlan(input));
    const publish = vi.fn().mockResolvedValue(undefined);
    let queued!: Promise<void>;
    act(() => { queued = result.current.run(publish); });
    expect(result.current.waiting).toBe(true);
    await act(async () => { pending.reject(new Error('connection reset')); await queued; });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({ kind: 'preflight-failed' });
    await act(async () => { await result.current.run(publish); });
    expect(publish).not.toHaveBeenCalled();
  });

  it('coalesces repeated retries and requires a separate explicit publish after recovery', async () => {
    request.mockRejectedValueOnce(new Error('failed'));
    const { result } = renderHook(() => useSharePlan(input));
    await act(async () => {});
    const next = deferred<Response>();
    request.mockReturnValue(next.promise);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = result.current.retry(); second = result.current.retry(); });
    expect(first).toBe(second);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loading');
    const publish = vi.fn().mockResolvedValue(undefined);
    await act(async () => { next.resolve(Response.json(plan)); await first; });
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    await act(async () => { await result.current.run(publish); });
    expect(publish).toHaveBeenCalledOnce();
  });

  it.each(['file', 'project', 'workspace', 'account', 'content'] as const)('invalidates old result and queued intent on %s change', async change => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(props => useSharePlan(props), { initialProps: input });
    const publish = vi.fn().mockResolvedValue(undefined);
    let queued!: Promise<void>;
    act(() => { queued = result.current.run(publish); });
    if (change === 'account') advanceWorkspaceAccountGeneration('new-account');
    rerender({ ...input, ...(change === 'file' ? { filePath: 'other.html' } : change === 'project' ? { projectId: 'p2' }
      : change === 'content' ? { contentKey: 'b' } : change === 'workspace' ? { workspaceContext: workspace } : {}) });
    await act(async () => { old.resolve(Response.json(plan)); await queued; });
    expect(publish).not.toHaveBeenCalled();
    expect(result.current.plan).toBeNull();
    expect(result.current.status).toBe('loading');
    await act(async () => { next.resolve(Response.json(plan)); });
    expect(result.current.status).toBe('ready');
  });

  it.each(['size', 'conflict'])('refuses %s even after a queued click', async block => {
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSharePlan(input));
    const publish = vi.fn().mockResolvedValue(undefined);
    let queued!: Promise<void>;
    act(() => { queued = result.current.run(publish); });
    await act(async () => { pending.resolve(Response.json({ ...plan, exceedsSizeLimit: block === 'size', blockers: block === 'conflict' ? [{}] : [] })); await queued; });
    await act(async () => { await result.current.run(publish); });
    expect(publish).not.toHaveBeenCalled();
  });

  it('shares only concurrent checks across viewers, not settled results', async () => {
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const first = renderHook(() => useSharePlan(input));
    const second = renderHook(() => useSharePlan(input));
    expect(request).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(Response.json(plan)); });
    expect(first.result.current.status).toBe('ready');
    expect(second.result.current.status).toBe('ready');
    request.mockResolvedValue(Response.json(plan));
    renderHook(() => useSharePlan(input));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('deduplicates StrictMode effects and concurrently attached viewers', async () => {
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const first = renderHook(() => useSharePlan(input), { wrapper });
    const second = renderHook(() => useSharePlan(input), { wrapper });
    await act(async () => {});
    expect(request).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(Response.json(plan)); });
    expect(first.result.current.status).toBe('ready');
    expect(second.result.current.status).toBe('ready');
  });

  it('rejects account-stale results even before a rerender', async () => {
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSharePlan(input));
    const publish = vi.fn();
    let queued!: Promise<void>;
    act(() => { queued = result.current.run(publish); });
    advanceWorkspaceAccountGeneration('boundary');
    await act(async () => { pending.resolve(Response.json(plan)); await queued; });
    expect(publish).not.toHaveBeenCalled();
    expect(result.current.plan).toBeNull();
  });

  it('retains cached plan on reopen but failed revalidation blocks publishing', async () => {
    request.mockResolvedValueOnce(Response.json(plan));
    const { result, rerender } = renderHook(props => useSharePlan(props), { initialProps: input });
    await act(async () => {});
    rerender({ ...input, enabled: false });
    const next = deferred<Response>();
    request.mockReturnValue(next.promise);
    rerender(input);
    expect(result.current.plan).toEqual(plan);
    expect(result.current.status).toBe('loading');
    const publish = vi.fn().mockResolvedValue(undefined);
    let queued!: Promise<void>;
    act(() => { queued = result.current.run(publish); });
    await act(async () => { next.reject(new Error('failed')); await queued; });
    expect(result.current.plan).toEqual(plan);
    expect(result.current.status).toBe('error');
    await act(async () => { await result.current.run(publish); });
    expect(publish).not.toHaveBeenCalled();
  });
});
