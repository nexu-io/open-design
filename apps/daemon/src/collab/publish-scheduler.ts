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

import type { ResourceHubPrincipal } from '../integrations/resource-hub.js';

export interface ResourcePublishInput {
  projectId: string;
  principal?: ResourceHubPrincipal;
}

export interface ResourcePublishAdapter {
  /**
   * Publish the current state of a project's sync unit to the resource hub and
   * advance its `published` ref. Resolves ONLY after the content is durably
   * written (content-first / pointer-last). Returns the new version, or null if
   * there was nothing to publish.
   */
  publish(input: ResourcePublishInput & { reason: string }): Promise<{ version: number } | null>;
  /**
   * Read the currently-published head for a project. The scheduler decides
   * *when* a member pulls; the adapter reports what head is available. Optional:
   * the local stub reports the in-memory head; the real hub adapter resolves the
   * published ref. Returns null when nothing has been published yet.
   */
  syncLatest?(input: ResourcePublishInput): Promise<{ version: number } | null>;
  /**
   * Materialize the published tree into the member's local copy. Optional: the
   * local stub has no bytes to fetch; the real hub adapter fetches the missing
   * blobs and writes the files. The scheduler decides *when* to pull.
   */
  pull?(input: ResourcePublishInput): Promise<void>;
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
  onPublished?: (result: { projectId: string; version: number; reason: string }) => void;
  onError?: (result: { projectId: string; error: unknown }) => void;
}

interface ProjectState {
  timer: ReturnType<typeof setTimeout> | null;
  reason: string;
  publishing: boolean;
  /** A change arrived while a publish was in flight → re-publish after it settles. */
  dirty: boolean;
  dirtyReason: string;
}

const DEFAULT_DEBOUNCE_MS = 400;

export class CollabPublishScheduler {
  private readonly adapter: ResourcePublishAdapter;
  private readonly debounceMs: number;
  private readonly onPublished?: CollabPublishSchedulerOptions['onPublished'];
  private readonly onError?: CollabPublishSchedulerOptions['onError'];
  private readonly projects = new Map<string, ProjectState>();

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
    if (state.publishing) {
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
    }
    this.projects.clear();
  }

  private async flush(projectId: string): Promise<void> {
    const state = this.projects.get(projectId);
    if (!state || state.publishing) return;
    state.timer = null;
    state.publishing = true;
    const reason = state.reason;
    try {
      const result = await this.adapter.publish({ projectId, reason });
      if (result) this.onPublished?.({ projectId, version: result.version, reason });
    } catch (error) {
      this.onError?.({ projectId, error });
    } finally {
      state.publishing = false;
      if (state.dirty) {
        state.dirty = false;
        // A change landed during the publish — schedule a fresh one.
        this.notifyChanged(projectId, state.dirtyReason || 'change');
      }
    }
  }

  private ensure(projectId: string): ProjectState {
    let state = this.projects.get(projectId);
    if (!state) {
      state = { timer: null, reason: 'change', publishing: false, dirty: false, dirtyReason: 'change' };
      this.projects.set(projectId, state);
    }
    return state;
  }
}
