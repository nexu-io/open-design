/**
 * Versioned host/runtime protocol for Deck full-screen presentation.
 *
 * Presentation used to be a build-time property of a *rebuilt* document: the
 * host re-rendered the deck source through `buildSrcdoc({ hideDeckChrome,
 * deckClickNavigation })` and the live document — JS heap, canvases, timers,
 * closures — was thrown away. This module makes presentation a runtime switch
 * on the document that is already running at its real project URL.
 *
 * Two effects are in scope, and they are exactly the two the build-time path
 * applied: hiding deck chrome (light DOM plus the `<deck-stage>` shadow DOM),
 * and half-screen click navigation. Slide navigation itself stays with the
 * host, which already drives whichever protocol the artifact was detected to
 * implement; the runtime only reports the intent.
 *
 * Keep this module browser-API free. It owns bounded wire shapes, the shared
 * CSS payloads, and the injected script text — nothing that touches a DOM.
 */

export const DECK_PRESENTATION_PROTOCOL_VERSION = 1 as const;

/** `odPreviewBridge=` token the host appends to request the bridge. */
export const DECK_PRESENTATION_BRIDGE_TOKEN = 'presentation' as const;

/** Accepted spellings of the bridge token, mirroring the sibling bridges. */
export const DECK_PRESENTATION_BRIDGE_TOKENS = [
  'presentation',
  'present',
  'deck-presentation',
] as const;

/** Attribute that makes the injected script identifiable and de-duplicable. */
export const DECK_PRESENTATION_BRIDGE_MARKER = 'data-od-deck-presentation-bridge' as const;

export const DECK_PRESENTATION_READY_MESSAGE_TYPE = 'od:deck-presentation-ready' as const;
export const DECK_PRESENTATION_SET_MESSAGE_TYPE = 'od:deck-presentation' as const;
export const DECK_PRESENTATION_APPLIED_MESSAGE_TYPE = 'od:deck-presentation-applied' as const;
export const DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE = 'od:deck-presentation-navigate' as const;

export const DECK_PRESENTATION_CAPABILITIES = [
  'chrome-hiding',
  'click-navigation',
] as const;

export type DeckPresentationCapability = typeof DECK_PRESENTATION_CAPABILITIES[number];

export type DeckPresentationDirection = 'prev' | 'next';

/**
 * Chrome that a deck renders for its own in-page controls. Presentation hides
 * it; the surrounding overlay supplies the equivalent affordances instead.
 *
 * Single source of truth: `@open-design/preview-runtime`'s build-time srcDoc
 * path and this runtime bridge both read it from here, so the two generations
 * of presentation can never drift into hiding different elements.
 */
export const DECK_CHROME_HIDE_CSS = `.deck-counter,
.deck-hint,
.deck-nav,
.deck-floating-nav,
.deck-floating-reset,
.deck-controls,
.slide-nav,
.slides-nav,
.slide-controls,
.slide-counter,
.presentation-nav,
.presentation-controls,
[role="navigation"][aria-label*="Deck"],
[role="navigation"][aria-label*="deck"],
[role="navigation"][aria-label*="Slide"],
[role="navigation"][aria-label*="slide"],
[data-deck-nav],
[data-slide-nav] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}`;

/**
 * Runtime-managed decks render their controls inside the `<deck-stage>` shadow
 * root, where the document-level stylesheet above cannot reach them.
 */
export const DECK_STAGE_SHADOW_CHROME_HIDE_CSS =
  '.overlay,.tapzones{display:none!important;visibility:hidden!important;pointer-events:none!important;}';

export const DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID = 'od-deck-stage-shadow-chrome-hidden';

/** Attribute stamped on the document-level chrome-hiding stylesheet. */
export const DECK_CHROME_HIDE_STYLE_MARKER = 'data-od-deck-chrome-hidden';

export interface DeckPresentationDocumentIdentity {
  sessionId: string;
  documentVersion: string;
}

interface DeckPresentationMessageBase extends DeckPresentationDocumentIdentity {
  protocolVersion: typeof DECK_PRESENTATION_PROTOCOL_VERSION;
}

/**
 * Runtime -> host. Announced once the document is parsed, so the host learns
 * the bridge exists without having to guess from a missing receipt.
 */
export interface DeckPresentationReadyMessage {
  type: typeof DECK_PRESENTATION_READY_MESSAGE_TYPE;
  protocolVersion: typeof DECK_PRESENTATION_PROTOCOL_VERSION;
  capabilities: DeckPresentationCapability[];
}

/** Host -> runtime. Enter or leave presentation on the live document. */
export interface DeckPresentationSetMessage extends DeckPresentationMessageBase {
  type: typeof DECK_PRESENTATION_SET_MESSAGE_TYPE;
  presenting: boolean;
  /** Host-owned monotonic request number, echoed back on the receipt. */
  revision: number;
}

/**
 * Runtime -> host receipt. `presenting` is the state the runtime actually
 * holds; the remaining fields are measured, not assumed, so the host can tell
 * "applied" from "asked for" instead of trusting a fire-and-forget send.
 */
export interface DeckPresentationAppliedMessage extends DeckPresentationMessageBase {
  type: typeof DECK_PRESENTATION_APPLIED_MESSAGE_TYPE;
  revision: number;
  presenting: boolean;
  chromeHidden: boolean;
  clickNavigation: boolean;
  deckStageCount: number;
  deckStagesHidden: number;
}

/**
 * Runtime -> host. A half-screen click while presenting. The runtime does not
 * navigate: the host owns whichever navigation protocol this artifact was
 * detected to implement.
 */
export interface DeckPresentationNavigateMessage extends DeckPresentationMessageBase {
  type: typeof DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE;
  revision: number;
  direction: DeckPresentationDirection;
}

export type DeckPresentationMessage =
  | DeckPresentationReadyMessage
  | DeckPresentationSetMessage
  | DeckPresentationAppliedMessage
  | DeckPresentationNavigateMessage;

const MAX_IDENTITY_LENGTH = 200;
const CAPABILITY_SET = new Set<string>(DECK_PRESENTATION_CAPABILITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_IDENTITY_LENGTH
    && value.trim() === value;
}

function parseRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseCapabilities(value: unknown): DeckPresentationCapability[] | null {
  if (!Array.isArray(value) || value.length > DECK_PRESENTATION_CAPABILITIES.length) return null;
  const requested = new Set<string>();
  for (const capability of value) {
    if (typeof capability !== 'string' || !CAPABILITY_SET.has(capability)) return null;
    requested.add(capability);
  }
  return DECK_PRESENTATION_CAPABILITIES.filter((capability) => requested.has(capability));
}

export function parseDeckPresentationMessage(value: unknown): DeckPresentationMessage | null {
  if (!isRecord(value)) return null;
  if (value.protocolVersion !== DECK_PRESENTATION_PROTOCOL_VERSION) return null;

  if (value.type === DECK_PRESENTATION_READY_MESSAGE_TYPE) {
    const capabilities = parseCapabilities(value.capabilities);
    if (capabilities === null) return null;
    return {
      type: DECK_PRESENTATION_READY_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      capabilities,
    };
  }

  if (!isBoundedIdentity(value.sessionId) || !isBoundedIdentity(value.documentVersion)) return null;
  const revision = parseRevision(value.revision);
  if (revision === null) return null;
  const base = {
    protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    documentVersion: value.documentVersion,
    revision,
  } as const;

  if (value.type === DECK_PRESENTATION_SET_MESSAGE_TYPE) {
    if (typeof value.presenting !== 'boolean') return null;
    return { type: DECK_PRESENTATION_SET_MESSAGE_TYPE, ...base, presenting: value.presenting };
  }

  if (value.type === DECK_PRESENTATION_APPLIED_MESSAGE_TYPE) {
    const deckStageCount = parseCount(value.deckStageCount);
    const deckStagesHidden = parseCount(value.deckStagesHidden);
    if (
      typeof value.presenting !== 'boolean'
      || typeof value.chromeHidden !== 'boolean'
      || typeof value.clickNavigation !== 'boolean'
      || deckStageCount === null
      || deckStagesHidden === null
      || deckStagesHidden > deckStageCount
    ) return null;
    return {
      type: DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
      ...base,
      presenting: value.presenting,
      chromeHidden: value.chromeHidden,
      clickNavigation: value.clickNavigation,
      deckStageCount,
      deckStagesHidden,
    };
  }

  if (value.type === DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE) {
    if (value.direction !== 'prev' && value.direction !== 'next') return null;
    return { type: DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE, ...base, direction: value.direction };
  }

  return null;
}

export function createDeckPresentationSetMessage(
  input: DeckPresentationDocumentIdentity & { presenting: boolean; revision: number },
): DeckPresentationSetMessage {
  if (!isBoundedIdentity(input.sessionId) || !isBoundedIdentity(input.documentVersion)) {
    throw new TypeError('deck presentation document identity must be a non-empty bounded string');
  }
  const revision = parseRevision(input.revision);
  if (revision === null) {
    throw new TypeError('deck presentation revision must be a positive safe integer');
  }
  return {
    type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
    protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    documentVersion: input.documentVersion,
    presenting: !!input.presenting,
    revision,
  };
}

/**
 * A receipt only counts for the document the host believes it is driving. The
 * ready beacon carries no identity, so it never matches.
 */
export function deckPresentationMessageMatchesDocument(
  message: DeckPresentationMessage | null,
  identity: DeckPresentationDocumentIdentity,
): boolean {
  return message !== null
    && message.type !== DECK_PRESENTATION_READY_MESSAGE_TYPE
    && message.sessionId === identity.sessionId
    && message.documentVersion === identity.documentVersion;
}

/**
 * Build the injected presentation bridge.
 *
 * Everything is deferred until the host negotiates: the script only registers
 * a message listener at parse time, so it is safe to inject before authored
 * startup, and leaving presentation removes every artifact it installed.
 */
export function buildDeckPresentationBridge(): string {
  return `<script ${DECK_PRESENTATION_BRIDGE_MARKER}>(function(){
  if (window.__odDeckPresentationBridge) return;
  window.__odDeckPresentationBridge = true;
  var PROTOCOL_VERSION = ${DECK_PRESENTATION_PROTOCOL_VERSION};
  var READY_TYPE = ${JSON.stringify(DECK_PRESENTATION_READY_MESSAGE_TYPE)};
  var SET_TYPE = ${JSON.stringify(DECK_PRESENTATION_SET_MESSAGE_TYPE)};
  var APPLIED_TYPE = ${JSON.stringify(DECK_PRESENTATION_APPLIED_MESSAGE_TYPE)};
  var NAVIGATE_TYPE = ${JSON.stringify(DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE)};
  var CAPABILITIES = ${JSON.stringify(DECK_PRESENTATION_CAPABILITIES)};
  var CHROME_MARKER = ${JSON.stringify(DECK_CHROME_HIDE_STYLE_MARKER)};
  var CHROME_CSS = ${JSON.stringify(DECK_CHROME_HIDE_CSS)};
  var SHADOW_STYLE_ID = ${JSON.stringify(DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID)};
  var SHADOW_CSS = ${JSON.stringify(DECK_STAGE_SHADOW_CHROME_HIDE_CSS)};
  var presenting = false;
  var identity = null;
  var revision = 0;
  var chromeStyle = null;
  var stageObserver = null;
  var clickBound = false;

  function post(message){
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(message, '*');
    } catch (_) {}
  }
  function stamped(type, extra){
    var message = { type: type, protocolVersion: PROTOCOL_VERSION };
    if (identity) {
      message.sessionId = identity.sessionId;
      message.documentVersion = identity.documentVersion;
      message.revision = revision;
    }
    for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) message[key] = extra[key];
    return message;
  }

  // --- deck chrome (light DOM) ---------------------------------------------
  function styleHost(){ return document.head || document.documentElement; }
  function applyChromeStyle(){
    try {
      if (chromeStyle && chromeStyle.parentNode) return true;
      var existing = document.querySelector('style[' + CHROME_MARKER + ']');
      if (existing) { chromeStyle = existing; return true; }
      var host = styleHost();
      if (!host) return false;
      var style = document.createElement('style');
      style.setAttribute(CHROME_MARKER, '');
      style.textContent = CHROME_CSS;
      host.appendChild(style);
      chromeStyle = style;
      return true;
    } catch (_) { return false; }
  }
  function removeChromeStyle(){
    try {
      var nodes = document.querySelectorAll('style[' + CHROME_MARKER + ']');
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
    } catch (_) {}
    chromeStyle = null;
  }

  // --- deck chrome (deck-stage shadow DOM) ---------------------------------
  function deckStages(){
    try { return document.querySelectorAll('deck-stage'); } catch (_) { return []; }
  }
  function hideStage(stage){
    try {
      if (!stage || !stage.shadowRoot) return false;
      if (stage.shadowRoot.getElementById(SHADOW_STYLE_ID)) return true;
      var style = document.createElement('style');
      style.id = SHADOW_STYLE_ID;
      style.textContent = SHADOW_CSS;
      stage.shadowRoot.appendChild(style);
      return true;
    } catch (_) { return false; }
  }
  function showStage(stage){
    try {
      if (!stage || !stage.shadowRoot) return;
      var style = stage.shadowRoot.getElementById(SHADOW_STYLE_ID);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    } catch (_) {}
  }
  function measureStages(){
    var stages = deckStages();
    var hidden = 0;
    for (var i = 0; i < stages.length; i += 1) {
      try {
        if (stages[i].shadowRoot && stages[i].shadowRoot.getElementById(SHADOW_STYLE_ID)) hidden += 1;
      } catch (_) {}
    }
    return { count: stages.length, hidden: hidden };
  }
  // A deck-stage upgrades asynchronously, so a stage present now may not have
  // a shadow root yet. Keep retrying while presenting, exactly like the
  // build-time injection did, and stop the moment presentation ends.
  function sweepStages(){
    if (!presenting) return { count: 0, hidden: 0 };
    var stages = deckStages();
    var pending = false;
    for (var i = 0; i < stages.length; i += 1) if (!hideStage(stages[i])) pending = true;
    if (pending) {
      try { setTimeout(sweepStages, 50); } catch (_) {}
    }
    return measureStages();
  }
  function startStageWatch(){
    sweepStages();
    if (stageObserver || typeof MutationObserver === 'undefined') return;
    try {
      stageObserver = new MutationObserver(function(){ sweepStages(); });
      stageObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) { stageObserver = null; }
  }
  function stopStageWatch(){
    if (stageObserver) {
      try { stageObserver.disconnect(); } catch (_) {}
      stageObserver = null;
    }
    var stages = deckStages();
    for (var i = 0; i < stages.length; i += 1) showStage(stages[i]);
  }

  // --- half-screen click navigation ----------------------------------------
  function isInteractiveClickTarget(target){
    while (target && target !== document.body && target !== document.documentElement) {
      if (!target.tagName) break;
      var tag = String(target.tagName || '').toUpperCase();
      if (
        tag === 'A' ||
        tag === 'BUTTON' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'SUMMARY' ||
        tag === 'LABEL' ||
        tag === 'IFRAME' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'button' ||
        target.getAttribute('role') === 'link'
      ) {
        return true;
      }
      target = target.parentElement;
    }
    return false;
  }
  function onClick(ev){
    if (!presenting) return;
    if (ev.defaultPrevented) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
    if (isInteractiveClickTarget(ev.target)) return;
    ev.preventDefault();
    post(stamped(NAVIGATE_TYPE, {
      direction: ev.clientX < window.innerWidth / 2 ? 'prev' : 'next'
    }));
  }
  function bindClick(){
    if (clickBound) return;
    document.addEventListener('click', onClick, true);
    clickBound = true;
  }
  function unbindClick(){
    if (!clickBound) return;
    document.removeEventListener('click', onClick, true);
    clickBound = false;
  }

  function applyPresentation(next){
    presenting = !!next;
    if (presenting) {
      var chromeHidden = applyChromeStyle();
      startStageWatch();
      bindClick();
      var applied = measureStages();
      return {
        presenting: true,
        chromeHidden: chromeHidden,
        clickNavigation: clickBound,
        deckStageCount: applied.count,
        deckStagesHidden: applied.hidden
      };
    }
    unbindClick();
    stopStageWatch();
    removeChromeStyle();
    var restored = measureStages();
    return {
      presenting: false,
      chromeHidden: !!document.querySelector('style[' + CHROME_MARKER + ']'),
      clickNavigation: clickBound,
      deckStageCount: restored.count,
      deckStagesHidden: restored.hidden
    };
  }

  window.addEventListener('message', function(ev){
    if (window.parent !== window && ev.source !== window.parent) return;
    var data = ev && ev.data;
    if (!data || data.type !== SET_TYPE) return;
    if (data.protocolVersion !== PROTOCOL_VERSION) return;
    if (typeof data.sessionId !== 'string' || !data.sessionId) return;
    if (typeof data.documentVersion !== 'string' || !data.documentVersion) return;
    if (typeof data.presenting !== 'boolean') return;
    if (typeof data.revision !== 'number' || !isFinite(data.revision) || data.revision <= 0) return;
    identity = { sessionId: data.sessionId, documentVersion: data.documentVersion };
    revision = data.revision;
    post(stamped(APPLIED_TYPE, applyPresentation(data.presenting)));
  });

  function announce(){ post({ type: READY_TYPE, protocolVersion: PROTOCOL_VERSION, capabilities: CAPABILITIES }); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce, { once: true });
  } else {
    announce();
  }
})();</script>`;
}
