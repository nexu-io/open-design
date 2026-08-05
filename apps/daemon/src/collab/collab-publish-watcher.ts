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
  dispose: () => void;
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
  let timer: ReturnType<typeof setInterval> | null = null;
  let reconciling = false;

  async function reconcile(): Promise<void> {
    if (reconciling) return;
    reconciling = true;
    try {
      const ids = new Set(deps.listProjectIds());
      // Drop watchers for projects that no longer exist locally.
      for (const [projectId, watched] of subs) {
        if (!ids.has(projectId)) {
          void Promise.resolve(watched.subscription.unsubscribe()).catch(() => {});
          subs.delete(projectId);
        }
      }
      // Add watchers for owned + team-shared projects not yet watched.
      for (const projectId of ids) {
        if (subs.has(projectId)) continue;
        let publishScope: boolean | ResourceHubPrincipal = false;
        try {
          publishScope = await deps.shouldPublish(projectId);
        } catch (error) {
          deps.onError?.(error);
          continue;
        }
        if (!publishScope) continue;
        const principal =
          typeof publishScope === 'object' ? publishScope : undefined;
        const sub = deps.subscribeFiles(projectId, () => {
          // Every edit → a debounced publish; the scheduler collapses bursts so a
          // half-written intermediate state never reaches members.
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
    } finally {
      reconciling = false;
    }
  }

  return {
    reconcile,
    start() {
      if (timer) return;
      void reconcile().catch((error) => deps.onError?.(error));
      timer = setInterval(() => void reconcile().catch((error) => deps.onError?.(error)), reconcileMs);
      timer.unref?.();
    },
    dispose() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      for (const watched of subs.values()) {
        void Promise.resolve(watched.subscription.unsubscribe()).catch(() => {});
      }
      subs.clear();
    },
  };
}
