/**
 * Preview iframe bridges — shared between the web's srcDoc transport
 * (`apps/web/src/runtime/srcdoc.ts`) and the daemon's URL-load route
 * (`apps/daemon/src/project-routes.ts`).
 *
 * Issue #2143 — comment / inspect / draw / edit / tweaks toggles must not
 * tear down the iframe. The selection bridge has to be present in BOTH
 * transports so URL-load mode (chosen for multi-file artifacts) can host
 * comment selection without flipping to srcDoc.
 *
 * Each export is a self-contained `<script>` or `<style>` HTML fragment.
 * Inject as-is via insertAdjacentHTML / string concat. All scripts are
 * idempotent via window-level install guards and `data-*` markers.
 */

/**
 * Selection bridge — comment + inspect picker, hover/click element
 * targeting, freeform pod-stroke, and inspect override sheet management.
 *
 * Boots in a dormant state. Activates when the host posts:
 *   { type: 'od:comment-mode', enabled, mode? }
 *   { type: 'od:inspect-mode', enabled }
 *
 * Communicates back via:
 *   od:comment-target / od:comment-hover / od:comment-leave
 *   od:comment-targets / od:pod-stroke / od:pod-select
 *   od:inspect-overrides
 *   od:preview-scroll(-request|-restore)
 */
export const SELECTION_BRIDGE_SCRIPT = `<script data-od-selection-bridge>(function(){
  if (window.__odSelectionBridgeInstalled) return;
  window.__odSelectionBridgeInstalled = true;
  var commentEnabled = false;
  var inspectEnabled = false;
  var mode = 'picker';
  var hoveredId = null;
  var drawing = false;
  var stroke = [];
  var postTargetsTimer = null;
  var overrides = Object.create(null);
  var styleEl = null;
  var ALLOWED_PROPS = {
    'color': true,
    'background-color': true,
    'font-size': true,
    'font-weight': true,
    'font-family': true,
    'line-height': true,
    'text-align': true,
    'padding': true,
    'padding-top': true,
    'padding-right': true,
    'padding-bottom': true,
    'padding-left': true,
    'border-radius': true
  };
  var UNSAFE_VALUE = /[;{}<>\\n\\r]/;
  function active(){ return commentEnabled || inspectEnabled; }
  function esc(value){ try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); } catch (_) { return String(value); } }
  function safeSelectorFor(elementId, hint){
    var id = String(elementId);
    var kind = null;
    if (typeof hint === 'string') {
      if (hint.indexOf('[data-od-id=') === 0) kind = 'data-od-id';
      else if (hint.indexOf('[data-screen-label=') === 0) kind = 'data-screen-label';
    }
    if (kind === 'data-screen-label' && document.querySelector('[data-screen-label="' + esc(id) + '"]')) {
      return '[data-screen-label="' + esc(id) + '"]';
    }
    if (kind === 'data-od-id' && document.querySelector('[data-od-id="' + esc(id) + '"]')) {
      return '[data-od-id="' + esc(id) + '"]';
    }
    if (document.querySelector('[data-od-id="' + esc(id) + '"]')) {
      return '[data-od-id="' + esc(id) + '"]';
    }
    if (document.querySelector('[data-screen-label="' + esc(id) + '"]')) {
      return '[data-screen-label="' + esc(id) + '"]';
    }
    return null;
  }
  function ensureStyleEl(){
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.querySelector('style[data-od-inspect-overrides]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-od-inspect-overrides', '');
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }
  function hydrateOverridesFromDom(){
    var existing = document.querySelector('style[data-od-inspect-overrides]');
    if (!existing) return;
    var text = existing.textContent || '';
    var ruleRe = /(\\[data-(?:od-id|screen-label)="[^"]*"\\])\\s*\\{\\s*([^}]*)\\}/g;
    var match;
    while ((match = ruleRe.exec(text)) !== null) {
      var selector = match[1];
      var declBody = match[2];
      var idMatch = selector.match(/="([^"]*)"/);
      if (!idMatch) continue;
      var elementId = idMatch[1];
      var props = Object.create(null);
      var decls = declBody.split(';');
      for (var d = 0; d < decls.length; d++) {
        var raw = decls[d];
        if (!raw) continue;
        var colon = raw.indexOf(':');
        if (colon <= 0) continue;
        var name = raw.slice(0, colon).trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, name)) continue;
        var value = raw.slice(colon + 1).replace(/!important/i, '').trim();
        if (!value || UNSAFE_VALUE.test(value)) continue;
        props[name] = value;
      }
      if (Object.keys(props).length) {
        overrides[elementId] = { selector: selector, props: props };
      }
    }
    styleEl = existing;
  }
  function rebuildStyleSheet(){
    var el = ensureStyleEl();
    var lines = [];
    Object.keys(overrides).forEach(function(id){
      var entry = overrides[id];
      if (!entry) return;
      var props = entry.props || {};
      var keys = Object.keys(props);
      if (!keys.length) return;
      var body = keys.map(function(k){ return k + ': ' + props[k] + ' !important'; }).join('; ');
      lines.push(entry.selector + ' { ' + body + ' }');
    });
    el.textContent = lines.join('\\n');
  }
  function postOverrides(){
    var clean = {};
    Object.keys(overrides).forEach(function(id){
      var entry = overrides[id];
      if (entry && entry.props && Object.keys(entry.props).length) {
        clean[id] = { selector: entry.selector, props: Object.assign({}, entry.props) };
      }
    });
    try { window.parent.postMessage({ type: 'od:inspect-overrides', overrides: clean }, '*'); } catch (_) {}
  }
  function styleSnapshot(el){
    try {
      var cs = window.getComputedStyle(el);
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderRadius: cs.borderTopLeftRadius,
        textAlign: cs.textAlign,
        fontFamily: cs.fontFamily
      };
    } catch (_) { return null; }
  }
  function annotatedSelectorFor(el){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (!id) return null;
    return el.hasAttribute('data-od-id') ? '[data-od-id="' + esc(id) + '"]' : '[data-screen-label="' + esc(id) + '"]';
  }
  function domSelectorFor(el){
    if (!el || !el.tagName || el === document.documentElement || el === document.body) return null;
    var parts = [];
    var node = el;
    while (node && node !== document.documentElement && node !== document.body) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (!tag || /^(script|style|template|meta|link|title|noscript)$/.test(tag)) return null;
      var parent = node.parentElement;
      if (!parent) return null;
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    if (!parts.length) return null;
    return 'body > ' + parts.join(' > ');
  }
  function visibleTarget(el){
    if (!el || !el.getBoundingClientRect) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (/^(script|style|template|meta|link|title|noscript)$/.test(el.tagName ? el.tagName.toLowerCase() : '')) return false;
    try {
      var rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    } catch (_) {
      return false;
    }
    return true;
  }
  // Issue #2143 — DevTools-style targeting: any visible element under the
  // cursor is a valid pick. The walk in closestTarget() runs from event.target
  // upward and stops at the first match, so this returns true for everything
  // visible and the leaf wins.
  //
  // The only exclusions are elements that aren't real visible boxes:
  //   - Non-rendering tags (script, style, template, meta, link, title)
  //   - Zero-size or display:none / visibility:hidden / pointer-events:none
  //   - The <html> / <body> root (handled by visibleTarget)
  function meaningfulDomFallbackTarget(el) {
    return visibleTarget(el);
  }
  function targetFrom(el, allowDomFallback, clickedEl){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    var selector = annotatedSelectorFor(el);
    if (!id && allowDomFallback && meaningfulDomFallbackTarget(el)) {
      selector = domSelectorFor(el);
      if (selector) id = 'dom:' + selector;
    }
    if (!id || !selector) return null;
    var rect = el.getBoundingClientRect();
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    var html = '';
    try { html = (el.outerHTML || '').replace(/\\s+/g, ' ').match(/^<[^>]+>/)?.[0] || ''; } catch (_) {}
    var payload = {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: tag + cls,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      htmlHint: html.slice(0, 180),
      style: styleSnapshot(el)
    };
    if (clickedEl && clickedEl !== el) {
      var clickedTag = clickedEl.tagName ? clickedEl.tagName.toLowerCase() : 'element';
      var clickedCls = typeof clickedEl.className === 'string' && clickedEl.className.trim() ? '.' + clickedEl.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
      payload.clickedDescendant = {
        label: clickedTag + clickedCls,
        text: (clickedEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      };
    }
    return payload;
  }
  function allTargets(){
    var annotatedNodes = document.querySelectorAll('[data-od-id], [data-screen-label]');
    var includeDomFallback = canUseDomFallback();
    var nodes = includeDomFallback
      ? document.querySelectorAll('body *')
      : annotatedNodes;
    var items = [];
    var seen = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      var item = targetFrom(nodes[i], includeDomFallback);
      if (item && !seen[item.elementId]) {
        seen[item.elementId] = true;
        items.push(item);
      }
    }
    return items;
  }
  var postTargetsPending = false;
  var postPreviewScrollPending = false;
  function previewScrollElement(){
    return document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement;
  }
  function postPreviewScroll(){
    var el = previewScrollElement();
    if (!el) return;
    var frame = document.scrollingElement || document.documentElement;
    try { window.parent.postMessage({
      type: 'od:preview-scroll',
      canvasLeft: Math.round(el.scrollLeft || 0),
      canvasTop: Math.round(el.scrollTop || 0),
      frameLeft: Math.round(frame.scrollLeft || 0),
      frameTop: Math.round(frame.scrollTop || 0)
    }, '*'); } catch (_) {}
  }
  function schedulePostPreviewScroll(){
    if (postPreviewScrollPending) return;
    postPreviewScrollPending = true;
    window.requestAnimationFrame(function(){
      postPreviewScrollPending = false;
      postPreviewScroll();
    });
  }
  function requestPreviewScrollRestore(){
    try { window.parent.postMessage({ type: 'od:preview-scroll-request' }, '*'); } catch (_) {}
  }
  function postTargets(){
    if (!active()) return;
    try { window.parent.postMessage({ type: 'od:comment-targets', targets: allTargets() }, '*'); } catch (_) {}
  }
  function schedulePostTargets(){
    if (!active() || postTargetsPending) return;
    postTargetsPending = true;
    if (postTargetsTimer) window.clearTimeout(postTargetsTimer);
    postTargetsTimer = window.setTimeout(function(){
      window.requestAnimationFrame(function(){
        postTargetsPending = false;
        postTargetsTimer = null;
        postTargets();
      });
    }, 120);
  }
  function relativePoint(ev){
    return { x: Math.round(ev.clientX), y: Math.round(ev.clientY) };
  }
  function postStroke(type){
    try { window.parent.postMessage({ type: type, points: stroke.slice() }, '*'); } catch (_) {}
  }
  function canUseDomFallback(){
    // Issue #2143 — allow DOM fallback even when the artifact has SOME
    // annotated nodes. The inner closestTarget() walk still prefers any
    // [data-od-id] / [data-screen-label] ancestor; fallback is the
    // tie-breaker only when no annotated ancestor exists. The previous
    // "zero annotations only" gate left mixed artifacts (e.g. an
    // annotated main pane with an un-annotated nav sidebar) with
    // un-pickable nav — clicks fell through to native navigation.
    return commentEnabled && !inspectEnabled;
  }
  function closestTarget(event){
    // DevTools-style targeting (Issue #2143): the leaf under the cursor
    // wins. This is the user's mental model — they're pointing at the big
    // number "1,427", they want THAT element, not its card wrapper, even
    // when the card has a data-od-id. Only fall back to an annotated
    // ancestor when the leaf itself isn't a sane target (zero-size,
    // non-rendering tag).
    //
    // Inspect mode is the exception: it writes per-selector CSS overrides
    // and only annotated nodes have stable selectors, so we keep the
    // annotated-ancestor preference for inspect.
    var clicked = event.target;
    var el = clicked;
    if (inspectEnabled) {
      var fallbackI = null;
      var allowDomFallbackI = mode === 'picker' && canUseDomFallback();
      while (el && el !== document.documentElement) {
        if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) {
          return { target: el, clicked: clicked };
        }
        if (!fallbackI && allowDomFallbackI && meaningfulDomFallbackTarget(el)) fallbackI = el;
        el = el.parentElement;
      }
      return fallbackI ? { target: fallbackI, clicked: clicked } : null;
    }
    // Comment / picker mode: leaf-first walk. Find the deepest visible
    // element starting from event.target, fall back to first annotated
    // ancestor if none of the descendants/self are meaningful.
    var leaf = null;
    while (el && el !== document.documentElement) {
      if (meaningfulDomFallbackTarget(el)) { leaf = el; break; }
      el = el.parentElement;
    }
    if (leaf) return { target: leaf, clicked: clicked };
    // Last resort: any annotated ancestor.
    var anc = clicked;
    while (anc && anc !== document.documentElement) {
      if (anc.getAttribute && (anc.hasAttribute('data-od-id') || anc.hasAttribute('data-screen-label'))) {
        return { target: anc, clicked: clicked };
      }
      anc = anc.parentElement;
    }
    return null;
  }
  function applyOverride(elementId, selector, prop, value){
    if (!elementId || !prop) return;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, prop)) return;
    var safeSelector = safeSelectorFor(elementId, selector);
    if (!safeSelector) return;
    var v = (value == null) ? '' : String(value).trim();
    if (v && UNSAFE_VALUE.test(v)) return;
    var entry = overrides[elementId];
    if (!entry) {
      entry = { selector: safeSelector, props: Object.create(null) };
      overrides[elementId] = entry;
    } else {
      entry.selector = safeSelector;
    }
    if (!v) delete entry.props[prop];
    else entry.props[prop] = v;
    if (Object.keys(entry.props).length === 0) delete overrides[elementId];
    rebuildStyleSheet();
    postOverrides();
  }
  function resetOverrides(elementId){
    if (elementId) delete overrides[elementId];
    else overrides = Object.create(null);
    rebuildStyleSheet();
    postOverrides();
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:comment-mode') {
      commentEnabled = !!data.enabled;
      mode = data.mode === 'pod' ? 'pod' : 'picker';
      document.documentElement.toggleAttribute('data-od-comment-mode', commentEnabled);
      document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
      if (active()) setTimeout(postTargets, 0);
      else hoveredId = null;
      if (!commentEnabled || mode !== 'pod') {
        drawing = false;
        stroke = [];
        try { window.parent.postMessage({ type: 'od:pod-clear' }, '*'); } catch (_) {}
      }
      return;
    }
    if (data.type === 'od:preview-scroll-restore') {
      var frame = document.scrollingElement || document.documentElement;
      var sel = previewScrollElement();
      if (frame) frame.scrollTo(Number(data.frameLeft || 0), Number(data.frameTop || 0));
      if (sel) sel.scrollTo(Number(data.canvasLeft || 0), Number(data.canvasTop || 0));
      setTimeout(postPreviewScroll, 0);
      return;
    }
    if (data.type === 'od:inspect-mode') {
      inspectEnabled = !!data.enabled;
      document.documentElement.toggleAttribute('data-od-inspect-mode', inspectEnabled);
      if (active()) setTimeout(postTargets, 0);
      else hoveredId = null;
      return;
    }
    if (data.type === 'od:inspect-set') {
      applyOverride(data.elementId, data.selector, data.prop, data.value);
      return;
    }
    if (data.type === 'od:inspect-reset') {
      resetOverrides(data.elementId);
      return;
    }
    if (data.type === 'od:inspect-extract') {
      postOverrides();
      return;
    }
    if (data.type === 'od:inspect-replay') {
      var raw = (data && typeof data.overrides === 'object' && data.overrides) ? data.overrides : {};
      overrides = Object.create(null);
      var ids = Object.keys(raw);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var entry = raw[id];
        if (!entry || typeof entry.props !== 'object' || !entry.props) continue;
        var safeSelector = safeSelectorFor(id, entry.selector);
        if (!safeSelector) continue;
        var clean = Object.create(null);
        var pkeys = Object.keys(entry.props);
        for (var p = 0; p < pkeys.length; p++) {
          var name = String(pkeys[p]).toLowerCase();
          if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, name)) continue;
          var rawValue = entry.props[pkeys[p]];
          if (rawValue == null) continue;
          var v = String(rawValue).trim();
          if (!v || UNSAFE_VALUE.test(v)) continue;
          clean[name] = v;
        }
        if (Object.keys(clean).length) overrides[id] = { selector: safeSelector, props: clean };
      }
      rebuildStyleSheet();
      postOverrides();
      return;
    }
  });
  function pickerActive(){ return inspectEnabled || (commentEnabled && mode === 'picker'); }
  document.addEventListener('mouseover', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (!result) return;
    var payload = targetFrom(result.target, commentEnabled && mode === 'picker' && !inspectEnabled);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    try { window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*'); } catch (_) {}
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (!result) return;
    var next = ev.relatedTarget;
    while (next && next !== document.documentElement) {
      if (next === result.target) return;
      next = next.parentElement;
    }
    hoveredId = null;
    try { window.parent.postMessage({ type: 'od:comment-leave' }, '*'); } catch (_) {}
  }, true);
  document.addEventListener('click', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (result) {
      ev.preventDefault();
      ev.stopPropagation();
      var payload = targetFrom(result.target, commentEnabled && mode === 'picker' && !inspectEnabled, result.clicked);
      if (payload) try { window.parent.postMessage(payload, '*'); } catch (_) {}
      return;
    }
    if (!canUseDomFallback() || mode === 'pod') return;
    var t = ev.target;
    var walk = t && t.nodeType === 1 ? t : null;
    while (walk && walk !== document.documentElement) {
      var tag = walk.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL') return;
      if (walk.isContentEditable) return;
      walk = walk.parentElement;
    }
    ev.preventDefault();
    ev.stopPropagation();
    var pinX = Math.round(ev.clientX);
    var pinY = Math.round(ev.clientY);
    var pinId = 'pin-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    try { window.parent.postMessage({
      type: 'od:comment-target',
      elementId: pinId,
      selector: '[data-od-pin="' + pinId + '"]',
      label: 'pin',
      text: '',
      position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 },
      htmlHint: '',
      style: null,
      freePin: true
    }, '*'); } catch (_) {}
  }, true);
  document.addEventListener('pointerdown', function(ev){
    if (!commentEnabled || mode !== 'pod' || ev.button !== 0) return;
    drawing = true;
    stroke = [relativePoint(ev)];
    ev.preventDefault();
    ev.stopPropagation();
    postStroke('od:pod-stroke');
  }, true);
  document.addEventListener('pointermove', function(ev){
    if (!drawing || mode !== 'pod') return;
    var point = relativePoint(ev);
    var last = stroke[stroke.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 4) return;
    stroke.push(point);
    ev.preventDefault();
    ev.stopPropagation();
    postStroke('od:pod-stroke');
  }, true);
  function finishStroke(ev){
    if (!drawing || mode !== 'pod') return;
    drawing = false;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    postStroke('od:pod-select');
  }
  document.addEventListener('pointerup', finishStroke, true);
  document.addEventListener('pointercancel', finishStroke, true);
  window.addEventListener('resize', schedulePostTargets);
  document.addEventListener('scroll', function(){
    schedulePostTargets();
    schedulePostPreviewScroll();
  }, true);
  var mo = new MutationObserver(schedulePostTargets);
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
  hydrateOverridesFromDom();
  if (Object.keys(overrides).length) setTimeout(postOverrides, 0);
  setTimeout(requestPreviewScrollRestore, 0);
  setTimeout(requestPreviewScrollRestore, 80);
  setTimeout(requestPreviewScrollRestore, 240);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postPreviewScroll);
  else setTimeout(postPreviewScroll, 0);
})();</script>`;

/**
 * Selection bridge style — cursor + iframe pointer-events tweaks active
 * while comment / inspect modes are on. Idempotent via marker attribute.
 */
export const SELECTION_BRIDGE_STYLE = `<style data-od-selection-bridge-style>
html[data-od-comment-mode] body * { cursor: crosshair !important; }
html[data-od-inspect-mode] body * { cursor: crosshair !important; }
html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }
html[data-od-comment-mode] body iframe,
html[data-od-inspect-mode] body iframe { pointer-events: none !important; }
</style>`;

/**
 * Route-persist bridge — see Issue #2143 / [[bug-2143-comment-reset]]. Saves
 * SPA navigation (pushState / replaceState / popstate / hashchange) into
 * sessionStorage keyed by document.title + entry pathname, then restores
 * before any user script runs on the next mount. Idempotent.
 */
export const ROUTE_PERSIST_SCRIPT = `<script data-od-route-persist>(function(){
  if (window.__odRoutePersistInstalled) return;
  window.__odRoutePersistInstalled = true;
  var KEY = 'od:route:' + (document.title || '') + ':' + (location.pathname || '/');
  var GEN_KEY = KEY + ':gen';
  // The host appends &r=N to the iframe src whenever the user clicks the
  // toolbar Reload button. When that generation changes vs. what we last
  // saw, we drop the saved route so reload actually returns to the entry
  // file. Mode-toggle remounts reuse the same URL (same gen), so they
  // still restore the saved route.
  var gen = '';
  try { gen = (new URLSearchParams(location.search)).get('r') || ''; } catch (_) {}
  var mem = null;
  var memGen = null;
  function read(){try{return sessionStorage.getItem(KEY)}catch(_){return mem}}
  function write(v){try{sessionStorage.setItem(KEY,v)}catch(_){mem=v}}
  function readGen(){try{return sessionStorage.getItem(GEN_KEY)}catch(_){return memGen}}
  function writeGen(v){try{sessionStorage.setItem(GEN_KEY,v)}catch(_){memGen=v}}
  function clearSaved(){try{sessionStorage.removeItem(KEY)}catch(_){mem=null}}
  function snap(){return (location.pathname||'')+(location.search||'')+(location.hash||'')}
  if (gen && readGen() !== gen) {
    clearSaved();
    writeGen(gen);
  }
  var saved=read();
  if(saved&&saved!==snap()){try{history.replaceState(history.state,'',saved)}catch(_){}}
  function save(){try{write(snap())}catch(_){}}
  save();
  // Parent relay — survive transport flips between URL-load and srcDoc iframes.
  // The sessionStorage used above is scoped to the iframe's origin, so when a
  // mode toggle (edit/tweaks/draw/palette) forces a transport switch and the
  // old iframe is torn down, the saved route would be lost. Posting snapshots
  // to the parent lets it relay the route back into the new iframe's bridge.
  var relayTimer = null;
  function relaySnapshot() {
    if (window.parent === window) return;
    if (relayTimer) clearTimeout(relayTimer);
    relayTimer = setTimeout(function() {
      relayTimer = null;
      try {
        window.parent.postMessage({
          type: 'od:route-snapshot',
          path: snap(),
          generation: readGen() || '',
          scrollX: window.scrollX || document.documentElement.scrollLeft || 0,
          scrollY: window.scrollY || document.documentElement.scrollTop || 0
        }, '*');
      } catch (_) {}
    }, 100);
  }
  // Hook every save point to also relay to parent
  var _origReplace = history.replaceState;
  var _origPush = history.pushState;
  history.replaceState = function() {
    var r = _origReplace.apply(this, arguments);
    save();
    relaySnapshot();
    return r;
  };
  history.pushState = function() {
    var r = _origPush.apply(this, arguments);
    save();
    relaySnapshot();
    return r;
  };
  window.addEventListener('popstate', function() {
    save();
    relaySnapshot();
  });
  window.addEventListener('hashchange', function() {
    save();
    relaySnapshot();
  });
  relaySnapshot();
  // Accept route-restore from parent (sent when a new iframe boots)
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'od:route-restore') return;
    var data = ev.data;
    if (data.generation && readGen() !== data.generation) {
      clearSaved();
      writeGen(data.generation);
    }
    if (data.path) {
      write(data.path);
      try { history.replaceState(history.state, '', data.path); } catch (_) {}
    }
    // Restore scroll position relayed from parent (survives transport flips)
    if (typeof data.scrollX === 'number' || typeof data.scrollY === 'number') {
      var sx = Number(data.scrollX || 0);
      var sy = Number(data.scrollY || 0);
      if (sx || sy) {
        setTimeout(function() { window.scrollTo(sx, sy); }, 0);
      }
    }
  });
})();</script>`;

/**
 * Marker that signals "this artifact already has the URL-load bridges
 * injected" so the renderer can stay in URL-load mode for comment /
 * inspect instead of flipping to srcDoc and tearing down state.
 */
export const URL_LOAD_BRIDGE_MARKER = 'data-od-selection-bridge';
