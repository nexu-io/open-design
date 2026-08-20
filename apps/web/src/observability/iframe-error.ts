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

import {
  parsePreviewObservabilityMessage,
  type PreviewObservabilityMessage,
} from '@open-design/contracts/runtime/preview-observability';
import { reportSafetyEvent } from '../analytics/error-tracking';
import { scrubFilePath } from '../analytics/scrub';

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

export interface PreviewIframeReportOptions {
  surface: string;
  renderMode: 'url_load' | 'srcdoc';
  artifactId?: string;
  artifactKind?: string;
  projectId?: string;
}

export type PreviewTransportRecoverySignal =
  | 'body_incomplete'
  | 'host_navigation_abort'
  | 'probe_timeout'
  | 'reactivation_unverified';

export interface PreviewTransportDocumentState {
  readyState?: string;
  bodyPresent?: boolean;
  bodyChildCount?: number;
  documentElementChildCount?: number;
}

export interface PreviewTransportRecoveryOptions extends PreviewIframeReportOptions {
  signal: PreviewTransportRecoverySignal;
  activationAcknowledged: boolean;
  documentState?: PreviewTransportDocumentState;
  viewportWidth?: number;
  viewportHeight?: number;
  timeoutMs?: number;
}

interface BufferedPreviewMessage {
  source: MessageEventSource | null;
  data: PreviewObservabilityMessage;
  receivedAt: number;
}

type PreviewMessageSubscriber = (message: BufferedPreviewMessage) => void;

const PREVIEW_MESSAGE_BUFFER_LIMIT = 30;
const PREVIEW_MESSAGE_MAX_AGE_MS = 10_000;
const PREVIEW_REPORT_LIMIT = 20;
const previewMessageBuffer: BufferedPreviewMessage[] = [];
const previewMessageSubscribers = new Set<PreviewMessageSubscriber>();
let previewMessageObserverInstalled = false;
let previewMessageListener: ((event: MessageEvent) => void) | null = null;

// Installed at app boot, before FileViewer's iframes mount. This short buffer
// closes the race where an author script throws synchronously while React is
// still committing the iframe and before the component can subscribe.
export function installPreviewIframeMessageObserver(): () => void {
  if (previewMessageObserverInstalled) return () => undefined;
  if (typeof window === 'undefined') return () => undefined;
  previewMessageObserverInstalled = true;
  previewMessageListener = (event: MessageEvent) => {
    const data = parsePreviewObservabilityMessage(event.data);
    if (!data) return;
    const message = { source: event.source, data, receivedAt: Date.now() };
    if (previewMessageSubscribers.size === 0) {
      previewMessageBuffer.push(message);
      prunePreviewMessageBuffer();
      return;
    }
    for (const subscriber of previewMessageSubscribers) subscriber(message);
  };
  window.addEventListener('message', previewMessageListener);

  return () => {
    if (previewMessageListener) window.removeEventListener('message', previewMessageListener);
    previewMessageListener = null;
    previewMessageObserverInstalled = false;
    previewMessageBuffer.length = 0;
    previewMessageSubscribers.clear();
  };
}

export function subscribePreviewIframeMessages(
  subscriber: PreviewMessageSubscriber,
): () => void {
  previewMessageSubscribers.add(subscriber);
  prunePreviewMessageBuffer();
  const bufferedMessages = previewMessageBuffer.splice(0);
  for (const message of bufferedMessages) subscriber(message);
  return () => previewMessageSubscribers.delete(subscriber);
}

function prunePreviewMessageBuffer(): void {
  const cutoff = Date.now() - PREVIEW_MESSAGE_MAX_AGE_MS;
  while (
    previewMessageBuffer.length > PREVIEW_MESSAGE_BUFFER_LIMIT ||
    (previewMessageBuffer[0]?.receivedAt ?? Infinity) < cutoff
  ) {
    previewMessageBuffer.shift();
  }
}

export function reportPreviewIframeMessage(
  value: unknown,
  options: PreviewIframeReportOptions,
  seen: Set<string> = new Set(),
): boolean {
  const message = parsePreviewObservabilityMessage(value);
  if (!message) return false;

  const sanitizedMessage = sanitizePreviewText(message.message, 500);
  const sanitizedSourceUrl = sanitizePreviewUrl(message.source_url);
  const sanitizedStack = sanitizePreviewText(message.stack, 2_000);
  const sanitizedResourceUrl = sanitizePreviewUrl(message.resource_url);
  const fingerprint = [
    message.event,
    message.name ?? '',
    sanitizedMessage ?? '',
    sanitizedSourceUrl ?? '',
    sanitizedStack ?? '',
    sanitizedResourceUrl ?? '',
  ].join('|');
  if (seen.has(fingerprint) || seen.size >= PREVIEW_REPORT_LIMIT) return false;
  seen.add(fingerprint);

  const common: Record<string, unknown> = {
    surface: options.surface,
    render_mode: options.renderMode,
    artifact_id: options.artifactId,
    artifact_kind: options.artifactKind,
    project_id: options.projectId,
  };

  if (message.event === 'white_screen') {
    reportSafetyEvent('client_preview_white_screen', {
      ...common,
      reason: 'no_visible_paint_after_timeout',
      ready_state: boundedText(message.ready_state, 32),
      visibility_state: boundedText(message.visibility_state, 32),
      body_child_count: boundedNumber(message.body_child_count),
      visible_element_count: boundedNumber(message.visible_element_count),
      viewport_width: boundedNumber(message.viewport_width),
      viewport_height: boundedNumber(message.viewport_height),
      blank_observation_count: boundedNumber(message.blank_observation_count),
      sample_interval_ms: boundedNumber(message.sample_interval_ms),
    });
    return true;
  }

  if (message.event === 'resource_error') {
    reportSafetyEvent('client_preview_resource_error', {
      ...common,
      resource_tag: boundedText(message.resource_tag, 32),
      resource_url: sanitizedResourceUrl,
    });
    return true;
  }

  reportSafetyEvent('client_preview_runtime_error', {
    ...common,
    error_origin: message.event,
    error_name: boundedText(message.name, 120),
    error_message: sanitizedMessage,
    error_source_url: sanitizedSourceUrl,
    error_stack: sanitizedStack,
    line: boundedNumber(message.line),
    column: boundedNumber(message.column),
  });
  return true;
}

/**
 * Report a host-observed blank preview that the iframe-local paint detector
 * cannot reliably see. In particular, Chromium may execute the injected head
 * bridge and then abort the rest of an about:srcdoc navigation. Recovery
 * replaces that half-document before its five-second white-screen timer can
 * fire, so the host records the transport witness that caused the remount.
 *
 * This deliberately reuses client_preview_white_screen: it is operational
 * safety telemetry, not a new product analytics event. Only bounded state is
 * attached; no authored DOM text or source content leaves the client.
 */
export function reportPreviewTransportRecovery(
  options: PreviewTransportRecoveryOptions,
): void {
  let transportStage: string;
  switch (options.signal) {
    case 'body_incomplete':
      transportStage = 'head_bridge_alive_body_tail_missing';
      break;
    case 'host_navigation_abort':
      transportStage = 'active_blob_navigation_aborted';
      break;
    case 'reactivation_unverified':
      transportStage = 'retained_frame_unverified_on_reactivation';
      break;
    case 'probe_timeout':
      transportStage = options.activationAcknowledged
        ? 'head_bridge_lost_after_eager_ack'
        : 'no_head_bridge_ack';
      break;
  }
  reportSafetyEvent('client_preview_white_screen', {
    surface: options.surface,
    render_mode: options.renderMode,
    artifact_id: options.artifactId,
    artifact_kind: options.artifactKind,
    project_id: options.projectId,
    reason: 'srcdoc_transport_unverified',
    transport_signal: options.signal,
    transport_stage: transportStage,
    activation_acknowledged: options.activationAcknowledged,
    body_complete: options.signal === 'body_incomplete' ? false : undefined,
    frame_ready_state: boundedText(options.documentState?.readyState, 32),
    frame_body_present: options.documentState?.bodyPresent,
    frame_body_child_count: boundedNumber(options.documentState?.bodyChildCount),
    frame_document_element_child_count: boundedNumber(
      options.documentState?.documentElementChildCount,
    ),
    recovery_attempted: true,
    recovery_path: 'lazy_shell_remount',
    host_visibility_state:
      typeof document === 'undefined' ? undefined : document.visibilityState,
    viewport_width: boundedNumber(options.viewportWidth),
    viewport_height: boundedNumber(options.viewportHeight),
    timeout_ms: boundedNumber(options.timeoutMs),
  });
}

function boundedText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  return next ? next.slice(0, limit) : undefined;
}

function boundedNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(Math.round(value), 10_000_000));
}

function sanitizePreviewText(value: unknown, limit: number): string | undefined {
  const bounded = boundedText(value, limit);
  if (!bounded) return undefined;
  const pathScrubbed = scrubFilePath(bounded);
  if (typeof pathScrubbed !== 'string') return undefined;
  return pathScrubbed
    .replace(/\b(?:data|blob):[^\s)]+/gi, '[inline-url]')
    .replace(/https?:\/\/[^\s)]+/gi, (raw) => sanitizePreviewUrl(raw) ?? '[url]')
    .slice(0, limit);
}

function sanitizePreviewUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const raw = value.trim();
  if (/^(?:data|blob):/i.test(raw)) return '[inline-url]';
  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
  } catch {
    const scrubbed = scrubFilePath(raw);
    return typeof scrubbed === 'string' ? scrubbed.slice(0, 500) : undefined;
  }
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
