import { useEffect, useRef } from 'react';

export interface ProjectFileChangeEvent {
  type: 'file-changed';
  path: string;
  kind: 'add' | 'change' | 'unlink';
}

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
}

const DEFAULT_INITIAL_BACKOFF = 1000;
const DEFAULT_MAX_BACKOFF = 30_000;

export function projectEventsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/events`;
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
  onChange: (evt: ProjectFileChangeEvent) => void,
  options: ProjectEventsConnectionOptions = {},
): ProjectEventsConnection {
  const Ctor = options.EventSourceCtor
    ?? (typeof EventSource === 'undefined' ? null : EventSource);
  if (!Ctor) return { close() { /* noop */ } };

  const initialBackoff = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF;
  const maxBackoff = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF;
  const setT = options.setTimeoutFn ?? setTimeout;
  const clearT = options.clearTimeoutFn ?? clearTimeout;

  let cancelled = false;
  let backoff = initialBackoff;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = (): void => {
    if (cancelled) return;
    const es = new Ctor(projectEventsUrl(projectId));
    source = es;
    es.addEventListener('ready', () => {
      backoff = initialBackoff;
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
    es.addEventListener('error', () => {
      if (cancelled) return;
      es.close();
      if (source === es) source = null;
      const delay = backoff;
      backoff = Math.min(backoff * 2, maxBackoff);
      reconnectTimer = setT(connect, delay) as ReturnType<typeof setTimeout>;
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
  onChange: (evt: ProjectFileChangeEvent) => void,
  options: ProjectEventsConnectionOptions = {},
): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    if (typeof window === 'undefined') return;
    const conn = createProjectEventsConnection(
      projectId,
      (evt) => onChangeRef.current(evt),
      options,
    );
    return () => conn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, options.EventSourceCtor, options.initialBackoffMs, options.maxBackoffMs]);
}
