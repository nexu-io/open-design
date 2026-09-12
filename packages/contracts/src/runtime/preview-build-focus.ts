/** Sandbox preview protocol. The host sends write text and an activity title;
 * the frame resolves a real module and reports its viewport rectangle. Browser
 * code is serialized for injection by the daemon; this module stays runtime-pure.
 * Host consumers validate event.source because sandbox origins are opaque.
 */

export const PREVIEW_BUILD_FOCUS_BRIDGE_MARKER = 'data-od-preview-build-focus';
export const PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION = 1;
/** Frame → host, once the bridge can accept requests. */
export const PREVIEW_BUILD_FOCUS_READY_TYPE = 'od:preview-build-focus-ready';
/** Host → frame: "find this text". */
export const PREVIEW_BUILD_FOCUS_REQUEST_TYPE = 'od:preview-build-focus';
/** Frame → host: where it landed. */
export const PREVIEW_BUILD_FOCUS_RESULT_TYPE = 'od:preview-build-focus-rect';
/** Frame → host, unprompted after each load: the page's top-level parts. */
export const PREVIEW_BUILD_FOCUS_SECTIONS_TYPE = 'od:preview-build-focus-sections';

/** Anchors longer than this are not more precise, only more brittle. */
export const PREVIEW_BUILD_FOCUS_MAX_ANCHOR_CHARS = 96;
/** Text nodes the bridge will walk before giving up on a match. */
export const PREVIEW_BUILD_FOCUS_MAX_TEXT_NODES = 4000;
/** Elements the end-of-document fallback will consider. */
export const PREVIEW_BUILD_FOCUS_MAX_FALLBACK_ELEMENTS = 2000;
/** A page with more parts than this is a list, and a cursor tour of it would
 *  outlast the run it is describing. */
export const PREVIEW_BUILD_FOCUS_MAX_SECTIONS = 24;
/** A section label is a caption, not a paragraph. */
export const PREVIEW_BUILD_FOCUS_MAX_LABEL_CHARS = 40;
/** Keys are built by the frame from index, tag and label; nothing needs more. */
export const PREVIEW_BUILD_FOCUS_MAX_SECTION_KEY_CHARS = 96;
/** Coordinates outside this range are a bug or a hostile page, not a layout. */
const MAX_COORDINATE = 20_000;

export interface PreviewBuildFocusRequest {
  type: typeof PREVIEW_BUILD_FOCUS_REQUEST_TYPE;
  version: typeof PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION;
  /** Echoed back, so the host can drop results for a request it has replaced. */
  requestId: string;
  /** Text to locate. Null does not imply an arbitrary fallback. */
  anchor: string | null;
  /** A section key from the frame's own broadcast. Takes precedence over
   *  `anchor` when set — the host is pointing at a PART of the page, not at a
   *  run of text inside it. */
  section: string | null;
  title?: string | null;
}

/** One top-level part of the previewed page, as the frame sees it. */
export interface PreviewSection {
  /** Opaque to the host: index, tag and label, built by the frame. */
  key: string;
  /** What to call this part on screen — its heading, id, or tag. */
  label: string;
}

export interface PreviewBuildFocusSections {
  type: typeof PREVIEW_BUILD_FOCUS_SECTIONS_TYPE;
  version: typeof PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION;
  sections: PreviewSection[];
}

export interface PreviewBuildFocusResult {
  type: typeof PREVIEW_BUILD_FOCUS_RESULT_TYPE;
  version: typeof PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION;
  requestId: string;
  /** False when nothing could be located — the host then hides the cursor. */
  found: boolean;
  label?: string;
  /** The located box, in the FRAME's viewport CSS px. */
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PreviewBuildFocusReady {
  type: typeof PREVIEW_BUILD_FOCUS_READY_TYPE;
  version: typeof PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < -MAX_COORDINATE || value > MAX_COORDINATE) {
    return value < 0 ? -MAX_COORDINATE : MAX_COORDINATE;
  }
  return value;
}

/** True for a well-formed ready notice from a preview bridge. */
export function isPreviewBuildFocusReady(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === PREVIEW_BUILD_FOCUS_READY_TYPE &&
    message.version === PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION
  );
}

/**
 * Validate a frame's result and rebuild it as a fresh, bounded object. The
 * payload comes from generated, untrusted page code, so nothing from it is ever
 * passed through by reference.
 */
export function parsePreviewBuildFocusResult(value: unknown): PreviewBuildFocusResult | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type !== PREVIEW_BUILD_FOCUS_RESULT_TYPE) return null;
  if (message.version !== PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION) return null;
  if (typeof message.requestId !== 'string' || !message.requestId) return null;
  if (typeof message.found !== 'boolean') return null;
  const x = finiteNumber(message.x);
  const y = finiteNumber(message.y);
  const width = finiteNumber(message.width);
  const height = finiteNumber(message.height);
  const viewportWidth = finiteNumber(message.viewportWidth);
  const viewportHeight = finiteNumber(message.viewportHeight);
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    viewportWidth === null ||
    viewportHeight === null
  ) {
    return null;
  }
  return {
    type: PREVIEW_BUILD_FOCUS_RESULT_TYPE,
    version: PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION,
    requestId: message.requestId.slice(0, 64),
    found: message.found,
    ...(typeof message.label === 'string' ? { label: message.label.slice(0, 40) } : {}),
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
    viewportWidth: Math.max(0, viewportWidth),
    viewportHeight: Math.max(0, viewportHeight),
  };
}

/**
 * Validate a frame's section broadcast and rebuild it as fresh, bounded data.
 * Labels are page content — generated, untrusted text — so they are capped and
 * copied, never passed through.
 */
export function parsePreviewBuildFocusSections(value: unknown): PreviewSection[] | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type !== PREVIEW_BUILD_FOCUS_SECTIONS_TYPE) return null;
  if (message.version !== PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION) return null;
  if (!Array.isArray(message.sections)) return null;
  const sections: PreviewSection[] = [];
  for (const entry of message.sections) {
    if (sections.length >= PREVIEW_BUILD_FOCUS_MAX_SECTIONS) break;
    if (!entry || typeof entry !== 'object') continue;
    const section = entry as Record<string, unknown>;
    if (typeof section.key !== 'string' || !section.key) continue;
    if (typeof section.label !== 'string') continue;
    sections.push({
      key: section.key.slice(0, PREVIEW_BUILD_FOCUS_MAX_SECTION_KEY_CHARS),
      label: section.label.slice(0, PREVIEW_BUILD_FOCUS_MAX_LABEL_CHARS),
    });
  }
  return sections;
}

/** Build a request the host can post into a preview frame. */
export function previewBuildFocusRequest(
  requestId: string,
  anchor: string | null,
  section: string | null = null,
  title?: string | null,
): PreviewBuildFocusRequest {
  const trimmed = typeof anchor === 'string' ? anchor.trim() : '';
  const key = typeof section === 'string' ? section.trim() : '';
  return {
    type: PREVIEW_BUILD_FOCUS_REQUEST_TYPE,
    version: PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION,
    requestId,
    ...(title ? { title: title.slice(0, 96) } : {}),
    anchor: trimmed ? trimmed.slice(0, PREVIEW_BUILD_FOCUS_MAX_ANCHOR_CHARS) : null,
    section: key ? key.slice(0, PREVIEW_BUILD_FOCUS_MAX_SECTION_KEY_CHARS) : null,
  };
}

/**
 * Locates the host's anchor text, scrolls it into view, and reports its box.
 *
 * The anchor is model output, so it is only ever compared as TEXT — never fed
 * to `querySelector`, where it would throw or match something unrelated.
 */
export function buildPreviewBuildFocusBridge(): string {
  return `<script ${PREVIEW_BUILD_FOCUS_BRIDGE_MARKER}>
(function(){
  if (window.__odPreviewBuildFocus) return;
  window.__odPreviewBuildFocus = true;
  var READY = ${JSON.stringify(PREVIEW_BUILD_FOCUS_READY_TYPE)};
  var REQUEST = ${JSON.stringify(PREVIEW_BUILD_FOCUS_REQUEST_TYPE)};
  var RESULT = ${JSON.stringify(PREVIEW_BUILD_FOCUS_RESULT_TYPE)};
  var VERSION = ${PREVIEW_BUILD_FOCUS_PROTOCOL_VERSION};
  var SECTIONS = ${JSON.stringify(PREVIEW_BUILD_FOCUS_SECTIONS_TYPE)};
  var MAX_TEXT_NODES = ${PREVIEW_BUILD_FOCUS_MAX_TEXT_NODES};
  var MAX_SECTIONS = ${PREVIEW_BUILD_FOCUS_MAX_SECTIONS};
  var MAX_LABEL = ${PREVIEW_BUILD_FOCUS_MAX_LABEL_CHARS};
  var lastRequestId = null;
  var lastAnchor = null;
  var lastSection = null;
  var lastTitle = null;
  var activeTarget = null;
  var pending = false;
  function reduced(){
    try {
      return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  }
  function collapse(value){
    return String(value || '').replace(/\\s+/g, ' ').trim();
  }
  function findByText(anchor){
    var needle = collapse(anchor);
    if (!needle || !document.body) return null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var seen = 0;
    var loose = null;
    while (walker.nextNode() && seen < MAX_TEXT_NODES) {
      seen++;
      var node = walker.currentNode;
      var raw = node.nodeValue || '';
      if (!raw) continue;
      var parent = node.parentElement;
      if (!parent || skippable(parent) || !parent.getBoundingClientRect().width) continue;
      if (raw.indexOf(anchor) !== -1) return parent;
      if (!loose && collapse(raw).indexOf(needle) !== -1) loose = parent;
    }
    return loose;
  }
  function skippable(el){
    var tag = String(el && el.tagName || '').toLowerCase();
    return tag === 'script' || tag === 'style' || tag === 'template' ||
      tag === 'link' || tag === 'meta' || tag === 'noscript' || tag === 'title';
  }
  // The page's top-level parts, in document order. A body that holds one
  // wrapper (a <main>, a layout div) is described by that wrapper's children —
  // otherwise every page would report a single section covering all of it.
  function sectionRoots(){
    if (!document.body) return [];
    var semantic = document.body.querySelectorAll('section, article, [data-slide], .slide');
    if (semantic.length) return Array.prototype.slice.call(semantic, 0, MAX_SECTIONS);
    var parent = document.body;
    for (var depth = 0; depth < 3; depth++) {
      var kids = [];
      var children = parent.children || [];
      for (var i = 0; i < children.length; i++) {
        if (!skippable(children[i])) kids.push(children[i]);
      }
      if (kids.length === 0) return [];
      var only = kids.length === 1 ? kids[0] : null;
      if (!only || !only.children || only.children.length < 2) return kids;
      parent = only;
    }
    return [];
  }
  function labelFor(el, index){
    var heading = null;
    try { heading = el.querySelector('h1, h2, h3, h4'); } catch (_) {}
    var text = heading ? collapse(heading.textContent) : '';
    if (!text && el.id) text = collapse(el.id);
    if (!text && el.getAttribute) text = collapse(el.getAttribute('aria-label'));
    if (!text) text = collapse(el.tagName).toLowerCase() + ' ' + (index + 1);
    return text.slice(0, MAX_LABEL);
  }
  // Keyed by position, tag AND label: a part whose heading was just rewritten
  // is, for the host's purposes, a part that just landed.
  function sectionList(){
    var roots = sectionRoots();
    var out = [];
    for (var i = 0; i < roots.length && out.length < MAX_SECTIONS; i++) {
      var el = roots[i];
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      var box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      if (!collapse(el.innerText || el.textContent) && !el.matches('img, svg, canvas, video') && !el.querySelector('img, svg, canvas, video')) continue;
      var label = labelFor(el, i);
      out.push({
        el: el,
        key: i + '|' + collapse(el.tagName).toLowerCase() + '|' + label,
        label: label
      });
    }
    return out;
  }
  function postSections(){
    var list = sectionList();
    var plain = [];
    for (var i = 0; i < list.length; i++) plain.push({ key: list[i].key, label: list[i].label });
    try {
      window.parent.postMessage({ type: SECTIONS, version: VERSION, sections: plain }, '*');
    } catch (_) {}
  }
  function findSection(key){
    var list = sectionList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i].el;
    }
    return null;
  }
  function post(requestId, found, el){
    var box = found && el && typeof el.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : null;
    try {
      window.parent.postMessage({
        type: RESULT,
        version: VERSION,
        requestId: requestId,
        found: Boolean(found && box),
        label: el ? labelFor(el, 0) : '',
        x: box ? box.left : 0,
        y: box ? box.top : 0,
        width: box ? box.width : 0,
        height: box ? box.height : 0,
        viewportWidth: window.innerWidth || 0,
        viewportHeight: window.innerHeight || 0
      }, '*');
    } catch (_) {}
  }
  function locate(requestId, anchor, section, title){
    var target = anchor ? findByText(anchor) : null;
    var list = sectionList();
    if (target) {
      target = target.closest('section, article, [data-slide], .slide') || target;
      for (var i = 0; i < list.length; i++) {
        if (list[i].el === target || (!target.matches('section, article, [data-slide], .slide') && list[i].el.contains(target))) { target = list[i].el; break; }
      }
    }
    if (!target && section) target = findSection(section);
    if (!target && title) {
      var matches = list.filter(function(item){
        return item.label.length > 3 && (collapse(title).indexOf(item.label) !== -1 || item.label.indexOf(collapse(title)) !== -1);
      });
      if (matches.length === 1) target = matches[0].el;
    }
    if (!target) { activeTarget = null; post(requestId, false, null); return; }
    if (target !== activeTarget) {
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (_) {}
    }
    activeTarget = target;
    requestAnimationFrame(function(){ post(requestId, true, target); });
  }
  function measure(){
    if (pending || !lastRequestId) return;
    pending = true;
    requestAnimationFrame(function(){
      pending = false;
      post(lastRequestId, Boolean(activeTarget && activeTarget.isConnected), activeTarget);
    });
  }
  window.addEventListener('scroll', measure, true);
  window.addEventListener('message', function(event){
    if (event.source !== window.parent) return;
    var data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== REQUEST || data.version !== VERSION) return;
    if (typeof data.requestId !== 'string' || !data.requestId) return;
    lastRequestId = data.requestId;
    lastAnchor = typeof data.anchor === 'string' ? data.anchor : null;
    lastSection = typeof data.section === 'string' ? data.section : null;
    lastTitle = typeof data.title === 'string' ? data.title.slice(0, 96) : null;
    locate(lastRequestId, lastAnchor, lastSection, lastTitle);
  });
  window.addEventListener('resize', measure);
  function ready(){
    try { window.parent.postMessage({ type: READY, version: VERSION }, '*'); } catch (_) {}
    // One frame later: at DOMContentLoaded the parts exist but have no boxes
    // yet, and a section with no box is not a section the cursor can visit.
    requestAnimationFrame(postSections);
    if (document.body && !window.__odBuildObserved) {
      window.__odBuildObserved = true;
      new MutationObserver(function(){
        postSections();
        if (lastRequestId) locate(lastRequestId, lastAnchor, lastSection, lastTitle);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(document.body);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
  window.addEventListener('load', ready);
})();
</script>`;
}
