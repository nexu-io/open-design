// Team collaboration sync trigger — the author-side "trigger + orchestration" that the sync trigger owns.
//
// It does NOT implement the resource store: publishing content + advancing the
// `published` ref is the resource hub (the resource-hub owner, the resource hub the spec = createVersion + setRef).
// C's job is *when* to publish: coalesce rapid author edits into one publish so
// half-written intermediate states never reach members, flush at run boundaries,
// and — on success — let the orchestrator notify online members to pull.
//
// Invariant: notification happens strictly AFTER the adapter's
// publish resolves (content durable, pointer moved), so members are never told to
// pull a version that is not yet durable. The adapter is expected to resolve only
// on durable success (E's atomic write); this scheduler adds the coalescing.

import { COLLAB_VELA_FANOUT_CONCURRENCY, ConcurrencyGate } from './concurrency-gate.js';
import type { ResourceHubPrincipal } from './resource-principal.js';

export interface ResourcePublishInput {
  projectId: string;
  principal?: ResourceHubPrincipal;
}

export interface PublishedResourceVersion {
  version: number;
  versionId?: string;
}

export interface ResourcePublishAdapter {
  /**
   * Publish the current state of a project's sync unit to the resource hub and
   * advance its `published` ref. Resolves ONLY after the content is durably
   * written (content-first / pointer-last). Returns the new version, or null if
   * there was nothing to publish.
   */
  publish(input: ResourcePublishInput & { reason: string }): Promise<PublishedResourceVersion | null>;
  /**
   * Read the currently-published head for a project. The scheduler decides
   * *when* a member pulls; the adapter reports what head is available. Optional:
   * the local stub reports the in-memory head; the real hub adapter resolves the
   * published ref. Returns null when nothing has been published yet.
   */
  syncLatest?(input: ResourcePublishInput): Promise<PublishedResourceVersion | null>;
  /**
   * Materialize the published tree into the member's local copy. Optional: the
   * local stub has no bytes to fetch; the real hub adapter fetches the missing
   * blobs and writes the files. The scheduler decides *when* to pull. A real
   * materializer must return the exact version it landed on disk; a later head
   * read is not equivalent because the ref may advance while bytes are in
   * flight.
   */
  pull?(input: ResourcePublishInput): Promise<PublishedResourceVersion | null>;
  /**
   * Remove the project from the shared team index. Existing immutable versions may
   * remain in the hub, but team members should no longer discover/pull it from the
   * team project list. Optional: older/local adapters can no-op.
   */
  unpublish?(input: ResourcePublishInput): Promise<void>;
}

export interface CollabPublishSchedulerOptions {
  adapter: ResourcePublishAdapter;
  /** Coalesce window (ms). Rapid changes within it collapse into one publish. */
  debounceMs?: number;
  /** Fired after a successful publish so the orchestrator can notify members. */
  onPublished?: (result: {
    projectId: string;
    version: number;
    versionId?: string;
    reason: string;
  }) => void;
  onError?: (result: { projectId: string; error: unknown }) => void;
}

interface ProjectState {
  timer: ReturnType<typeof setTimeout> | null;
  reason: string;
  publishing: boolean;
  /** A change arrived while a publish was in flight → re-publish after it settles. */
  dirty: boolean;
  dirtyReason: string;
  /**
   * The publish has passed the fan-out gate and the adapter is reading the
   * project. Until then the publish is only queued: it has not looked at the
   * project yet, so a change arriving in that window needs no second publish.
   */
  admitted: boolean;
  /** Pending automatic retry of a failed publish (see {@link PUBLISH_RETRY_BACKOFF_MS}). */
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Consecutive failed publish attempts with no success or newer change in between. */
  consecutiveFailures: number;
}

const DEFAULT_DEBOUNCE_MS = 400;
// A publish that fails with no newer change pending retries automatically on
// this bounded backoff schedule. Without it a transient hub/network error
// leaves the project stuck in its failed sync state until the author happens
// to edit again. The budget is deliberately finite: a persistently failing
// hub gets three spaced attempts, then the scheduler goes quiet so a broken
// deploy cannot drive an endless vela child-process drumbeat. A successful
// publish or a fresh author change restores the full budget.
export const PUBLISH_RETRY_BACKOFF_MS: readonly number[] = [5_000, 15_000, 45_000];

export class CollabPublishScheduler {
  private readonly adapter: ResourcePublishAdapter;
  private readonly debounceMs: number;
  private readonly onPublished?: CollabPublishSchedulerOptions['onPublished'];
  private readonly onError?: CollabPublishSchedulerOptions['onError'];
  private readonly projects = new Map<string, ProjectState>();
  // Per-project re-entry is already blocked by `state.publishing`, but nothing
  // bounded the fan-out ACROSS projects: a run boundary that dirties every
  // project in a workspace, or a batch of debounce windows expiring in the
  // same tick, spawned one concurrent `vela resource push` per project. The
  // gate caps that peak; the queue behind it preserves every publish.
  private readonly gate = new ConcurrencyGate(COLLAB_VELA_FANOUT_CONCURRENCY);

  constructor(options: CollabPublishSchedulerOptions) {
    this.adapter = options.adapter;
    this.debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    this.onPublished = options.onPublished;
    this.onError = options.onError;
  }

  /** An author-side change to a project. Publishes are coalesced within the window. */
  notifyChanged(projectId: string, reason = 'change'): void {
    const state = this.ensure(projectId);
    state.reason = reason;
    // A fresh author change supersedes any in-progress failure recovery: it
    // publishes on its own debounce window with the full retry budget.
    state.consecutiveFailures = 0;
    this.clearRetryTimer(state);
    if (state.publishing) {
      // Still queued behind the fan-out cap: the adapter has not read the
      // project yet, so it will pick this change up when it is admitted.
      // `state.reason` above is what it will publish under.
      if (!state.admitted) return;
      // Don't interrupt an in-flight publish — mark dirty so a fresh one runs
      // after it settles (last-write-wins; the change is never lost).
      state.dirty = true;
      state.dirtyReason = reason;
      return;
    }
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      void this.flush(projectId);
    }, this.debounceMs);
  }

  /**
   * Run boundary — flush any pending publish immediately instead of waiting out
   * the debounce, so members see the stable end-of-run state promptly.
   */
  runBoundary(projectId: string): void {
    const state = this.projects.get(projectId);
    if (!state) return;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.publishing) {
      // Same queued-vs-reading split as notifyChanged: a publish still waiting
      // for a fan-out slot will observe the end-of-run state on its own.
      if (!state.admitted) return;
      state.dirty = true;
      state.dirtyReason = state.reason;
      return;
    }
    void this.flush(projectId);
  }

  /** Cancel all pending timers (shutdown). */
  dispose(): void {
    for (const state of this.projects.values()) {
      if (state.timer) clearTimeout(state.timer);
      this.clearRetryTimer(state);
    }
    this.projects.clear();
  }

  private async flush(projectId: string): Promise<void> {
    const state = this.projects.get(projectId);
    if (!state || state.publishing) return;
    state.timer = null;
    this.clearRetryTimer(state);
    state.publishing = true;
    state.admitted = false;
    // Resolved at admission, not at queueing: a change that lands while this
    // publish waits for a slot updates `state.reason`, and that is the state
    // the adapter is about to read.
    let reason = state.reason;
    let failed = false;
    try {
      const result = await this.gate.run(() => {
        state.admitted = true;
        reason = state.reason;
        return this.adapter.publish({ projectId, reason });
      });
      state.consecutiveFailures = 0;
      if (result) {
        this.onPublished?.({
          projectId,
          version: result.version,
          ...(result.versionId ? { versionId: result.versionId } : {}),
          reason,
        });
      }
    } catch (error) {
      failed = true;
      this.onError?.({ projectId, error });
    } finally {
      state.publishing = false;
      state.admitted = false;
      if (state.dirty) {
        state.dirty = false;
        // A change landed during the publish — schedule a fresh one. That
        // newer content supersedes failure recovery, so no retry stacks on
        // top of the re-publish (notifyChanged restores the retry budget).
        this.notifyChanged(projectId, state.dirtyReason || 'change');
      } else if (failed) {
        this.scheduleRetry(projectId, state);
      }
    }
  }

  /**
   * Recovery for a publish that failed with nothing newer pending: re-run the
   * same publish (same reason) after a bounded backoff. Exhausting the budget
   * leaves the project in its failed sync state until the next author change —
   * deliberately, so a persistently failing hub is retried a handful of times
   * rather than forever.
   */
  private scheduleRetry(projectId: string, state: ProjectState): void {
    const delayMs = PUBLISH_RETRY_BACKOFF_MS[state.consecutiveFailures];
    state.consecutiveFailures += 1;
    if (delayMs === undefined) return; // retry budget exhausted
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      void this.flush(projectId);
    }, delayMs);
  }

  private clearRetryTimer(state: ProjectState): void {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
  }

  private ensure(projectId: string): ProjectState {
    let state = this.projects.get(projectId);
    if (!state) {
      state = {
        timer: null,
        reason: 'change',
        publishing: false,
        dirty: false,
        dirtyReason: 'change',
        admitted: false,
        retryTimer: null,
        consecutiveFailures: 0,
      };
      this.projects.set(projectId, state);
    }
    return state;
  }
}
