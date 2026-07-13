// File-viewer iframe load tracker.
//
// FileViewer is the surface where the user spends the most time looking
// at generated artifacts. iframe load failures don't propagate to the
// outer `window.error` listener — they're trapped inside the frame — so
// the global resource-error observer can't see them.
//
// This helper exposes a single function the FileViewer calls when it
// mounts an iframe; it instruments the element for failure + timeout +
// success and emits scoped events. The same function returns a cleanup
// callback so the caller can remove instrumentation if the iframe is
// reused for a different artifact.

import { reportSafetyEvent } from '../analytics/error-tracking';

const LOAD_TIMEOUT_MS = 15000;

interface TrackIframeOptions {
  iframe: HTMLIFrameElement;
  artifactId?: string;
  projectId?: string;
  conversationId?: string;
  // Surface label so dashboards can split file-viewer iframes from
  // deck-viewer iframes, comment-mode iframes, etc.
  surface: string;
}

export function trackIframeLoad(options: TrackIframeOptions): () => void {
  const { iframe, surface } = options;
  const startedAt = performance.now();
  let settled = false;

  const settle = (event: string, extras: Record<string, unknown> = {}): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reportSafetyEvent(event, {
      surface,
      duration_ms: Math.round(performance.now() - startedAt),
      artifact_id: options.artifactId,
      project_id: options.projectId,
      conversation_id: options.conversationId,
      ...extras,
    });
  };

  const onLoad = (): void => {
    // We don't emit a success event by default — would multiply our
    // ingest cost for the most common case. Just settle the timeout.
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };

  const onError = (): void => {
    settle('client_iframe_error', { reason: 'error_event' });
  };

  iframe.addEventListener('load', onLoad);
  iframe.addEventListener('error', onError);

  const timer = setTimeout(() => {
    settle('client_iframe_timeout', { timeout_ms: LOAD_TIMEOUT_MS });
  }, LOAD_TIMEOUT_MS);

  return () => {
    clearTimeout(timer);
    iframe.removeEventListener('load', onLoad);
    iframe.removeEventListener('error', onError);
  };
}
