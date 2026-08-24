// Author-side file-change → publish TRIGGER (C spec §D1: C owns *when* to
// publish; the resource hub owns the mechanism). This subscribes to file-change
// events for the projects this daemon's member OWNS and has shared to the team,
// and coalesces every edit into a debounced publish through the scheduler.
//
// Read-only gate (loop-safe): a project is watched ONLY when this daemon's member
// is its single writer (team-shared AND owner === me). A member's pulled read-only
// copy (owned by someone else) is never watched here, so materializing an inbound
// pull can never loop back into a publish. It also keeps the member — who must
// stay read-only — from ever publishing edits to someone else's project.
//
// Kept OUT of runtime.ts (which #5383 is also editing) so the surfaces do not
// collide; server.ts wires it to the runtime's scheduler + the project watchers.

import type { ResourceHubPrincipal } from './resource-principal.js';

export interface PublishWatchSubscription {
  unsubscribe: () => Promise<void> | void;
}

export interface CollabPublishWatcherDeps {
  /** Coalesce every file edit into a debounced publish (the scheduler owns the window). */
  notifyChanged: (
    projectId: string,
    principal?: ResourceHubPrincipal,
  ) => void;
  /** Local project ids to consider watching. */
  listProjectIds: () => string[];
  /**
   * Whether THIS daemon should publish edits to `projectId`: it is team-shared
   * AND this daemon's member is its owner (the single writer). Async because it
   * consults the team hub + the workspace context.
   */
  shouldPublish: (
    projectId: string,
    signal: AbortSignal,
  ) => Promise<boolean | ResourceHubPrincipal>;
  /** Subscribe to file-change events for a project's content dir. */
  subscribeFiles: (projectId: string, onChange: () => void) => PublishWatchSubscription;
  /** Reconcile cadence (ms): how often to (re)discover owned+shared projects. */
  reconcileMs?: number;
  onError?: (error: unknown) => void;
}

export interface CollabPublishWatcher {
  /** Reconcile once immediately (exposed for tests / eager first pass). */
  reconcile: () => Promise<void>;
  start: () => void;
  dispose: () => Promise<void>;
}

const DEFAULT_RECONCILE_MS = 10_000;

export function createCollabPublishWatcher(deps: CollabPublishWatcherDeps): CollabPublishWatcher {
  const reconcileMs = deps.reconcileMs ?? DEFAULT_RECONCILE_MS;
  const subs = new Map<
    string,
    {
      subscription: PublishWatchSubscription;
      principal?: ResourceHubPrincipal;
    }
  >();
  const pendingUnsubscribes = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeReconcile: Promise<void> | null = null;
  let activeReconcileController: AbortController | null = null;
  let disposePromise: Promise<void> | null = null;
  let disposed = false;

  function unsubscribe(watched: { subscription: PublishWatchSubscription }): Promise<void> {
    const pending = Promise.resolve()
      .then(() => watched.subscription.unsubscribe())
      .then(() => undefined)
      .catch(() => undefined);
    pendingUnsubscribes.add(pending);
    void pending.finally(() => pendingUnsubscribes.delete(pending));
    return pending;
  }

  async function reconcileOnce(signal: AbortSignal): Promise<void> {
    if (disposed || signal.aborted) return;
    const ids = new Set(deps.listProjectIds());
    // Drop watchers for projects that no longer exist locally.
    for (const [projectId, watched] of subs) {
      if (!ids.has(projectId)) {
        void unsubscribe(watched);
        subs.delete(projectId);
      }
    }
    // Add watchers for owned + team-shared projects not yet watched.
    for (const projectId of ids) {
      if (disposed || signal.aborted || subs.has(projectId)) continue;
      let publishScope: boolean | ResourceHubPrincipal = false;
      try {
        publishScope = await deps.shouldPublish(projectId, signal);
      } catch (error) {
        if (!signal.aborted) deps.onError?.(error);
        continue;
      }
      if (disposed || signal.aborted || !publishScope) continue;
      const principal =
        typeof publishScope === 'object' ? publishScope : undefined;
      const sub = deps.subscribeFiles(projectId, () => {
        // Every edit → a debounced publish; the scheduler collapses bursts so a
        // half-written intermediate state never reaches members.
        if (disposed) return;
        if (principal) deps.notifyChanged(projectId, principal);
        else deps.notifyChanged(projectId);
      });
      subs.set(projectId, {
        subscription: sub,
        ...(principal ? { principal } : {}),
      });
      // Publish the CURRENT content once on first watch. The file watcher uses
      // `ignoreInitial`, so files already on disk when watching begins (e.g.
      // documents uploaded to a project before it was shared, or before the
      // owner-check resolved) never fire a change event and would otherwise
      // stay stranded at the initial share version — members would see the
      // shared project but pull an empty/stale copy. Gated on `shouldPublish`
      // (team-shared AND owned by me) above, so this only republishes a
      // single-writer's own project and is loop-safe. Fires once per project
      // per watch session (reconcile only subscribes not-yet-watched ids).
      if (principal) deps.notifyChanged(projectId, principal);
      else deps.notifyChanged(projectId);
    }
  }

  function reconcile(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (activeReconcile) return activeReconcile;
    const controller = new AbortController();
    activeReconcileController = controller;
    const tracked = reconcileOnce(controller.signal).finally(() => {
      if (activeReconcile === tracked) {
        activeReconcile = null;
        activeReconcileController = null;
      }
    });
    activeReconcile = tracked;
    return tracked;
  }

  return {
    reconcile,
    start() {
      if (disposed || timer) return;
      void reconcile().catch((error) => deps.onError?.(error));
      timer = setInterval(() => void reconcile().catch((error) => deps.onError?.(error)), reconcileMs);
      timer.unref?.();
    },
    dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      activeReconcileController?.abort();
      disposePromise = (async () => {
        const watched = [...subs.values()];
        subs.clear();
        await Promise.all(watched.map(unsubscribe));
        await Promise.all([...pendingUnsubscribes]);
      })();
      return disposePromise;
    },
  };
}
