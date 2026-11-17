import { describe, expect, it, vi } from 'vitest';
import { cancelRevokedWorkspaceRuns, createWorkspaceMembershipRevocationObserver } from '../src/collab/cancel-revoked-workspace-runs.js';

describe('membership revocation run cancellation', () => {
  it('cancels only active runs pinned to the removed Workspace', async () => {
    const affected = { workspaceScope: { workspaceId: 'removed' } };
    const cancel = vi.fn(async (_run: { status?: string }) => undefined);
    const list = vi.fn(() => [affected, { workspaceScope: { workspaceId: 'other' } }, { workspaceScope: null }, {}]);
    await cancelRevokedWorkspaceRuns({ list, cancel }, 'removed');
    expect(list).toHaveBeenCalledWith({ status: 'active' });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(affected, 'project_cleanup');
  });
  it('stops queued and running work while leaving terminal work alone', async () => {
    const items = ['queued', 'running', 'succeeded', 'failed', 'canceled'].map(status => ({ status, workspaceScope: { workspaceId: 'removed' } }));
    const cancel = vi.fn(async (_run: { status?: string }) => undefined);
    await cancelRevokedWorkspaceRuns({ list: () => items, cancel }, 'removed');
    expect(cancel.mock.calls.map(([run]) => run.status)).toEqual(['queued', 'running']);
  });
  it('preserves a newly rejoined member’s running work', async () => {
    const old = { workspaceScope: { workspaceId: 'a', workspaceMemberId: 'old' } };
    const current = { workspaceScope: { workspaceId: 'a', workspaceMemberId: 'new' } };
    const cancel = vi.fn(async (_run: unknown) => undefined);
    await cancelRevokedWorkspaceRuns({ list: () => [old, current], cancel }, 'a', 'old');
    expect(cancel).toHaveBeenCalledExactlyOnceWith(old, 'project_cleanup');
  });
  it('surfaces cancellation failure to the caller for logging', async () => {
    await expect(cancelRevokedWorkspaceRuns({
      list: () => [{ workspaceScope: { workspaceId: 'removed' } }],
      cancel: async () => { throw new Error('stop failed'); },
    }, 'removed')).rejects.toThrow('stop failed');
  });
  it('never interprets an absent revocation scope as all Workspaces', async () => {
    const list = vi.fn(() => []);
    await cancelRevokedWorkspaceRuns({ list, cancel: vi.fn() }, null);
    expect(list).not.toHaveBeenCalled();
  });
});

describe('successful directory snapshot revocation', () => {
  const item = (workspaceId: string, workspaceMemberId = `member-${workspaceId}`) => ({ workspaceId, workspaceMemberId, memberStatus: 'active', lifecycleState: 'active' });
  it('cancels only missing former membership when an SSE was missed', () => {
    const removed = vi.fn();
    const observer = createWorkspaceMembershipRevocationObserver(removed);
    observer.observe('account', 'account', { ok: true, items: [item('a'), item('b')] });
    observer.observe('account', 'account', { ok: true, items: [item('b')] });
    expect(removed).toHaveBeenCalledExactlyOnceWith('a', 'member-a', 'account');
  });
  it('does not revoke for network failure or a late snapshot from the old account', () => {
    const removed = vi.fn();
    const observer = createWorkspaceMembershipRevocationObserver(removed);
    observer.observe('old', 'old', { ok: true, items: [item('a')] });
    observer.observe('old', 'old', { ok: false, items: [] });
    observer.observe('old', 'new', { ok: true, items: [] });
    observer.observe('new', 'new', { ok: true, items: [] });
    expect(removed).not.toHaveBeenCalled();
  });
  it('does not cancel the rejoined principal when a stale removal event refreshes the directory', async () => {
    const currentRun = { workspaceScope: { workspaceId: 'a', workspaceMemberId: 'new-member' } };
    const cancel = vi.fn(async (_run: unknown) => undefined);
    const runs = { list: () => [currentRun], cancel };
    const stopped: Promise<void>[] = [];
    const observer = createWorkspaceMembershipRevocationObserver((workspaceId, memberId) => {
      stopped.push(cancelRevokedWorkspaceRuns(runs, workspaceId, memberId));
    });
    observer.observe('account', 'account', { ok: true, items: [item('a', 'old-member')] });
    observer.observe('account', 'account', { ok: true, items: [item('a', 'new-member')] });
    // A delayed/replayed membership-removed signal causes another fresh read,
    // but supplies no principal authority of its own.
    observer.observe('account', 'account', { ok: true, items: [item('a', 'new-member')] });
    await Promise.all(stopped);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('targets the old member when rejoining creates a new principal', () => {
    const removed = vi.fn();
    const observer = createWorkspaceMembershipRevocationObserver(removed);
    observer.observe('account', 'account', { ok: true, items: [item('a', 'old-member')] });
    observer.observe('account', 'account', { ok: true, items: [item('a', 'new-member')] });
    expect(removed).toHaveBeenCalledExactlyOnceWith('a', 'old-member', 'account');
  });
});
