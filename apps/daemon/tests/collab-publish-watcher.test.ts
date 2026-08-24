import { describe, expect, it, vi } from 'vitest';
import { createCollabPublishWatcher } from '../src/collab/collab-publish-watcher.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

describe('collab publish watcher', () => {
  it('publishes current content once when it first watches an owned+shared project', async () => {
    const notifyChanged = vi.fn();
    const onChangeHandlers = new Map<string, () => void>();
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['owned-shared', 'someone-elses'],
      shouldPublish: async (projectId) => projectId === 'owned-shared',
      subscribeFiles: (projectId, onChange) => {
        onChangeHandlers.set(projectId, onChange);
        return { unsubscribe: () => {} };
      },
    });

    await watcher.reconcile();

    // Owned+shared → subscribed AND an initial publish so existing files (which
    // the file watcher's ignoreInitial would skip) still reach members.
    expect(onChangeHandlers.has('owned-shared')).toBe(true);
    expect(notifyChanged).toHaveBeenCalledTimes(1);
    expect(notifyChanged).toHaveBeenCalledWith('owned-shared');
    // A project owned by someone else is never watched or published from here.
    expect(onChangeHandlers.has('someone-elses')).toBe(false);
  });

  it('does not re-publish an already-watched project on subsequent reconciles', async () => {
    const notifyChanged = vi.fn();
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['p1'],
      shouldPublish: async () => true,
      subscribeFiles: () => ({ unsubscribe: () => {} }),
    });

    await watcher.reconcile();
    await watcher.reconcile();
    await watcher.reconcile();

    // Initial publish fires once per watch session, not on every reconcile tick.
    expect(notifyChanged).toHaveBeenCalledTimes(1);
  });

  it('publishes on a later file change through the subscribed handler', async () => {
    const notifyChanged = vi.fn();
    const handler: { onChange: (() => void) | null } = { onChange: null };
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['p1'],
      shouldPublish: async () => true,
      subscribeFiles: (_projectId, onChange) => {
        handler.onChange = onChange;
        return { unsubscribe: () => {} };
      },
    });

    await watcher.reconcile();
    notifyChanged.mockClear();
    handler.onChange?.();

    expect(notifyChanged).toHaveBeenCalledTimes(1);
    expect(notifyChanged).toHaveBeenCalledWith('p1');
  });

  it('keeps the verified workspace principal captured by the watch', async () => {
    const principal: ResourceHubPrincipal = {
      teamId: 'workspace-a',
      memberId: 'member-a',
      role: 'owner',
      lifecycleState: 'active',
      workspaceType: 'team',
    };
    const notifyChanged = vi.fn();
    const handler: { onChange: (() => void) | null } = { onChange: null };
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['p1'],
      shouldPublish: async () => principal,
      subscribeFiles: (_projectId, onChange) => {
        handler.onChange = onChange;
        return { unsubscribe: () => {} };
      },
    });

    await watcher.reconcile();
    expect(notifyChanged).toHaveBeenLastCalledWith('p1', principal);

    notifyChanged.mockClear();
    handler.onChange?.();
    expect(notifyChanged).toHaveBeenCalledOnce();
    expect(notifyChanged).toHaveBeenCalledWith('p1', principal);
  });

  it('cancels an in-flight ownership check and does not subscribe after disposal starts', async () => {
    let resolveShouldPublish!: (value: boolean) => void;
    const ownershipSignals: AbortSignal[] = [];
    const shouldPublish = vi.fn((_projectId: string, signal: AbortSignal) => {
      ownershipSignals.push(signal);
      return new Promise<boolean>((resolve) => {
        resolveShouldPublish = resolve;
      });
    });
    const subscribeFiles = vi.fn(() => ({ unsubscribe: () => {} }));
    const notifyChanged = vi.fn();
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['p1'],
      shouldPublish,
      subscribeFiles,
    });

    const reconciling = watcher.reconcile();
    await vi.waitFor(() => expect(shouldPublish).toHaveBeenCalledOnce());
    await watcher.dispose();
    expect(ownershipSignals[0]?.aborted).toBe(true);

    resolveShouldPublish(true);
    await reconciling;

    expect(subscribeFiles).not.toHaveBeenCalled();
    expect(notifyChanged).not.toHaveBeenCalled();
  });

  it('waits for subscriptions to close and ignores stale file callbacks after disposal', async () => {
    const handler: { onChange: (() => void) | null } = { onChange: null };
    let finishUnsubscribe!: () => void;
    const unsubscribe = vi.fn(() => new Promise<void>((resolve) => {
      finishUnsubscribe = resolve;
    }));
    const notifyChanged = vi.fn();
    const watcher = createCollabPublishWatcher({
      notifyChanged,
      listProjectIds: () => ['p1'],
      shouldPublish: async () => true,
      subscribeFiles: (_projectId, onFileChange) => {
        handler.onChange = onFileChange;
        return { unsubscribe };
      },
    });

    await watcher.reconcile();
    notifyChanged.mockClear();
    let disposed = false;
    const disposing = Promise.resolve(watcher.dispose()).then(() => {
      disposed = true;
    });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(disposed).toBe(false);

    handler.onChange?.();
    expect(notifyChanged).not.toHaveBeenCalled();
    finishUnsubscribe();
    await disposing;
    expect(disposed).toBe(true);
  });
});
