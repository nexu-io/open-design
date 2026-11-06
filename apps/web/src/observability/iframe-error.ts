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
import { reportClientMetricEvent, reportSafetyEvent } from '../analytics/error-tracking';
import { scrubFilePath } from '../analytics/scrub';

const LOAD_TIMEOUT_MS = 15000;

const PREVIEW_RESOURCE_TAGS = new Set([
  'script',
  'link',
  'img',
  'iframe',
  'audio',
  'video',
  'source',
  'track',
]);

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

/**
 * Mirror one deck-stage measurement into the console at warn level.
 *
 * The analytics event answers "how often"; this answers "what happened on this
 * machine". On desktop only warn/error console entries are persisted to
 * `renderer.log` (apps/desktop/src/main/runtime.ts), and that file is one of
 * the sources `od diagnostics export` bundles — so a user who hits the empty
 * deck can hand over an export that already contains the measurement, without
 * having to reproduce it while someone watches.
 *
 * The line is written as one flat, greppable record on purpose: the log is read
 * as text, so a shape that survives `grep deck_stage_unscaled` is worth more
 * than a pretty object that a log tail may truncate.
 */
function logDeckStageMeasurement(measurement: Record<string, unknown>): void {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
  const fields = [
    `stage_kind=${measurement.stage_kind ?? 'n/a'}`,
    `stage_scale=${measurement.stage_scale ?? 'n/a'}`,
    `stage_transform=${measurement.stage_transform ?? 'n/a'}`,
    `stage=${measurement.stage_width ?? 'n/a'}x${measurement.stage_height ?? 'n/a'}`,
    `canvas=${measurement.canvas_width ?? 'n/a'}x${measurement.canvas_height ?? 'n/a'}`,
    `frame=${measurement.viewport_width ?? 'n/a'}x${measurement.viewport_height ?? 'n/a'}`,
    `ready_state=${measurement.ready_state ?? 'n/a'}`,
    `visibility_state=${measurement.visibility_state ?? 'n/a'}`,
    `elapsed_ms=${measurement.elapsed_ms ?? 'n/a'}`,
    `render_mode=${measurement.render_mode ?? 'n/a'}`,
    `surface=${measurement.surface ?? 'n/a'}`,
  ].join(' ');
  console.warn(`[od:preview-observability] deck_stage_unscaled ${fields}`);
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
      monitoring_kind: 'no_visible_paint_after_timeout',
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

  if (message.event === 'deck_stage_unscaled') {
    const measurement = {
      ...common,
      monitoring_kind: 'stage_scale_collapsed',
      reason: 'stage_scale_collapsed',
      // Which authored shape collapsed: the canonical `.deck-stage`, a
      // `<deck-stage>` shadow canvas, or a template `.stage`. Frequency alone
      // cannot triage this, and the bridge went to some trouble to resolve it.
      stage_kind: boundedText(message.stage_kind, 32),
      // Restored to the decimal the reader actually thinks in. The wire keeps
      // it as an integer per-mille only because the shared normalizer rounds.
      stage_scale: decimalFromPermille(message.stage_scale_permille),
      stage_transform: boundedText(message.stage_transform, 32),
      stage_width: boundedNumber(message.stage_width),
      stage_height: boundedNumber(message.stage_height),
      canvas_width: boundedNumber(message.canvas_width),
      canvas_height: boundedNumber(message.canvas_height),
      viewport_width: boundedNumber(message.viewport_width),
      viewport_height: boundedNumber(message.viewport_height),
      ready_state: boundedText(message.ready_state, 32),
      visibility_state: boundedText(message.visibility_state, 32),
      elapsed_ms: boundedNumber(message.elapsed_ms),
    };
    reportSafetyEvent('client_preview_deck_stage_unscaled', measurement);
    logDeckStageMeasurement(measurement);
    return true;
  }

  if (message.event === 'resource_error') {
    reportSafetyEvent('client_preview_resource_error', {
      ...common,
      monitoring_kind: previewResourceMonitoringKind(message.resource_tag),
      resource_tag: boundedText(message.resource_tag, 32),
      resource_url: sanitizedResourceUrl,
    });
    return true;
  }

  reportSafetyEvent('client_preview_runtime_error', {
    ...common,
    monitoring_kind: message.event,
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
    monitoring_kind: 'srcdoc_transport_unverified',
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

function previewResourceMonitoringKind(value: unknown): string {
  const tag = boundedText(value, 32)?.toLowerCase();
  return `resource_tag:${tag && PREVIEW_RESOURCE_TAGS.has(tag) ? tag : 'other'}`;
}

function boundedText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  return next ? next.slice(0, limit) : undefined;
}

/**
 * Turn the wire's integer per-mille scale back into the decimal a human reads.
 * Absent stays absent: a missing measurement must not be reported as 0, which
 * is the value that means "collapsed".
 */
function decimalFromPermille(value: unknown): number | undefined {
  const permille = boundedNumber(value);
  if (permille === undefined) return undefined;
  return permille / 1000;
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


export type PreviewRenderMode = 'srcdoc' | 'url_load' | 'live_artifact';
type PreviewResult = 'success' | 'white_screen' | 'error' | 'cancelled';

/** One visible activation, exactly one terminal event. Rejected starts cannot
 * manufacture numerator-only events. Delivery itself remains best effort. */
export function createPreviewAttempt(deps: {
  renderMode: PreviewRenderMode; artifactKind: string | null;
  now: () => number; id: () => string;
  emit: (event: string, props: Record<string, unknown>) => boolean;
}) {
  let state: 'idle' | 'started' | 'finished' = 'idle';
  let started = 0;
  let fields: Record<string, unknown> = {};
  return {
    start(eligible: boolean): string | null {
      if (!eligible || state !== 'idle') return null;
      state = 'finished';
      started = deps.now();
      const id = deps.id();
      fields = { preview_attempt_id: id, render_mode: deps.renderMode,
        artifact_kind: deps.artifactKind, started_at: new Date().toISOString(),
        metric_schema_version: 1, telemetry_capability: 'supported' };
      if (!deps.emit('client_preview_attempt', fields)) return null;
      state = 'started';
      return id;
    },
    finish(result: PreviewResult, monitoringKind?: string): void {
      if (state !== 'started') return;
      state = 'finished';
      deps.emit('client_preview_result', { ...fields, result,
        duration_ms: Math.max(0, Math.round(deps.now() - started)),
        monitoring_kind: monitoringKind ?? ({ success: 'visible_content', white_screen: 'no_visible_paint_after_timeout',
          error: 'preview_error', cancelled: 'left_or_hidden' } as const)[result] });
    },
  };
}

export function isPreviewFrameVisible(iframe: HTMLIFrameElement): boolean {
  if (document.visibilityState !== 'visible' || !iframe.isConnected) return false;
  for (let node: HTMLElement | null = iframe; node; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true'
      || node.dataset.odActive === 'false' || node.dataset.odMotionActive === 'false') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  }
  const rect = iframe.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0
    && rect.top < window.innerHeight && rect.left < window.innerWidth;
}


/** Render modes whose frames carry the observability bridge and can answer
 * `od:preview-metric-probe`. URL-loaded artifacts never receive that bridge, so
 * an unanswered probe there is not evidence of failure; counting them would
 * turn every visible, successful URL preview into an `error` result. */
export function previewModeAnswersProbe(renderMode: PreviewRenderMode): boolean {
  return renderMode !== 'url_load';
}

/** Bounded probes; no authored text/URL/DOM enters the metric transport.
 * Retained frames are cancelled by activity attributes, even without unmount.
 * Frames that cannot answer the probe are excluded from the denominator. */
export function trackVisiblePreview(options: {
  iframe: HTMLIFrameElement; renderMode: PreviewRenderMode; artifactKind: string | null;
}): () => void {
  if (!previewModeAnswersProbe(options.renderMode)) return () => {};
  const { iframe } = options;
  let current: ReturnType<typeof createPreviewAttempt> | null = null;
  let attemptId: string | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let intersectionVisible = typeof IntersectionObserver === 'undefined';
  let settled = false;
  let probes = 0;
  const eligible = () => intersectionVisible && isPreviewFrameVisible(iframe);
  const clear = () => { for (const timer of timers) clearTimeout(timer); timers = []; };
  const finish = (result: PreviewResult, kind?: string) => { current?.finish(result, kind); settled = true; clear(); };
  const probe = () => {
    if (!eligible()) { update(); return; }
    if (!attemptId || settled || probes >= 8) return;
    probes++;
    if (options.renderMode === 'live_artifact') iframe.contentWindow?.postMessage({ type: 'od:preview-observability-host-state', active: true }, '*');
    iframe.contentWindow?.postMessage({ type: 'od:preview-metric-probe', attemptId }, '*');
  };
  const update = () => {
    if (!eligible()) {
      if (attemptId && options.renderMode === 'live_artifact') iframe.contentWindow?.postMessage({ type: 'od:preview-observability-host-state', active: false }, '*');
      finish('cancelled'); current = null; attemptId = null;
      return;
    }
    if (current) return;
    settled = false; probes = 0;
    current = createPreviewAttempt({ ...options, now: () => performance.now(),
      id: () => globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      emit: reportClientMetricEvent });
    attemptId = current.start(true);
    if (!attemptId) { current = null; return; }
    for (const delay of [0, 500, 1500, 5000, 6500, 10000, 14000]) timers.push(setTimeout(probe, delay));
    timers.push(setTimeout(() => {
      if (!eligible()) update();
      else finish('error', options.renderMode === 'srcdoc' ? 'srcdoc_transport_unverified' : 'probe_unverified');
    }, LOAD_TIMEOUT_MS));
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || settled) return;
    if (!attemptId || !eligible()) { update(); return; }
    const data = event.data;
    if (data?.type === 'od:preview-metric-result' && data.attemptId === attemptId
      && ['success', 'white_screen', 'error'].includes(data.result)) {
      finish(data.result);
    }
  };
  const onTransportRecovery = () => { if (eligible()) finish('error', 'srcdoc_transport_unverified'); };
  const onError = () => { if (eligible()) finish('error'); else update(); };
  const onPageHide = () => { finish('cancelled'); current = null; attemptId = null; };
  let activityTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleActivityUpdate = () => {
    if (activityTimer !== null) return;
    activityTimer = setTimeout(() => { activityTimer = null; update(); }, 100);
  };
  const observer = new MutationObserver(scheduleActivityUpdate);
  for (let node: HTMLElement | null = iframe; node; node = node.parentElement) {
    observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'data-od-active', 'data-od-motion-active', 'style', 'class'] });
  }
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    const entry = entries[0];
    intersectionVisible = !!entry?.isIntersecting && entry.intersectionRect.width > 1 && entry.intersectionRect.height > 1;
    update();
  });
  intersection?.observe(iframe);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', onPageHide);
  iframe.addEventListener('od:preview-transport-recovery', onTransportRecovery);
  window.addEventListener('message', onMessage);
  iframe.addEventListener('load', probe);
  iframe.addEventListener('error', onError);
  update();
  return () => {
    finish('cancelled');
    if (options.renderMode === 'live_artifact') iframe.contentWindow?.postMessage({ type: 'od:preview-observability-host-state', active: false }, '*');
    observer.disconnect(); intersection?.disconnect();
    if (activityTimer !== null) clearTimeout(activityTimer);
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('pagehide', onPageHide);
    iframe.removeEventListener('od:preview-transport-recovery', onTransportRecovery);
    window.removeEventListener('message', onMessage);
    iframe.removeEventListener('load', probe); iframe.removeEventListener('error', onError);
  };
}
