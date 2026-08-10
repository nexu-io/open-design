/**
 * Cross-runtime protocol used by generated artifact previews to report
 * failures to the Open Design host. The bridge runs inside both srcDoc and
 * URL-loaded preview iframes; the host validates this narrow payload before it
 * reaches analytics.
 *
 * Keep this module browser-API free. The browser code is serialized as a
 * string so both the web and daemon runtimes inject exactly the same script.
 */

export const PREVIEW_OBSERVABILITY_MESSAGE_TYPE = 'od:preview-observability';
export const PREVIEW_OBSERVABILITY_PROTOCOL_VERSION = 1;
export const PREVIEW_OBSERVABILITY_BRIDGE_MARKER = 'data-od-preview-observability';
export const PREVIEW_WHITE_SCREEN_TIMEOUT_MS = 5_000;

export type PreviewObservabilityEvent =
  | 'runtime_error'
  | 'unhandled_rejection'
  | 'console_error'
  | 'resource_error'
  | 'white_screen';

export interface PreviewObservabilityMessage {
  type: typeof PREVIEW_OBSERVABILITY_MESSAGE_TYPE;
  version: typeof PREVIEW_OBSERVABILITY_PROTOCOL_VERSION;
  event: PreviewObservabilityEvent;
  message?: string;
  name?: string;
  source_url?: string;
  stack?: string;
  line?: number;
  column?: number;
  resource_tag?: string;
  resource_url?: string;
  ready_state?: string;
  visibility_state?: string;
  body_child_count?: number;
  visible_element_count?: number;
  viewport_width?: number;
  viewport_height?: number;
}

const EVENT_NAMES = new Set<PreviewObservabilityEvent>([
  'runtime_error',
  'unhandled_rejection',
  'console_error',
  'resource_error',
  'white_screen',
]);

type PreviewStringField =
  | 'message'
  | 'name'
  | 'source_url'
  | 'stack'
  | 'resource_tag'
  | 'resource_url'
  | 'ready_state'
  | 'visibility_state';

const STRING_FIELD_LIMITS: ReadonlyArray<readonly [PreviewStringField, number]> = [
  ['message', 500],
  ['name', 120],
  ['source_url', 1_000],
  ['stack', 2_000],
  ['resource_tag', 32],
  ['resource_url', 1_000],
  ['ready_state', 32],
  ['visibility_state', 32],
];

type PreviewNumberField =
  | 'line'
  | 'column'
  | 'body_child_count'
  | 'visible_element_count'
  | 'viewport_width'
  | 'viewport_height';

const NUMBER_FIELDS: readonly PreviewNumberField[] = [
  'line',
  'column',
  'body_child_count',
  'visible_element_count',
  'viewport_width',
  'viewport_height',
];

const MAX_PREVIEW_OBSERVABILITY_NUMBER = 10_000_000;

export function parsePreviewObservabilityMessage(
  value: unknown,
): PreviewObservabilityMessage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== PREVIEW_OBSERVABILITY_MESSAGE_TYPE) return null;
  if (candidate.version !== PREVIEW_OBSERVABILITY_PROTOCOL_VERSION) return null;
  if (typeof candidate.event !== 'string' || !EVENT_NAMES.has(candidate.event as PreviewObservabilityEvent)) {
    return null;
  }

  // Construct a fresh, bounded payload before it can enter the host's message
  // buffer. Generated artifacts are untrusted and may post arbitrary objects.
  const normalized: Record<string, unknown> = {
    type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
    version: PREVIEW_OBSERVABILITY_PROTOCOL_VERSION,
    event: candidate.event,
  };
  for (const [field, limit] of STRING_FIELD_LIMITS) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim().slice(0, limit);
    if (text) normalized[field] = text;
  }
  for (const field of NUMBER_FIELDS) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    normalized[field] = Math.max(
      0,
      Math.min(Math.round(value), MAX_PREVIEW_OBSERVABILITY_NUMBER),
    );
  }
  return normalized as unknown as PreviewObservabilityMessage;
}

/**
 * Runs before author scripts and emits a bounded, deduplicated diagnostic
 * stream. It deliberately does not serialize arbitrary objects or DOM text.
 */
export function buildPreviewObservabilityBridge(): string {
  return `<script ${PREVIEW_OBSERVABILITY_BRIDGE_MARKER}>
(function(){
  if (window.__odPreviewObservability) return;
  window.__odPreviewObservability = true;
  var TYPE = ${JSON.stringify(PREVIEW_OBSERVABILITY_MESSAGE_TYPE)};
  var VERSION = ${PREVIEW_OBSERVABILITY_PROTOCOL_VERSION};
  var WHITE_SCREEN_TIMEOUT = ${PREVIEW_WHITE_SCREEN_TIMEOUT_MS};
  var MAX_EVENTS = 12;
  var sentCount = 0;
  var sent = Object.create(null);
  function text(value, limit){
    if (typeof value !== 'string') return undefined;
    var next = value.replace(/\\s+/g, ' ').trim();
    if (!next) return undefined;
    return next.slice(0, limit || 500);
  }
  function describe(value){
    if (value && typeof value === 'object') {
      return {
        name: text(value.name, 120),
        message: text(value.message, 500),
        stack: text(value.stack, 2000)
      };
    }
    return { message: text(String(value == null ? '' : value), 500) };
  }
  function send(event, detail){
    if (sentCount >= MAX_EVENTS) return;
    detail = detail || {};
    var fingerprint = [event, detail.name || '', detail.message || '', detail.source_url || '', detail.stack || '', detail.resource_url || ''].join('|');
    if (sent[fingerprint]) return;
    sent[fingerprint] = true;
    sentCount += 1;
    try {
      window.parent.postMessage(Object.assign({ type: TYPE, version: VERSION, event: event }, detail), '*');
    } catch (_) {}
  }
  window.addEventListener('error', function(event){
    var target = event && event.target;
    if (target && target !== window && target.tagName) {
      var tag = String(target.tagName || '').toLowerCase();
      var resourceUrl = target.currentSrc || target.src || target.href || '';
      send('resource_error', {
        resource_tag: text(tag, 32),
        resource_url: text(String(resourceUrl || ''), 1000)
      });
      return;
    }
    var detail = describe(event && event.error);
    if (!detail.message) detail.message = text(event && event.message || 'Uncaught preview error', 500);
    detail.source_url = text(event && event.filename, 1000);
    detail.line = Number.isFinite(event && event.lineno) ? Number(event.lineno) : undefined;
    detail.column = Number.isFinite(event && event.colno) ? Number(event.colno) : undefined;
    send('runtime_error', detail);
  }, true);
  window.addEventListener('unhandledrejection', function(event){
    send('unhandled_rejection', describe(event && event.reason));
  });
  if (window.console && typeof window.console.error === 'function') {
    var originalConsoleError = window.console.error;
    window.console.error = function(){
      try {
        var detail = null;
        for (var i = 0; i < arguments.length; i += 1) {
          var value = arguments[i];
          if (value instanceof Error || typeof value === 'string') {
            detail = describe(value);
            break;
          }
        }
        if (detail && detail.message) send('console_error', detail);
      } catch (_) {}
      return originalConsoleError.apply(this, arguments);
    };
  }
  function nonBlankColor(value){
    var normalized = String(value || '').replace(/\\s+/g, '').toLowerCase();
    return !!normalized &&
      normalized !== 'transparent' &&
      normalized !== 'rgba(0,0,0,0)' &&
      normalized !== 'rgb(255,255,255)' &&
      normalized !== 'rgba(255,255,255,1)' &&
      normalized !== '#fff' && normalized !== '#ffffff' && normalized !== 'white';
  }
  function intersectsViewport(rect){
    return rect && rect.width > 1 && rect.height > 1 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < (window.innerHeight || 0) && rect.left < (window.innerWidth || 0);
  }
  function visiblyPaints(element){
    var tag = String(element.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'template') return false;
    var style;
    var rect;
    try {
      style = window.getComputedStyle(element);
      rect = element.getBoundingClientRect();
    } catch (_) { return false; }
    if (!intersectsViewport(rect) || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
    if (tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video' || tag === 'picture' || tag === 'object') return true;
    if (String(element.textContent || '').trim().length > 0) return true;
    if (style.backgroundImage && style.backgroundImage !== 'none') return true;
    if (nonBlankColor(style.backgroundColor)) return true;
    return false;
  }
  function visiblePaintCount(){
    if (!document.body) return 0;
    var nodes = document.body.querySelectorAll('*');
    var count = 0;
    var limit = Math.min(nodes.length, 2000);
    for (var i = 0; i < limit; i += 1) {
      if (visiblyPaints(nodes[i])) {
        count += 1;
        if (count >= 3) break;
      }
    }
    if (count === 0) {
      try {
        var bodyStyle = window.getComputedStyle(document.body);
        if ((bodyStyle.backgroundImage && bodyStyle.backgroundImage !== 'none') || nonBlankColor(bodyStyle.backgroundColor)) count = 1;
      } catch (_) {}
    }
    return count;
  }
  var whiteScreenChecked = false;
  function checkWhiteScreen(){
    if (whiteScreenChecked) return;
    whiteScreenChecked = true;
    var visible = visiblePaintCount();
    if (visible > 0) return;
    send('white_screen', {
      ready_state: text(document.readyState, 32),
      visibility_state: text(document.visibilityState, 32),
      body_child_count: document.body ? document.body.children.length : 0,
      visible_element_count: visible,
      viewport_width: Math.max(0, Math.round(window.innerWidth || 0)),
      viewport_height: Math.max(0, Math.round(window.innerHeight || 0))
    });
  }
  if (document.readyState === 'complete') setTimeout(checkWhiteScreen, WHITE_SCREEN_TIMEOUT);
  else window.addEventListener('load', function(){ setTimeout(checkWhiteScreen, WHITE_SCREEN_TIMEOUT); }, { once: true });
  setTimeout(checkWhiteScreen, WHITE_SCREEN_TIMEOUT * 2);
})();
</script>`;
}
