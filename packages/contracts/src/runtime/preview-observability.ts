/**
 * Cross-runtime protocol used by generated artifact previews to report
 * failures to the OpenDesign host. The bridge runs inside both srcDoc and
 * URL-loaded preview iframes; the host validates this narrow payload before it
 * reaches analytics.
 *
 * Keep this module browser-API free. The browser code is serialized as a
 * string so both the web and daemon runtimes inject exactly the same script.
 */

export const PREVIEW_OBSERVABILITY_MESSAGE_TYPE = 'od:preview-observability';
export const PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE =
  'od:preview-observability-host-state';
export const PREVIEW_OBSERVABILITY_PROTOCOL_VERSION = 1;
export const PREVIEW_OBSERVABILITY_BRIDGE_MARKER = 'data-od-preview-observability';
export const PREVIEW_WHITE_SCREEN_TIMEOUT_MS = 5_000;
// A deck stage that is still collapsed this long after load is not mid-layout.
// The artifact's own `fit()` plus the host's layout chase both settle well
// inside a second on a healthy run, so anything measured here is the failure.
export const PREVIEW_DECK_STAGE_TIMEOUT_MS = 5_000;
// Below this the stage occupies no meaningful area: at 1920px authored width a
// scale of 0.005 renders under 10 physical pixels.
export const PREVIEW_DECK_STAGE_MIN_SCALE = 0.01;
export const PREVIEW_WHITE_SCREEN_CONFIRMATION_MS = 1_500;
export const PREVIEW_BASE_SCOPE_MESSAGE_TYPE = 'od:preview-base-scope';
export const PREVIEW_BASE_UPDATE_MESSAGE_TYPE = 'od:preview-base-update';

export interface PreviewBaseScopeMessage {
  type: typeof PREVIEW_BASE_SCOPE_MESSAGE_TYPE;
  href: string;
  expiresAt: number;
}

export function buildPreviewBaseHrefBridge(
  initialScope?: { readonly href: string; readonly expiresAt: number },
): string {
  const initialScopeJson = initialScope
    ? JSON.stringify(initialScope).replace(/</g, '\\u003c')
    : 'null';
  return `<script data-od-preview-base-bridge>(function(){
  if (window.__odPreviewBaseBridge) return;
  window.__odPreviewBaseBridge = true;
  var initialScope = ${initialScopeJson};
  function announce(){
    if (!initialScope) return;
    try {
      window.parent.postMessage({
        type: '${PREVIEW_BASE_SCOPE_MESSAGE_TYPE}',
        href: initialScope.href,
        expiresAt: initialScope.expiresAt
      }, '*');
    } catch (_) {}
  }
  window.addEventListener('message', function(ev){
    if (ev.source !== window.parent) return;
    var data = ev && ev.data;
    if (data && data.type === 'od:preview-base-scope-probe') {
      announce();
      return;
    }
    if (!data || data.type !== '${PREVIEW_BASE_UPDATE_MESSAGE_TYPE}' || typeof data.href !== 'string') return;
    try {
      var current = new URL(document.baseURI);
      var next = new URL(data.href, current);
      var sameOrigin = next.origin !== 'null' || current.origin !== 'null'
        ? next.origin === current.origin
        : next.protocol === current.protocol && next.host === current.host;
      if (!sameOrigin) return;
      var parts = next.pathname.split('/');
      if (parts[1] !== 'api' || parts[2] !== 'projects' || !parts[3] || parts[4] !== 'preview' || !parts[5]) return;
      if (next.pathname.charAt(next.pathname.length - 1) !== '/') return;
      var base = document.querySelector('base[data-od-project-preview-base]');
      if (!base) return;
      base.setAttribute('href', next.href);
      window.parent.postMessage({
        type: 'od:preview-base-updated',
        requestId: typeof data.requestId === 'string' ? data.requestId : '',
        href: next.href
      }, '*');
    } catch (_) {}
  });
  announce();
})();</script>`;
}

export type PreviewObservabilityEvent =
  | 'runtime_error'
  | 'unhandled_rejection'
  | 'console_error'
  | 'resource_error'
  | 'white_screen'
  | 'deck_stage_unscaled';

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
  blank_observation_count?: number;
  sample_interval_ms?: number;
  // OPEND-2147 deck stage measurement. The scale travels as an integer
  // per-mille because the normalizer below only admits bounded non-negative
  // integers: a fractional 0.4907 would round to 0 and read as a collapsed
  // stage. `stage_transform` separates "fitted to nothing" from "never fitted
  // at all", which one number cannot express.
  stage_scale_permille?: number;
  stage_transform?: string;
  stage_kind?: string;
  stage_width?: number;
  stage_height?: number;
  canvas_width?: number;
  canvas_height?: number;
  elapsed_ms?: number;
}

const EVENT_NAMES = new Set<PreviewObservabilityEvent>([
  'runtime_error',
  'unhandled_rejection',
  'console_error',
  'resource_error',
  'white_screen',
  'deck_stage_unscaled',
]);

type PreviewStringField =
  | 'message'
  | 'name'
  | 'source_url'
  | 'stack'
  | 'resource_tag'
  | 'resource_url'
  | 'ready_state'
  | 'visibility_state'
  | 'stage_transform'
  | 'stage_kind';

const STRING_FIELD_LIMITS: ReadonlyArray<readonly [PreviewStringField, number]> = [
  ['message', 500],
  ['name', 120],
  ['source_url', 1_000],
  ['stack', 2_000],
  ['resource_tag', 32],
  ['resource_url', 1_000],
  ['ready_state', 32],
  ['visibility_state', 32],
  ['stage_transform', 32],
  ['stage_kind', 32],
];

type PreviewNumberField =
  | 'line'
  | 'column'
  | 'body_child_count'
  | 'visible_element_count'
  | 'viewport_width'
  | 'viewport_height'
  | 'blank_observation_count'
  | 'sample_interval_ms'
  | 'stage_scale_permille'
  | 'stage_width'
  | 'stage_height'
  | 'canvas_width'
  | 'canvas_height'
  | 'elapsed_ms';

const NUMBER_FIELDS: readonly PreviewNumberField[] = [
  'line',
  'column',
  'body_child_count',
  'visible_element_count',
  'viewport_width',
  'viewport_height',
  'blank_observation_count',
  'sample_interval_ms',
  'stage_scale_permille',
  'stage_width',
  'stage_height',
  'canvas_width',
  'canvas_height',
  'elapsed_ms',
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
  var DECK_STAGE_TIMEOUT = ${PREVIEW_DECK_STAGE_TIMEOUT_MS};
  var DECK_STAGE_MIN_SCALE = ${PREVIEW_DECK_STAGE_MIN_SCALE};
  var bridgeStartedAt = Date.now();
  var WHITE_SCREEN_CONFIRMATION_DELAY = ${PREVIEW_WHITE_SCREEN_CONFIRMATION_MS};
  var HOST_STATE_TYPE = ${JSON.stringify(PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE)};
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
  var whiteScreenReported = false;
  var whiteScreenCheckTimer = null;
  var whiteScreenConfirmationTimer = null;
  var hostActive = false;
  function clearWhiteScreenTimers(){
    if (whiteScreenCheckTimer !== null) clearTimeout(whiteScreenCheckTimer);
    if (whiteScreenConfirmationTimer !== null) clearTimeout(whiteScreenConfirmationTimer);
    whiteScreenCheckTimer = null;
    whiteScreenConfirmationTimer = null;
  }
  var deckStageReported = false;
  var deckStageCheckTimer = null;
  function whiteScreenCheckEligible(){
    return hostActive &&
      document.readyState === 'complete' &&
      document.visibilityState === 'visible' &&
      (window.innerWidth || 0) > 1 &&
      (window.innerHeight || 0) > 1;
  }
  function scheduleWhiteScreenCheck(delay){
    if (whiteScreenReported || whiteScreenCheckTimer !== null || whiteScreenConfirmationTimer !== null) return;
    whiteScreenCheckTimer = setTimeout(function(){
      whiteScreenCheckTimer = null;
      checkWhiteScreen();
    }, delay);
  }
  function nudgePreviewLayout(){
    try { document.documentElement && document.documentElement.getBoundingClientRect(); } catch (_) {}
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  }
  function confirmWhiteScreen(){
    whiteScreenConfirmationTimer = null;
    if (whiteScreenReported || !whiteScreenCheckEligible()) return;
    var visible = visiblePaintCount();
    if (visible > 0) return;
    whiteScreenReported = true;
    send('white_screen', {
      ready_state: text(document.readyState, 32),
      visibility_state: text(document.visibilityState, 32),
      body_child_count: document.body ? document.body.children.length : 0,
      visible_element_count: visible,
      viewport_width: Math.max(0, Math.round(window.innerWidth || 0)),
      viewport_height: Math.max(0, Math.round(window.innerHeight || 0)),
      blank_observation_count: 2,
      sample_interval_ms: WHITE_SCREEN_CONFIRMATION_DELAY
    });
  }
  function checkWhiteScreen(){
    if (whiteScreenReported || whiteScreenConfirmationTimer !== null || !whiteScreenCheckEligible()) return;
    var visible = visiblePaintCount();
    if (visible > 0) return;
    whiteScreenConfirmationTimer = setTimeout(confirmWhiteScreen, WHITE_SCREEN_CONFIRMATION_DELAY);
    nudgePreviewLayout();
  }
  function scheduleWhiteScreenCheckWhenEligible(){
    if (whiteScreenCheckEligible()) scheduleWhiteScreenCheck(WHITE_SCREEN_TIMEOUT);
  }
  // OPEND-2147. A deck sizes itself by scaling an authored fixed canvas (the
  // --canvas-w / --canvas-h custom properties the deck templates declare)
  // down to the frame. When that scale resolves to ~0 the slide is still in the
  // DOM and still paints, so visiblePaintCount() stays non-zero and no other
  // probe here fires -- the user simply sees an empty frame. The failure has
  // been observed once in the wild and has so far resisted reproduction, so
  // this reports the measurement instead of guessing a cause: frame size,
  // authored canvas size, resolved scale and document state together are what
  // separate a collapsed stage from a frame legitimately laid out at no width.
  function px(value){
    var parsed = parseFloat(String(value || '').trim());
    return isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }
  function readCanvasPx(style, name){
    return style ? px(style.getPropertyValue(name)) : 0;
  }
  // The scaled canvas is authored in three shapes across this product, and a
  // probe that knows only one is a probe that stays silent on the others:
  //   - <deck-stage> keeps its canvas in shadow DOM, so document.querySelector
  //     cannot see it at all (runtime/deck-stage-fallback.ts).
  //   - the canonical agent skeleton authors #deck-stage / .deck-stage at a
  //     fixed 1920x1080 and scales it inline (prompts/deck-framework.ts). This
  //     is the shape the export path already targets via DECK_STAGE_SELECTOR.
  //   - some design templates use a plain .stage plus --canvas-w / --canvas-h.
  // Size comes from the computed width/height rather than a custom property so
  // all three resolve through one path.
  function resolveDeckCanvas(){
    var host = document.querySelector('deck-stage');
    if (host && host.shadowRoot) {
      var shadowCanvas = host.shadowRoot.querySelector('.canvas');
      if (shadowCanvas) return { el: shadowCanvas, kind: 'shadow-canvas' };
    }
    var authored = document.querySelector('#deck-stage, .deck-stage');
    if (authored) return { el: authored, kind: 'deck-stage' };
    var stage = document.querySelector('.stage');
    if (stage) return { el: stage, kind: 'stage' };
    return null;
  }
  function resolvedScale(style){
    // transform computes to a matrix whose first component is the horizontal
    // scale. none means the artifact never applied its fit at all, which is a
    // different failure from fitting to zero, so it reports -1 rather than
    // being normalized to an innocent-looking 1.
    var raw = String(style && style.transform || '').trim();
    if (!raw || raw === 'none') return -1;
    var open = raw.indexOf('(');
    var close = raw.lastIndexOf(')');
    if (open < 0 || close <= open) return -1;
    var first = parseFloat(raw.slice(open + 1, close).split(',')[0]);
    return isFinite(first) ? first : -1;
  }
  function checkDeckStage(){
    if (deckStageReported || !whiteScreenCheckEligible()) return;
    var found = resolveDeckCanvas();
    if (!found) return;
    var stage = found.el;
    var rootStyle, stageStyle, rect;
    try {
      rootStyle = window.getComputedStyle(document.documentElement);
      stageStyle = window.getComputedStyle(stage);
      rect = stage.getBoundingClientRect();
    } catch (_) { return; }
    // .stage is not a deck marker -- plain pages use that class too (see
    // design-templates/social-carousel, a max-width: 1280px article shell with
    // no fit transform). Only the shapes that ARE markers may treat their
    // computed width as an authored canvas; the generic fallback has to declare
    // one explicitly, or it is not a fixed-canvas deck and there is no fit
    // contract to violate.
    var declaredW = readCanvasPx(rootStyle, '--canvas-w') || readCanvasPx(stageStyle, '--canvas-w');
    var declaredH = readCanvasPx(rootStyle, '--canvas-h') || readCanvasPx(stageStyle, '--canvas-h');
    var markedDeck = found.kind !== 'stage';
    var canvasW = declaredW || (markedDeck ? px(stageStyle.width) : 0);
    var canvasH = declaredH || (markedDeck ? px(stageStyle.height) : 0);
    var frameW = Math.max(0, Math.round(window.innerWidth || 0));
    var frameH = Math.max(0, Math.round(window.innerHeight || 0));
    // Only a fixed canvas has a fit contract to violate. A wrapper sized to the
    // viewport (a 100vw/100vh .stage, which some templates ship) legitimately
    // carries no transform, and reporting those would bury the real signal.
    // A wrapper that tracks the viewport tracks it in BOTH dimensions. Comparing
    // width alone skipped a real failure: a 1920x1080 canvas in a 1920x530 frame
    // still has to scale (height constrains it), so an absent transform there is
    // the defect, not an exemption.
    var viewportSized = canvasH > 0
      && Math.abs(canvasW - frameW) <= 1
      && Math.abs(canvasH - frameH) <= 1;
    if (canvasW < 640 || viewportSized) return;
    var scale = resolvedScale(stageStyle);
    // Deliberately does NOT latch on a healthy sample. OPEND-2147 is a race, so
    // "fitted correctly at the first eligible check" is not a verdict for the
    // life of the document: a stage can fit and collapse later in the same one,
    // and resize / visibilitychange keep re-scheduling this check. The
    // white-screen probe above draws the same distinction -- it returns on a
    // healthy sample and only latches once it has actually reported.
    if (scale > DECK_STAGE_MIN_SCALE) return;
    deckStageReported = true;
    send('deck_stage_unscaled', {
      stage_kind: found.kind,
      stage_transform: scale < 0 ? 'none' : 'matrix',
      stage_scale_permille: scale < 0 ? 0 : Math.round(scale * 1000),
      stage_width: Math.round(rect.width),
      stage_height: Math.round(rect.height),
      canvas_width: canvasW,
      canvas_height: canvasH,
      viewport_width: frameW,
      viewport_height: frameH,
      ready_state: text(document.readyState, 32),
      visibility_state: text(document.visibilityState, 32),
      elapsed_ms: Math.max(0, Date.now() - bridgeStartedAt)
    });
  }
  function scheduleDeckStageCheckWhenEligible(){
    if (deckStageReported || deckStageCheckTimer !== null || !whiteScreenCheckEligible()) return;
    deckStageCheckTimer = setTimeout(function(){
      deckStageCheckTimer = null;
      checkDeckStage();
    }, DECK_STAGE_TIMEOUT);
  }
  // One lifecycle for both settled checks: they answer different questions
  // about the same moment -- "did anything paint" and "did the deck fit" -- and
  // must not drift apart on when they are allowed to run.
  function scheduleSettledChecksWhenEligible(){
    scheduleWhiteScreenCheckWhenEligible();
    scheduleDeckStageCheckWhenEligible();
  }
  window.addEventListener('message', function(event){
    var data = event && event.data;
    if (!data || data.type !== HOST_STATE_TYPE || typeof data.active !== 'boolean') return;
    if (hostActive === data.active) return;
    hostActive = data.active;
    if (!hostActive) {
      clearWhiteScreenTimers();
      if (deckStageCheckTimer !== null) {
        clearTimeout(deckStageCheckTimer);
        deckStageCheckTimer = null;
      }
      return;
    }
    scheduleSettledChecksWhenEligible();
  });
  if (document.readyState === 'complete') scheduleSettledChecksWhenEligible();
  else window.addEventListener('load', scheduleSettledChecksWhenEligible, { once: true });
  document.addEventListener('visibilitychange', scheduleSettledChecksWhenEligible);
  window.addEventListener('resize', scheduleSettledChecksWhenEligible);
  setTimeout(scheduleSettledChecksWhenEligible, WHITE_SCREEN_TIMEOUT * 2);
})();
</script>`;
}
