import { useEffect, useRef } from 'react';
import { BackoffController } from '../lib/backoff';
import {
  COLLAB_PROJECT_INVALIDATION_EVENTS,
  PROJECT_CONTENT_TRANSFER_STATE_EVENT,
  type CollabProjectInvalidationSsePayload,
  type LiveArtifactRefreshSsePayload,
  type LiveArtifactSsePayload,
  type ProjectConversationCreatedSsePayload,
  type ProjectContentTransferStateSsePayload,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  workspaceIdentityCacheKey,
  workspaceResourceUrl,
} from '../collab/workspace-identity';
export interface ProjectFileChangeEvent {
  type: 'file-changed';
  path: string;
  kind: 'add' | 'change' | 'unlink';
}

// Re-exported under the local "project event" naming so consumers in this
// package keep their existing import shape; the canonical type lives in
// `packages/contracts` alongside the other SSE payloads (per repo review
// guidance on contract/protocol seams).
export type ProjectConversationCreatedEvent = ProjectConversationCreatedSsePayload;

export type ProjectLiveArtifactEvent = LiveArtifactSsePayload | LiveArtifactRefreshSsePayload;

// Collab realtime hop-2: project-scoped thin invalidation events multiplexed
// onto this same stream (`comment-changed`, `presence-changed`,
// `project-metadata-changed`). The consumer re-fetches the affected resource on
// receipt — the event carries no body.
export type ProjectCollabInvalidationEvent = CollabProjectInvalidationSsePayload;

export type ProjectEvent =
  | ProjectFileChangeEvent
  | ProjectConversationCreatedEvent
  | ProjectLiveArtifactEvent
  | ProjectCollabInvalidationEvent
  | ProjectContentTransferStateSsePayload;

export interface ProjectEventsConnectionOptions {
  /** Test seam: substitute a mock EventSource constructor. */
  EventSourceCtor?: typeof EventSource;
  /** Initial backoff in ms. Defaults to 1000. */
  initialBackoffMs?: number;
  /** Max backoff in ms. Defaults to 30000. */
  maxBackoffMs?: number;
  /** Test seam: setTimeout/clearTimeout substitutes for fake timers. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** Test seam: deterministic jitter source for the reconnect backoff. */
  randomFn?: () => number;
  /**
   * Collab realtime hop-2 poll-as-floor signal. Fires `true` when the stream is
   * live (the daemon's `ready` handshake) and `false` on error/disconnect, so a
   * consumer can slow its fallback poll while the SSE is delivering and resume
   * full-cadence polling when it drops.
   */
  onConnectedChange?: (connected: boolean) => void;
  /**
   * Fires after the daemon's `ready` handshake. Consumers can use this to
   * reconcile state that may have changed after their initial snapshot but
   * before the event stream was connected.
   */
  onReady?: () => void;
}

const DEFAULT_INITIAL_BACKOFF = 1000;
const DEFAULT_MAX_BACKOFF = 30_000;

export function projectEventsUrl(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): string {
  return workspaceResourceUrl(
    `/api/projects/${encodeURIComponent(projectId)}/events`,
    workspaceContext,
  );
}

export interface ProjectEventsConnection {
  close(): void;
}

/**
 * Pure connection manager for a project's file-change SSE stream. Used by
 * `useProjectFileEvents`; exposed standalone so tests can drive it under a
 * node environment without React + JSDOM.
 *
 * Reconnects with exponential backoff (default 1s → 30s cap). On a successful
 * `ready` event the backoff resets so a flaky network doesn't permanently
 * stretch the gap between events.
 */
export function createProjectEventsConnection(
  projectId: string,
  onChange: (evt: ProjectEvent) => void,
  options: ProjectEventsConnectionOptions = {},
  workspaceContext?: WorkspaceCollabContext | null,
): ProjectEventsConnection {
  const Ctor = options.EventSourceCtor
    ?? (typeof EventSource === 'undefined' ? null : EventSource);
  if (!Ctor) return { close() { /* noop */ } };

  const setT = options.setTimeoutFn ?? setTimeout;
  const clearT = options.clearTimeoutFn ?? clearTimeout;
  const backoff = new BackoffController({
    initialMs: options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF,
    maxMs: options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF,
    factor: 2,
    jitter: true,
    random: options.randomFn,
  });

  let cancelled = false;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = (): void => {
    if (cancelled) return;
    const es = new Ctor(projectEventsUrl(projectId, workspaceContext));
    source = es;
    es.addEventListener('ready', () => {
      backoff.reset();
      options.onConnectedChange?.(true);
      options.onReady?.();
    });
    es.addEventListener('file-changed', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as ProjectFileChangeEvent;
        onChange(data);
      } catch (err) {
        // Ignore malformed payloads — we'll get more on the next change.
        // Log in dev so payload-shape bugs don't go silent during testing.
        if (
          typeof process !== 'undefined' &&
          process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn('[project-events] malformed file-changed payload', err);
        }
      }
    });
    const handleLiveArtifactEvent = (evt: Event) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as ProjectLiveArtifactEvent;
        onChange(data);
      } catch (err) {
        if (
          typeof process !== 'undefined' &&
          process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn('[project-events] malformed live-artifact payload', err);
        }
      }
    };
    es.addEventListener('live_artifact', handleLiveArtifactEvent);
    es.addEventListener('live_artifact_refresh', handleLiveArtifactEvent);
    es.addEventListener('conversation-created', (evt) => {
      try {
        const data = JSON.parse(
          (evt as MessageEvent).data,
        ) as ProjectConversationCreatedEvent;
        onChange(data);
      } catch (err) {
        if (
          typeof process !== 'undefined' &&
          process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn('[project-events] malformed conversation-created payload', err);
        }
      }
    });
    // Collab realtime hop-2: forward the project-scoped thin invalidation events
    // (`comment-changed`, `presence-changed`, `project-metadata-changed`). The
    // consumer re-fetches the affected resource — this only signals what changed.
    for (const eventName of COLLAB_PROJECT_INVALIDATION_EVENTS) {
      es.addEventListener(eventName, (evt) => {
        try {
          const data = JSON.parse(
            (evt as MessageEvent).data,
          ) as ProjectCollabInvalidationEvent;
          onChange(data);
        } catch (err) {
          if (
            typeof process !== 'undefined' &&
            process.env?.NODE_ENV === 'development'
          ) {
            // eslint-disable-next-line no-console
            console.warn(`[project-events] malformed ${eventName} payload`, err);
          }
        }
      });
    }
    es.addEventListener(PROJECT_CONTENT_TRANSFER_STATE_EVENT, (evt) => {
      try {
        // Thin invalidation only. The consumer must re-read exact-scoped
        // collab status; this project stream is not workspace/owner scoped.
        const data = JSON.parse(
          (evt as MessageEvent).data,
        ) as ProjectContentTransferStateSsePayload;
        onChange(data);
      } catch (err) {
        if (
          typeof process !== 'undefined'
          && process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[project-events] malformed ${PROJECT_CONTENT_TRANSFER_STATE_EVENT} payload`,
            err,
          );
        }
      }
    });
    es.addEventListener('error', () => {
      if (cancelled) return;
      options.onConnectedChange?.(false);
      es.close();
      if (source === es) source = null;
      reconnectTimer = setT(connect, backoff.nextDelay()) as ReturnType<typeof setTimeout>;
    });
  };

  connect();

  return {
    close(): void {
      cancelled = true;
      if (reconnectTimer) clearT(reconnectTimer);
      if (source) source.close();
    },
  };
}

/**
 * Subscribe to a project's filesystem-change SSE stream.
 *
 * Producer side: chokidar watcher in `apps/daemon/src/project-watchers.ts`
 * fires through `/api/projects/:id/events`. This hook listens and invokes
 * `onChange` for each `file-changed` event. Caller is expected to react by
 * refetching the file list — propagating new mtimes through to FileViewer
 * iframes is what triggers the actual reload (PR #384's `?v=${mtime}` cache-bust).
 *
 * Reconnects with exponential backoff (1s → 30s cap) on transient failures.
 * `enabled=false` (or a missing `projectId`) tears the stream down cleanly.
 */
export function useProjectFileEvents(
  projectId: string | null | undefined,
  enabled: boolean,
  onChange: (evt: ProjectEvent) => void,
  options: ProjectEventsConnectionOptions = {},
  workspaceContext?: WorkspaceCollabContext | null,
): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Keep the poll-as-floor status callback in a ref so a fresh identity does not
  // tear down and rebuild the SSE (which would churn the server sink).
  const onConnectedChangeRef = useRef(options.onConnectedChange);
  useEffect(() => {
    onConnectedChangeRef.current = options.onConnectedChange;
  }, [options.onConnectedChange]);

  // Like the status callback, keep reconciliation in a ref so an inline
  // consumer callback cannot churn the EventSource connection.
  const onReadyRef = useRef(options.onReady);
  useEffect(() => {
    onReadyRef.current = options.onReady;
  }, [options.onReady]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    if (typeof window === 'undefined') return;
    const conn = createProjectEventsConnection(
      projectId,
      (evt) => onChangeRef.current(evt),
      {
        ...options,
        onConnectedChange: (connected) => onConnectedChangeRef.current?.(connected),
        onReady: () => onReadyRef.current?.(),
      },
      workspaceContext,
    );
    return () => {
      conn.close();
      // Reset to "not connected" on teardown so a consumer's poll resumes full
      // cadence between projects / when the stream is intentionally closed.
      onConnectedChangeRef.current?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    enabled,
    workspaceIdentityCacheKey(workspaceContext),
    options.EventSourceCtor,
    options.initialBackoffMs,
    options.maxBackoffMs,
  ]);
}
