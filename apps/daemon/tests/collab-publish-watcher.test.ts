import { describe, expect, it, vi } from 'vitest';
import { createCollabPublishWatcher } from '../src/collab/collab-publish-watcher.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

describe('collab publish watcher', () => {
  it('reattaches after directory promotion without publishing received content', async () => {
    const notifyChanged = vi.fn();
    const unsubscribe = vi.fn();
    const handlers: Array<() => void> = [];
    const watcher = createCollabPublishWatcher({
      notifyChanged, publishInitialContent: false, listProjectIds: () => ['p1'],
      shouldPublish: async () => true,
      subscribeFiles: (_id, handler) => { handlers.push(handler); return { unsubscribe }; },
    });
    await watcher.reconcile();
    await watcher.refresh('p1');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(handlers).toHaveLength(2);
    expect(notifyChanged).not.toHaveBeenCalled();
    handlers[1]!();
    expect(notifyChanged).toHaveBeenCalledWith('p1');
    watcher.dispose();
  });

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
});
