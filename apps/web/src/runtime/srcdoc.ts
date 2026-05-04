/**
 * Wrap an artifact's HTML for a sandboxed iframe. Corresponds to
 * buildSrcdoc in packages/runtime/src/index.ts — the reference version also
 * injects an edit-mode overlay and tweak bridge, which this starter omits.
 *
 * If the model returned a full document, pass it through unchanged; otherwise
 * wrap the fragment in a minimal doctype shell.
 *
 * When `options.deck` is set we also inject a `postMessage` listener that
 * lets the host advance / rewind slides without relying on the iframe
 * having keyboard focus. The host posts:
 *   { type: 'od:slide', action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number }
 * and the iframe responds with:
 *   { type: 'od:slide-state', active: number, count: number }
 * after every navigation so the host can render its own counter / dots.
 */
export type SrcdocOptions = {
  deck?: boolean;
  baseHref?: string;
  initialSlideIndex?: number;
  commentBridge?: boolean;
  tweakBridge?: boolean;
};

export function buildSrcdoc(
  html: string,
  options: SrcdocOptions = {}
): string {
  const head = html.trimStart().slice(0, 64).toLowerCase();
  const isFullDoc = head.startsWith("<!doctype") || head.startsWith("<html");
  const wrapped = isFullDoc
    ? html
    : `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>${html}</body>
</html>`;
  const withBase = options.baseHref ? injectBaseHref(wrapped, options.baseHref) : wrapped;
  const withShim = injectSandboxShim(withBase);
  const withDeck = options.deck ? injectDeckBridge(withShim, options.initialSlideIndex) : withShim;
  const withTweaks = options.tweakBridge ? injectTweakBridge(withDeck) : withDeck;
  return options.commentBridge ? injectCommentBridge(withTweaks) : withTweaks;
}

function injectBaseHref(doc: string, baseHref: string): string {
  const safeHref = escapeAttr(baseHref);
  const tag = `<base href="${safeHref}">`;
  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  }
  if (/<html[^>]*>/i.test(doc)) {
    return doc.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  }
  return tag + doc;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Sandboxed iframes (we use `sandbox="allow-scripts"`) without
// `allow-same-origin` raise a SecurityError on first `localStorage` /
// `sessionStorage` access. Many freeform-generated decks call
// `localStorage.getItem(...)` at the top of their IIFE without a
// try/catch — when it throws, the whole script aborts and the deck
// becomes a static, unnavigable preview. We install a same-origin
// in-memory shim BEFORE any user script runs so those decks degrade
// gracefully (position just doesn't persist across reloads).
function injectSandboxShim(doc: string): string {
  const shim = `<script>(function(){
  function makeStore(){
    var data = {};
    var api = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function(k, v){ data[k] = String(v); },
      removeItem: function(k){ delete data[k]; },
      clear: function(){ data = {}; },
      key: function(i){ return Object.keys(data)[i] || null; }
    };
    Object.defineProperty(api, 'length', { get: function(){ return Object.keys(data).length; } });
    return api;
  }
  function tryShim(name){
    var works = false;
    try { works = !!window[name] && typeof window[name].getItem === 'function'; void window[name].length; }
    catch (_) { works = false; }
    if (works) return;
    try { Object.defineProperty(window, name, { configurable: true, value: makeStore() }); }
    catch (_) { try { window[name] = makeStore(); } catch (__) {} }
  }
  tryShim('localStorage');
  tryShim('sessionStorage');
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${shim}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${shim}`);
  return shim + doc;
}

function injectCommentBridge(doc: string): string {
  const script = `<script data-od-comment-bridge>(function(){
  var enabled = true;
  var hoveredId = null;
  var blockedTags = { html: true, head: true, meta: true, link: true, style: true, script: true, title: true, base: true };
  function clean(value){ return String(value || '').replace(/\\s+/g, ' ').trim(); }
  function cssEsc(value){ try { return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); } catch (_) { return String(value); } }
  function attrEsc(value){ return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }
  function isSelectable(el){
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (blockedTags[tag]) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function compactTag(el){
    if (!el || !el.tagName) return '';
    var tag = el.tagName.toLowerCase();
    var bits = ['<' + tag];
    if (el.id) bits.push('id="' + attrEsc(el.id) + '"');
    if (typeof el.className === 'string' && clean(el.className)) bits.push('class="' + attrEsc(clean(el.className).split(/\\s+/).slice(0, 5).join(' ')) + '"');
    var attrs = ['data-od-id', 'data-screen-label', 'role', 'aria-label', 'alt', 'title', 'type', 'name', 'href'];
    for (var i = 0; i < attrs.length; i++) {
      var value = el.getAttribute && el.getAttribute(attrs[i]);
      if (value && !((attrs[i] === 'href') && /^javascript:/i.test(value))) bits.push(attrs[i] + '="' + attrEsc(clean(value).slice(0, 120)) + '"');
    }
    return bits.join(' ') + '>';
  }
  function selectorFor(el){
    if (el.hasAttribute('data-od-id')) return '[data-od-id="' + attrEsc(el.getAttribute('data-od-id')) + '"]';
    if (el.hasAttribute('data-screen-label')) return '[data-screen-label="' + attrEsc(el.getAttribute('data-screen-label')) + '"]';
    if (el.id) return '#' + cssEsc(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 7) {
      var tag = node.tagName.toLowerCase();
      var part = tag;
      if (node.id) {
        parts.unshift(tag + '#' + cssEsc(node.id));
        break;
      }
      if (node.hasAttribute('data-od-id')) {
        parts.unshift('[data-od-id="' + attrEsc(node.getAttribute('data-od-id')) + '"]');
        break;
      }
      if (node.hasAttribute('data-screen-label')) {
        parts.unshift('[data-screen-label="' + attrEsc(node.getAttribute('data-screen-label')) + '"]');
        break;
      }
      if (typeof node.className === 'string' && clean(node.className)) {
        part += '.' + clean(node.className).split(/\\s+/).slice(0, 2).map(cssEsc).join('.');
      }
      var nth = 1;
      var prev = node.previousElementSibling;
      while (prev) {
        if (prev.tagName === node.tagName) nth++;
        prev = prev.previousElementSibling;
      }
      part += ':nth-of-type(' + nth + ')';
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ') || (el.tagName ? el.tagName.toLowerCase() : 'element');
  }
  function labelFor(el){
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var label = tag;
    if (el.id) label += '#' + el.id;
    if (typeof el.className === 'string' && clean(el.className)) label += '.' + clean(el.className).split(/\\s+/).slice(0, 2).join('.');
    var role = el.getAttribute && el.getAttribute('role');
    if (role) label += '[role=' + role + ']';
    return label.slice(0, 160);
  }
  function textFor(el){
    if (!isTextEditableTarget(el)) return '';
    var text = clean(el.textContent || '');
    if (!text && 'value' in el) text = clean(el.value || '');
    if (!text) text = clean(el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('title') || '');
    return text.slice(0, 240);
  }
  function isTextEditableTarget(el){
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (/^(h1|h2|h3|h4|h5|h6|p|span|a|button|label|strong|em|small|li|figcaption|blockquote|cite|time)$/.test(tag)) return true;
    if (tag === 'input' || tag === 'textarea') return true;
    return false;
  }
  function styleObject(el, rect){
    try {
      var cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        position: cs.position,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        width: cs.width,
        height: cs.height,
        transform: cs.transform,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        animationTimingFunction: cs.animationTimingFunction,
        animationIterationCount: cs.animationIterationCount,
        animationDirection: cs.animationDirection,
        animationFillMode: cs.animationFillMode,
        boxWidth: Math.round(rect.width),
        boxHeight: Math.round(rect.height)
      };
    } catch (_) {
      return null;
    }
  }
  function styleHint(el, rect){
    var s = styleObject(el, rect);
    if (!s) return 'styles: unavailable';
    return 'styles: display=' + s.display + '; position=' + s.position + '; color=' + s.color + '; background=' + s.backgroundColor + '; font=' + s.fontSize + '/' + s.lineHeight + ' ' + s.fontFamily + '; animation=' + s.animationName + ' ' + s.animationDuration + ' ' + s.animationTimingFunction + '; transform=' + s.transform + '; box=' + s.boxWidth + 'x' + s.boxHeight;
  }
  function htmlHintFor(el, rect){
    var previous = el.previousElementSibling ? compactTag(el.previousElementSibling) : '';
    var next = el.nextElementSibling ? compactTag(el.nextElementSibling) : '';
    var parent = el.parentElement ? compactTag(el.parentElement) : '';
    return clean(['self: ' + compactTag(el), parent ? 'parent: ' + parent : '', previous ? 'previous: ' + previous : '', next ? 'next: ' + next : '', styleHint(el, rect)].filter(Boolean).join(' | ')).slice(0, 800);
  }
  function isInteractiveTarget(el){
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (/^(a|button|input|textarea|select|option|summary|label)$/.test(tag)) return true;
    var role = clean(el.getAttribute && el.getAttribute('role'));
    if (/^(button|link|menuitem|tab|checkbox|radio|switch|textbox|combobox|slider)$/.test(role)) return true;
    if (el.hasAttribute && (el.hasAttribute('onclick') || el.hasAttribute('contenteditable'))) return true;
    var tabindex = el.getAttribute && el.getAttribute('tabindex');
    return tabindex !== null && tabindex !== undefined && tabindex !== '-1';
  }
  function containerPenaltyTag(el){
    var tag = el && el.tagName ? el.tagName.toLowerCase() : '';
    return /^(body|main|section|article|aside|header|footer|nav|div|ul|ol|form)$/.test(tag);
  }
  function visibleArea(rect){
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  function viewportArea(){
    return Math.max(1, window.innerWidth * window.innerHeight);
  }
  function ownText(el){
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node && node.nodeType === 3) out += ' ' + node.nodeValue;
    }
    return clean(out);
  }
  function candidateScore(el, index){
    if (!isSelectable(el)) return -100000;
    var rect = el.getBoundingClientRect();
    var area = visibleArea(rect);
    var vp = viewportArea();
    var score = 1000 - index * 8;
    var tag = el.tagName.toLowerCase();
    if (isInteractiveTarget(el)) score += 900;
    if (isTextEditableTarget(el)) score += 520;
    if (ownText(el)) score += 180;
    if (el.hasAttribute('data-od-id')) score += 120;
    if (el.hasAttribute('data-screen-label')) score -= 260;
    if (/^(button|a|input|textarea|select|label)$/.test(tag)) score += 420;
    if (/^(h1|h2|h3|h4|h5|h6|p|span|small|strong|em|li)$/.test(tag)) score += 240;
    if (containerPenaltyTag(el)) score -= 120;
    if (area > vp * 0.65) score -= 850;
    else if (area > vp * 0.35) score -= 520;
    else if (area > vp * 0.18) score -= 260;
    if (area < 260000) score += Math.max(0, 220 - Math.sqrt(area) / 2);
    if (rect.width < 18 || rect.height < 18) score -= 120;
    return score;
  }
  function candidatesFromPoint(event){
    var seen = [];
    var items = [];
    var stack = [];
    try { stack = document.elementsFromPoint(event.clientX, event.clientY) || []; } catch (_) { stack = []; }
    if (event.target && stack.indexOf(event.target) === -1) stack.unshift(event.target);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      while (el && el !== document.documentElement) {
        if (seen.indexOf(el) === -1) {
          seen.push(el);
          items.push({ el: el, index: i });
        }
        el = el.parentElement;
      }
    }
    return items;
  }
  function preferredTarget(event){
    var candidates = candidatesFromPoint(event);
    var best = null;
    var bestScore = -100000;
    for (var i = 0; i < candidates.length; i++) {
      var score = candidateScore(candidates[i].el, candidates[i].index);
      if (score > bestScore) {
        best = candidates[i].el;
        bestScore = score;
      }
    }
    return best;
  }
  function targetFrom(el){
    if (!isSelectable(el)) return null;
    var rect = el.getBoundingClientRect();
    var selector = selectorFor(el);
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label') || el.id || selector;
    return {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: labelFor(el),
      text: textFor(el),
      position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      htmlHint: htmlHintFor(el, rect),
      styles: styleObject(el, rect)
    };
  }
  function queryTarget(selector){
    try { return document.querySelector(selector); }
    catch (_) { return null; }
  }
  function rememberOriginal(el){
    if (el.__odVisualEditOriginal) return el.__odVisualEditOriginal;
    var original = {
      textContent: el.textContent,
      style: {
        fontFamily: el.style.fontFamily,
        fontSize: el.style.fontSize,
        fontWeight: el.style.fontWeight,
        lineHeight: el.style.lineHeight,
        letterSpacing: el.style.letterSpacing,
        color: el.style.color,
        backgroundColor: el.style.backgroundColor,
        width: el.style.width,
        height: el.style.height,
        transform: el.style.transform,
        animationName: el.style.animationName,
        animationDuration: el.style.animationDuration,
        animationDelay: el.style.animationDelay,
        animationTimingFunction: el.style.animationTimingFunction,
        animationIterationCount: el.style.animationIterationCount,
        animationDirection: el.style.animationDirection,
        animationFillMode: el.style.animationFillMode
      }
    };
    try { Object.defineProperty(el, '__odVisualEditOriginal', { value: original, configurable: true }); }
    catch (_) { el.__odVisualEditOriginal = original; }
    return original;
  }
  function restoreVisualEdits(){
    var nodes = document.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var original = nodes[i].__odVisualEditOriginal;
      if (!original) continue;
      nodes[i].textContent = original.textContent;
      for (var key in original.style) nodes[i].style[key] = original.style[key];
      try { delete nodes[i].__odVisualEditOriginal; } catch (_) { nodes[i].__odVisualEditOriginal = null; }
    }
    schedulePostTargets();
  }
  function applyVisualEdit(selector, draft){
    var el = queryTarget(selector);
    if (!el || !draft) return;
    var original = rememberOriginal(el);
    if (typeof draft.text === 'string' && draft.text.trim() && isTextEditableTarget(el)) el.textContent = draft.text;
    var map = [
      ['fontFamily', 'fontFamily'],
      ['fontSize', 'fontSize'],
      ['fontWeight', 'fontWeight'],
      ['lineHeight', 'lineHeight'],
      ['letterSpacing', 'letterSpacing'],
      ['color', 'color'],
      ['backgroundColor', 'backgroundColor'],
      ['width', 'width'],
      ['height', 'height'],
      ['animationName', 'animationName'],
      ['animationDuration', 'animationDuration'],
      ['animationDelay', 'animationDelay'],
      ['animationTimingFunction', 'animationTimingFunction'],
      ['animationIterationCount', 'animationIterationCount'],
      ['animationDirection', 'animationDirection'],
      ['animationFillMode', 'animationFillMode']
    ];
    for (var i = 0; i < map.length; i++) {
      var value = draft[map[i][0]];
      if (typeof value === 'string' && value.trim()) el.style[map[i][1]] = value.trim();
    }
    var moveX = Number(draft.moveX) || 0;
    var moveY = Number(draft.moveY) || 0;
    if (moveX || moveY) {
      var baseTransform = original.style.transform || '';
      el.style.transform = 'translate(' + Math.round(moveX) + 'px, ' + Math.round(moveY) + 'px)' + (baseTransform ? ' ' + baseTransform : '');
    } else if (original.style.transform) {
      el.style.transform = original.style.transform;
    }
    schedulePostTargets();
  }
  function allTargets(){
    var nodes = document.body ? document.body.querySelectorAll('*') : document.querySelectorAll('*');
    var items = [];
    for (var i = 0; i < nodes.length; i++) {
      var item = targetFrom(nodes[i]);
      if (item) items.push(item);
    }
    return items;
  }
  var postTargetsPending = false;
  function postTargets(){
    if (!enabled) return;
    window.parent.postMessage({ type: 'od:comment-targets', targets: allTargets() }, '*');
  }
  function schedulePostTargets(){
    if (!enabled || postTargetsPending) return;
    postTargetsPending = true;
    window.requestAnimationFrame(function(){
      postTargetsPending = false;
      postTargets();
    });
  }
  function closestTarget(event){
    var el = event.target;
    while (el && el !== document.documentElement) {
      if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) return el;
      el = el.parentElement;
    }
    return null;
  }
  window.addEventListener('message', function(ev){
    if (ev.data && ev.data.type === 'od:visual-edit-preview') {
      restoreVisualEdits();
      if (Array.isArray(ev.data.edits)) {
        for (var i = 0; i < ev.data.edits.length; i++) {
          applyVisualEdit(ev.data.edits[i].selector, ev.data.edits[i].draft);
        }
      } else if (!ev.data.clear) {
        applyVisualEdit(ev.data.selector, ev.data.draft);
      }
      return;
    }
    if (!ev.data || ev.data.type !== 'od:comment-mode') return;
    enabled = !!ev.data.enabled;
    document.documentElement.toggleAttribute('data-od-comment-mode', enabled);
    if (enabled) setTimeout(postTargets, 0);
    else hoveredId = null;
  });
  document.addEventListener('mouseover', function(ev){
    if (!enabled) return;
    var el = preferredTarget(ev);
    if (!el) return;
    var payload = targetFrom(el);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*');
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!enabled) return;
    var el = preferredTarget(ev);
    if (!el) return;
    var next = ev.relatedTarget;
    while (next && next !== document.documentElement) {
      if (next === el) return;
      next = next.parentElement;
    }
    hoveredId = null;
    window.parent.postMessage({ type: 'od:comment-leave' }, '*');
  }, true);
  document.addEventListener('click', function(ev){
    if (!enabled) return;
    var el = preferredTarget(ev);
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    var payload = targetFrom(el);
    if (payload) window.parent.postMessage(payload, '*');
  }, true);
  window.addEventListener('resize', schedulePostTargets);
  document.addEventListener('scroll', schedulePostTargets, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
})();</script>`;
  const style = `<style data-od-comment-bridge-style>
html[data-od-comment-mode] body,
html[data-od-comment-mode] body * { cursor: crosshair !important; }
</style>`;
  const withStyle = /<\/head>/i.test(doc)
    ? doc.replace(/<\/head>/i, style + '</head>')
    : /<head[^>]*>/i.test(doc)
      ? doc.replace(/<head[^>]*>/i, (m) => m + style)
      : style + doc;
  if (/<\/body>/i.test(withStyle)) return withStyle.replace(/<\/body>/i, script + '</body>');
  return withStyle + script;
}

function injectTweakBridge(doc: string): string {
  const script = `<script data-od-tweak-bridge>(function(){
  function targetHead(){ return document.head || document.documentElement || document.body; }
  function apply(css){
    var existing = document.querySelector('style[data-od-tweaks-live]');
    if (!css) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    if (!existing) {
      existing = document.createElement('style');
      existing.setAttribute('data-od-tweaks-live', '');
      targetHead().appendChild(existing);
    }
    if (existing.textContent !== css) existing.textContent = css;
  }
  window.addEventListener('message', function(ev){
    if (!ev.data || ev.data.type !== 'od:tweaks-preview') return;
    apply(String(ev.data.css || ''));
  });
})();</script>`;
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, script + '</body>');
  return doc + script;
}

// The deck bridge supports three deck conventions found across our skills
// and freeform-generated artifacts:
//   1. Horizontal scroll decks (simple-deck, guizang-ppt) — slides laid out
//      side-by-side, navigation = scrollTo({ left }).
//   2. Class-toggle decks (deck-framework, freeform pitches) — one slide
//      carries `.active` or `.is-active`; siblings are display:none. Their
//      own JS listens for ArrowRight/Left, so we drive them by dispatching
//      synthetic KeyboardEvents.
//   3. Visibility-only decks — no class toggle, slides hidden via inline
//      style. We fall back to keyboard dispatch + visibility detection.
//
// All three report `{ active, count }` back to the host so the toolbar can
// render a unified counter. A MutationObserver on each `.slide` lets us
// catch class changes from the deck's own keyboard handler.
//
// We also inject a small CSS override that fixes a common authoring
// mistake in fixed-canvas decks: a `.stage { display: grid; place-items:
// center }` only centers items within their grid cells, but the track
// itself stays `start`-aligned, so the 1920x1080 canvas top-lefts at
// (0,0) of the stage. Combined with `transform-origin: center center`,
// the scaled canvas ends up offset toward the bottom-right of any
// preview that's smaller than 1920x1080 — exactly what users see in the
// sandbox iframe. `place-content: center` centers the track itself.
function injectDeckBridge(doc: string, initialSlideIndex = 0): string {
  const safeInitialSlideIndex = Number.isFinite(initialSlideIndex)
    ? Math.max(0, Math.floor(initialSlideIndex))
    : 0;
  const styleFix = `<style data-od-deck-fix>
.stage, .deck-stage, .deck-shell { place-content: center !important; }
</style>`;
  const docWithStyle = /<\/head>/i.test(doc)
    ? doc.replace(/<\/head>/i, styleFix + "</head>")
    : /<head[^>]*>/i.test(doc)
    ? doc.replace(/<head[^>]*>/i, (m) => m + styleFix)
    : styleFix + doc;
  doc = docWithStyle;
  const script = `<script>(function(){
  var initialSlideIndex = ${safeInitialSlideIndex};
  var didRestoreInitialSlide = initialSlideIndex <= 0;
  function slides(){ return document.querySelectorAll('.slide'); }
  function scroller(){
    if (document.body && document.body.scrollWidth > document.body.clientWidth + 1) return document.body;
    return document.scrollingElement || document.documentElement;
  }
  function isScrollDeck(){
    var sc = scroller();
    return !!(sc && sc.scrollWidth > sc.clientWidth + 1);
  }
  function findActiveByClass(list){
    for (var i=0; i<list.length; i++) {
      var cl = list[i].classList;
      if (cl && (cl.contains('is-active') || cl.contains('active') || cl.contains('current'))) return i;
    }
    return -1;
  }
  function findActiveByVisibility(list){
    for (var i=0; i<list.length; i++) {
      try {
        var cs = window.getComputedStyle(list[i]);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') return i;
      } catch (_) {}
    }
    return -1;
  }
  function activeIndex(list){
    if (!list || !list.length) return 0;
    if (isScrollDeck()) {
      var w = Math.max(1, window.innerWidth);
      return Math.max(0, Math.min(list.length - 1, Math.round(scroller().scrollLeft / w)));
    }
    var byClass = findActiveByClass(list);
    if (byClass >= 0) return byClass;
    var byVis = findActiveByVisibility(list);
    if (byVis >= 0) return byVis;
    return 0;
  }
  function dispatchKey(key){
    // Bubbles so any listener on window picks it up too. We dispatch on
    // document only — dispatching on window/body in addition would cause
    // bubbling to fire the same document-level listener twice.
    var init = { key: key, code: key, bubbles: true, cancelable: true, composed: true };
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', init));
      document.dispatchEvent(new KeyboardEvent('keyup', init));
    } catch (_) {}
  }
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function activeClassName(list){
    var names = ['active', 'is-active', 'current'];
    for (var n=0; n<names.length; n++) {
      for (var i=0; i<list.length; i++) {
        if (list[i].classList && list[i].classList.contains(names[n])) return names[n];
      }
    }
    return 'active';
  }
  function canSetActive(list){
    if (findActiveByClass(list) >= 0) return true;
    for (var i=0; i<list.length; i++) {
      if (list[i].style.display === 'none') return true;
      if (list[i].style.visibility === 'hidden') return true;
      if (list[i].hasAttribute('hidden')) return true;
    }
    return false;
  }
  function updateDeckChrome(i, count){
    var cur = document.getElementById('deck-cur');
    var total = document.getElementById('deck-total');
    var prev = document.getElementById('deck-prev');
    var next = document.getElementById('deck-next');
    if (cur) cur.textContent = pad2(i + 1);
    if (total) total.textContent = pad2(count);
    if (prev) prev.toggleAttribute('disabled', i <= 0);
    if (next) next.toggleAttribute('disabled', i >= count - 1);
  }
  function setActive(i){
    var list = slides();
    if (!list.length) return false;
    var target = Math.max(0, Math.min(list.length - 1, i));
    var activeClass = activeClassName(list);
    var usesInlineDisplay = false;
    var usesInlineVisibility = false;
    var usesHidden = false;
    for (var j=0; j<list.length; j++) {
      usesInlineDisplay = usesInlineDisplay || list[j].style.display === 'none';
      usesInlineVisibility = usesInlineVisibility || list[j].style.visibility === 'hidden';
      usesHidden = usesHidden || list[j].hasAttribute('hidden');
    }
    for (var k=0; k<list.length; k++) {
      if (list[k].classList) {
        list[k].classList.remove('active', 'is-active', 'current');
        if (k === target) list[k].classList.add(activeClass);
      }
      if (usesHidden) {
        if (k === target) list[k].removeAttribute('hidden');
        else list[k].setAttribute('hidden', '');
      }
      if (usesInlineDisplay && list[k].style) {
        list[k].style.display = k === target ? '' : 'none';
      }
      if (usesInlineVisibility && list[k].style) {
        list[k].style.visibility = k === target ? '' : 'hidden';
      }
    }
    updateDeckChrome(target, list.length);
    report();
    return true;
  }
  function scrollGo(i){
    var list = slides();
    var next = Math.max(0, Math.min(list.length - 1, i));
    scroller().scrollTo({ left: next * window.innerWidth, behavior: 'smooth' });
    setTimeout(report, 380);
  }
  function targetFor(action, list){
    var i = activeIndex(list);
    if (action === 'next') return i + 1;
    if (action === 'prev') return i - 1;
    if (action === 'first') return 0;
    if (action === 'last') return list.length - 1;
    return i;
  }
  function go(action){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, targetFor(action, list)));
    if (isScrollDeck()) {
      scrollGo(target);
      return;
    }
    if (canSetActive(list) && setActive(target)) return;
    if (action === 'next') dispatchKey('ArrowRight');
    else if (action === 'prev') dispatchKey('ArrowLeft');
    else if (action === 'first') dispatchKey('Home');
    else if (action === 'last') dispatchKey('End');
    setTimeout(report, 280);
  }
  function gotoIndex(i){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, i));
    if (isScrollDeck()) { scrollGo(target); return; }
    if (canSetActive(list) && setActive(target)) return;
    var current = activeIndex(list);
    var diff = target - current;
    if (!diff) { report(); return; }
    var key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
    var n = Math.abs(diff);
    for (var k = 0; k < n; k++) dispatchKey(key);
    setTimeout(report, 320);
  }
  function report(){
    try {
      var list = slides();
      window.parent.postMessage({
        type: 'od:slide-state',
        active: activeIndex(list),
        count: list.length,
      }, '*');
    } catch (e) {}
  }
  function restoreInitialSlide(){
    if (didRestoreInitialSlide) { report(); return; }
    var list = slides();
    if (!list.length) return;
    didRestoreInitialSlide = true;
    gotoIndex(initialSlideIndex);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:slide') return;
    if (data.action === 'go' && typeof data.index === 'number') gotoIndex(data.index);
    else go(data.action);
  });
  function ownDeckButton(id, action){
    var btn = document.getElementById(id);
    if (!btn || btn.__odDeckOwned) return;
    btn.__odDeckOwned = true;
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      go(action);
    }, true);
  }
  ownDeckButton('deck-prev', 'prev');
  ownDeckButton('deck-next', 'next');
  // Report once on load and on every scroll-end so the host stays in sync.
  window.addEventListener('load', function(){ setTimeout(restoreInitialSlide, 200); });
  document.addEventListener('scroll', function(){
    clearTimeout(window.__odReportT);
    window.__odReportT = setTimeout(report, 120);
  }, { passive: true, capture: true });
  // Nudge the deck's own fit/resize listener after layout settles. Fixed-canvas
  // decks (e.g. ".canvas { width: 1920px }" + "transform: scale(...)") compute
  // their scale on first run, which fires when the iframe is still 0x0 in
  // sandboxed previews — the deck's fit() then resolves to scale(0) / scale(1)
  // and never recovers. Re-firing 'resize' lets the deck recompute, and a
  // ResizeObserver picks up later layout settles (zoom toggle, sidebar drag).
  function nudgeResize(){
    try { window.dispatchEvent(new Event('resize')); }
    catch (_) {}
  }
  // Aggressively nudge during the first second so the deck catches the
  // iframe's first non-zero size; bail out early once the iframe reports a
  // real width. Without this loop, fixed-canvas decks render at scale(0).
  function chaseFirstLayout(){
    var attempts = 0;
    function tick(){
      attempts += 1;
      var w = window.innerWidth;
      nudgeResize();
      if (w > 0 && attempts >= 2) return; // one extra nudge after first non-zero
      if (attempts < 30) setTimeout(tick, 50);
    }
    tick();
  }
  if (document.readyState === 'complete') chaseFirstLayout();
  else window.addEventListener('load', chaseFirstLayout);
  // Re-nudge whenever the iframe itself is resized by the host (e.g.
  // user toggles zoom, resizes the chat sidebar, exits Present).
  if (typeof ResizeObserver !== 'undefined') {
    try {
      var ro = new ResizeObserver(function(){ nudgeResize(); });
      ro.observe(document.documentElement);
    } catch (_) {}
  }
  // For class-toggle decks the deck's own keyboard handler updates classes
  // on the slide elements; an attribute observer translates that into the
  // host counter without depending on scroll events.
  function observeSlides(){
    var list = slides();
    if (!list.length) { setTimeout(observeSlides, 150); return; }
    try {
      var mo = new MutationObserver(function(){
        clearTimeout(window.__odReportT2);
        window.__odReportT2 = setTimeout(report, 60);
      });
      for (var i = 0; i < list.length; i++) {
        mo.observe(list[i], { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      }
    } catch (e) {}
    setTimeout(restoreInitialSlide, 100);
  }
  observeSlides();
})();</script>`;
  if (/<\/body>/i.test(doc))
    return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}
