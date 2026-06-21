export const MANUAL_EDIT_DISCOVERY_SELECTOR =
  'main, nav, section, article, aside, header, footer, div, h1, h2, h3, h4, h5, h6, p, a, button, img, ul, ol, li, dl, dt, dd, table, thead, tbody, tfoot, tr, td, th, caption, blockquote, figure, figcaption, label, summary, pre, code, strong, em, b, i, small, mark, span';
export const MANUAL_EDIT_SOURCE_PATH_ATTR = 'data-od-source-path';
export const MANUAL_EDIT_HOST_NODE_SELECTOR = [
  '[data-od-sandbox-shim]',
  '[data-od-deck-bridge]',
  '[data-od-comment-bridge]',
  '[data-od-edit-bridge]',
  '[data-od-comment-bridge-style]',
  '[data-od-edit-bridge-style]',
  '[data-od-deck-fix]',
].join(',');

export type ManualEditKind = 'text' | 'link' | 'image' | 'container';

export function manualEditDomPathForElement(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parentEl: Element | null = node.parentElement;
    if (!parentEl) break;
    const children = Array.from(parentEl.children).filter((child) => !isManualEditHostNode(child));
    parts.unshift(children.indexOf(node));
    node = parentEl;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

export function isManualEditHostNode(el: Element): boolean {
  return el.matches(MANUAL_EDIT_HOST_NODE_SELECTOR);
}

export function manualEditStableIdForElement(el: Element): string {
  const explicit = el.getAttribute('data-od-id');
  if (explicit) return explicit;
  const generated = el.getAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR) || el.getAttribute('data-od-runtime-id') || manualEditDomPathForElement(el);
  if (generated) el.setAttribute('data-od-runtime-id', generated);
  return generated || 'unknown';
}

export function isMeaningfulManualEditElement(el: Element, rect: Pick<DOMRect, 'width' | 'height'>): boolean {
  return isSourceMappableManualEditElement(el) && el.matches(MANUAL_EDIT_DISCOVERY_SELECTOR) && rect.width >= 4 && rect.height >= 4;
}

export function isSourceMappableManualEditElement(el: Element): boolean {
  return el.hasAttribute('data-od-id') || el.hasAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR);
}

/**
 * A "text leaf" carries visible text and has NO element children, so a click
 * can drop a caret and the committed text round-trips through the source
 * patcher. This — not the tag name — is what makes a bare `<div>Title</div>`,
 * an `<li>`, a `<td>`, or an `<h4>` editable, exactly like a `<p>`.
 *
 * Elements with element children (even inline ones like `<strong>`/`<a>`) are
 * deliberately NOT text leaves: `applyManualEditPatch` rejects a `set-text`
 * patch whenever the target `hasElementChildren`, so offering a caret there
 * would let the user type and then fail to persist. Those stay containers
 * (style-only) until the patcher can persist nested markup.
 */
export function manualEditElementIsTextLeaf(el: Element): boolean {
  const text = (el.textContent || '').trim();
  if (!text) return false;
  return el.children.length === 0;
}

/**
 * Classify what a click on an element should do in manual edit mode. `text`
 * and `link` drop a text caret (and still expose styles); `container` and
 * `image` only select for styling. An explicit `data-od-edit` attribute always
 * wins so authored markup can opt a node in or out.
 */
export function manualEditKindForElement(el: Element): ManualEditKind {
  const explicit = el.getAttribute('data-od-edit');
  if (explicit) return explicit as ManualEditKind;
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'a') return 'link';
  if (tag === 'img') return 'image';
  if (manualEditElementIsTextLeaf(el)) return 'text';
  return 'container';
}

export function buildManualEditKeyboardGuard(): string {
  return `<script data-od-edit-keyboard-guard>(function(){
  window.__odEditGuard = window.__odEditGuard || { editingEl: null };
  function shouldBlock(){
    var el = window.__odEditGuard && window.__odEditGuard.editingEl;
    return el && el.isConnected;
  }
  function captureFromOptions(options){
    if (options == null) return false;
    if (typeof options === 'boolean') return options;
    return !!(options && options.capture);
  }
  function onceFromOptions(options){
    if (options == null) return false;
    if (typeof options === 'boolean') return false;
    return !!(options && options.once);
  }
  function signalFromOptions(options){
    if (options == null) return null;
    if (typeof options === 'boolean') return null;
    return (options && options.signal) || null;
  }
  function removeWrappedEntry(wrapped, handler){
    for (var i = wrapped.length - 1; i >= 0; i--) {
      if (wrapped[i].handler === handler) {
        wrapped.splice(i, 1);
        return;
      }
    }
  }
  function patchTarget(target){
    var originalAdd = target.addEventListener.bind(target);
    var originalRemove = target.removeEventListener.bind(target);
    var wrapped = []; // [{ original, handler, capture }] so removeEventListener can map back to the registered wrapper
    target.addEventListener = function(type, listener, options){
      if (type === 'keydown' && typeof listener === 'function') {
        var capture = captureFromOptions(options);
        for (var i = 0; i < wrapped.length; i++) {
          if (wrapped[i].original === listener && wrapped[i].capture === capture) return;
        }
        var once = onceFromOptions(options);
        var signal = signalFromOptions(options);
        if (signal && signal.aborted) {
          // Already aborted — browser will not register the listener; skip bookkeeping entirely
          return originalAdd(type, listener, options);
        }
        var handler = function(ev){
          if (once) removeWrappedEntry(wrapped, handler);
          if (shouldBlock() && (window.__odEditGuard.editingEl === ev.target || window.__odEditGuard.editingEl.contains(ev.target))) {
            return;
          }
          return listener.call(this, ev);
        };
        wrapped.push({ original: listener, handler: handler, capture: capture });
        if (signal) {
          signal.addEventListener('abort', function(){
            removeWrappedEntry(wrapped, handler);
          });
        }
        return originalAdd(type, handler, options);
      }
      return originalAdd(type, listener, options);
    };
    target.removeEventListener = function(type, listener, options){
      if (type === 'keydown' && typeof listener === 'function') {
        var capture = captureFromOptions(options);
        for (var i = wrapped.length - 1; i >= 0; i--) {
          var entry = wrapped[i];
          if (entry.original === listener && entry.capture === capture) {
            originalRemove(type, entry.handler, options);
            wrapped.splice(i, 1);
            return;
          }
        }
      }
      return originalRemove(type, listener, options);
    };
  }
  patchTarget(document);
  patchTarget(window);
})();</script>`;
}

export function buildManualEditBridge(enabled: boolean): string {
  return `<script data-od-edit-bridge>(function(){
  var enabled = ${JSON.stringify(enabled)};
  var discoverySelector = ${JSON.stringify(MANUAL_EDIT_DISCOVERY_SELECTOR)};
  var hostNodeSelector = ${JSON.stringify(MANUAL_EDIT_HOST_NODE_SELECTOR)};
  var sourcePathAttr = ${JSON.stringify(MANUAL_EDIT_SOURCE_PATH_ATTR)};
  var styleProps = ['fontFamily','fontSize','fontWeight','color','textAlign','lineHeight','letterSpacing','width','height','minHeight','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius'];
  function isHostNode(el){
    return !!(el && el.matches && el.matches(hostNodeSelector));
  }
  function domPath(el){
    var parts = [];
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) break;
      var children = Array.prototype.slice.call(parent.children).filter(function(child){ return !isHostNode(child); });
      parts.unshift(children.indexOf(node));
      node = parent;
    }
    return parts.length ? 'path-' + parts.join('-') : '';
  }
  function stableId(el){
    var explicit = el.getAttribute('data-od-id');
    if (explicit) return explicit;
    var generated = el.getAttribute(sourcePathAttr) || el.getAttribute('data-od-runtime-id') || domPath(el);
    if (generated) el.setAttribute('data-od-runtime-id', generated);
    return generated || 'unknown';
  }
  function isSourceMappable(el){
    return !!(el && el.hasAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute(sourcePathAttr)));
  }
  function isDiscoveryTarget(el){
    return !!(el && el.matches && el.matches(discoverySelector));
  }
  function isTextLeaf(el){
    var text = (el.textContent || '').trim();
    if (!text) return false;
    return el.children.length === 0;
  }
  function inferKind(el){
    var explicit = el.getAttribute('data-od-edit');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'a') return 'link';
    if (tag === 'img') return 'image';
    if (isTextLeaf(el)) return 'text';
    return 'container';
  }
  function labelFor(el, id, kind){
    var explicit = el.getAttribute('data-od-label');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, 42);
    if (kind === 'image') return el.getAttribute('alt') || id;
    return tag + ' #' + id;
  }
  function attrsFor(el){
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!attr || attr.name.indexOf('data-od-runtime') === 0 || attr.name === 'data-od-edit-selected') continue;
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
  function stylesFor(el){
    var computed = window.getComputedStyle(el);
    var styles = {};
    styleProps.forEach(function(prop){ styles[prop] = el.style[prop] || computed[prop] || ''; });
    return styles;
  }
  function isLayoutContainer(el){
    var display = window.getComputedStyle(el).display || '';
    if (display.indexOf('flex') >= 0 || display.indexOf('grid') >= 0) return true;
    return hasOwnDisplayHiddenState(el) && inferKind(el) === 'container';
  }
  function hasOwnDisplayHiddenState(el){
    var computed = window.getComputedStyle(el);
    return computed.display === 'none' || el.hasAttribute('hidden');
  }
  function hasHiddenAncestorDisplayState(el){
    var node = el;
    while (node && node !== document.documentElement) {
      if (hasOwnDisplayHiddenState(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
  function isHiddenTarget(el, rect){
    var targetVisibility = window.getComputedStyle(el).visibility;
    if (targetVisibility === 'hidden' || targetVisibility === 'collapse') return true;
    return hasHiddenAncestorDisplayState(el);
  }
  function targetFrom(el, includeOuterHtml){
    var rect = el.getBoundingClientRect();
    var kind = inferKind(el);
    var id = stableId(el);
    var hidden = isHiddenTarget(el, rect);
    var fields = {};
    if (kind === 'link') {
      fields.text = (el.textContent || '').trim();
      fields.href = el.getAttribute('href') || '';
    } else if (kind === 'image') {
      fields.src = el.getAttribute('src') || '';
      fields.alt = el.getAttribute('alt') || '';
    } else {
      fields.text = (el.textContent || '').trim();
    }
    return {
      id: id,
      kind: kind,
      label: labelFor(el, id, kind),
      tagName: el.tagName ? el.tagName.toLowerCase() : 'element',
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      fields: fields,
      attributes: attrsFor(el),
      styles: stylesFor(el),
      isLayoutContainer: isLayoutContainer(el),
      isHidden: hidden,
      outerHtml: includeOuterHtml ? (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '') : ''
    };
  }
  function allTargets(){
    var nodes = document.body ? document.body.querySelectorAll(discoverySelector) : [];
    var targets = [];
    for (var i = 0; i < nodes.length; i++) {
      var rect = nodes[i].getBoundingClientRect();
      if (!isSourceMappable(nodes[i])) continue;
      if (!isHiddenTarget(nodes[i], rect) && (rect.width < 4 || rect.height < 4)) continue;
      targets.push(targetFrom(nodes[i], false));
    }
    return targets;
  }
  function postTargets(){
    if (!enabled) return;
    window.parent.postMessage({ type: 'od-edit-targets', targets: allTargets() }, '*');
  }
  var lastHoverId = null;
  function postHoverTarget(el){
    if (!enabled || !el) return;
    var id = stableId(el);
    if (id === lastHoverId) return;
    lastHoverId = id;
    window.parent.postMessage({ type: 'od-edit-hover', target: targetFrom(el, true) }, '*');
  }
  function clearSelectedTarget(){
    var selected = document.querySelectorAll('[data-od-edit-selected]');
    for (var i = 0; i < selected.length; i++) selected[i].removeAttribute('data-od-edit-selected');
  }
  function setSelectedTarget(id){
    clearSelectedTarget();
    if (!id) return;
    var el = findById(id);
    if (el) el.setAttribute('data-od-edit-selected', 'true');
  }
  function closestTarget(event){
    var el = event.target;
    while (el && el !== document.documentElement) {
      if (el !== document.body && el !== document.documentElement && isSourceMappable(el) && isDiscoveryTarget(el)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }
  function caretRangeFromClick(clickEvent){
    try {
      if (document.caretPositionFromPoint) {
        var position = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
        if (!position) return null;
        var positionRange = document.createRange();
        positionRange.setStart(position.offsetNode, position.offset);
        positionRange.collapse(true);
        return positionRange;
      }
      if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
      }
    } catch (e) {}
    return null;
  }
  function placeCaretFromClick(clickEvent, el){
    var range = caretRangeFromClick(clickEvent);
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    try {
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }
  var guard = window.__odEditGuard || null;
  function makeEditable(el, clickEvent){
    if (!el || el.getAttribute('contenteditable') === 'true') return;
    var originalText = el.textContent || '';
    clearSelectedTarget();
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('data-od-editing', 'true');
    if (guard) guard.editingEl = el;
    try { el.focus(); } catch (e) {}
    placeCaretFromClick(clickEvent, el);
    function onKey(ev){
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        finish(true);
        try { el.blur(); } catch (e2) {}
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
        try { el.blur(); } catch (e2) {}
      }
    }
    el.addEventListener('keydown', onKey);
    function finish(commit){
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-od-editing');
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      if (guard) guard.editingEl = null;
      var value = (el.textContent || '').trim();
      if (commit && value !== originalText.trim()) {
        window.parent.postMessage({
          type: 'od-edit-text-commit',
          id: stableId(el),
          value: value
        }, '*');
      } else if (!commit) {
        el.textContent = originalText;
      }
    }
    function onBlur(){ finish(true); }
    el.addEventListener('blur', onBlur);
  }
  function camelToKebab(name){ return String(name).replace(/[A-Z]/g, function(m){ return '-' + m.toLowerCase(); }); }
  function cssEscapeId(value){ if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value); return String(value).replace(/"/g, '\\\\"'); }
  function findById(id){
    if (!id) return null;
    if (id === '__body__') return document.body;
    var el = document.querySelector('[data-od-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[data-od-runtime-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[' + sourcePathAttr + '="' + cssEscapeId(id) + '"]');
    if (el) return el;
    if (typeof id === 'string' && id.indexOf('path-') === 0) {
      var parts = id.slice('path-'.length).split('-').map(function(s){ return Number(s); });
      var node = document.body;
      for (var i = 0; i < parts.length; i++) {
        if (!node) return null;
        var idx = parts[i];
        if (!Number.isInteger(idx) || idx < 0) return null;
        var children = Array.prototype.slice.call(node.children).filter(function(c){ return !isHostNode(c); });
        node = children[idx] || null;
      }
      return node;
    }
    return null;
  }
  function applyPreviewStyles(id, styles, version){
    var el = findById(id);
    if (!el) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id || '', version: Number(version) || 0, ok: false, error: 'Target not found' }, '*');
      return;
    }
    var keys = Object.keys(styles || {});
    try {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = styles[key];
        var cssName = camelToKebab(key);
        if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
        else el.style.setProperty(cssName, value.trim());
      }
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: true }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: false, error: e && e.message ? String(e.message) : 'Could not apply preview styles' }, '*');
    }
  }
  window.addEventListener('message', function(ev){
    if (!ev.data) return;
    if (ev.data.type === 'od-edit-mode') {
      enabled = !!ev.data.enabled;
      document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
      if (!enabled) clearSelectedTarget();
      if (enabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      setSelectedTarget(ev.data.id || null);
      return;
    }
    if (ev.data.type === 'od-edit-hover-reset') {
      // Host signals the cursor truly left the canvas, so the next pointerover
      // re-announces the hovered element (defeats the per-element dedupe).
      lastHoverId = null;
      return;
    }
    if (ev.data.type === 'od-edit-preview-style') {
      applyPreviewStyles(ev.data.id, ev.data.styles || {}, ev.data.version);
      return;
    }
  });
  document.addEventListener('click', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var el = closestTarget(ev);
    if (!el) {
      // Clicking empty canvas (no source-mapped ancestor) is the gesture for
      // page-level styles; the host decides whether to surface the card.
      window.parent.postMessage({ type: 'od-edit-background' }, '*');
      return;
    }
    var kind = inferKind(el);
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true) }, '*');
    if (kind === 'text' || kind === 'link') {
      makeEditable(el, ev);
      return;
    }
  }, true);
  document.addEventListener('pointerover', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) return;
    postHoverTarget(el);
  }, true);
  window.addEventListener('resize', postTargets);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
  document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
})();</script>`;
}

export function buildManualEditBridgeStyle(): string {
  return `<style data-od-edit-bridge-style>
html[data-od-edit-mode] body * { cursor: pointer !important; }
html[data-od-edit-mode] [data-od-id],
html[data-od-edit-mode] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-source-path] { outline: 1px dashed rgba(37, 99, 235, 0.35); outline-offset: 3px; }
html[data-od-edit-mode] [data-od-id]:hover,
html[data-od-edit-mode] [data-od-runtime-id]:hover,
html[data-od-edit-mode] [data-od-source-path]:hover { outline: 2px solid #2563eb; }
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: 2px solid #2563eb !important;
  outline-offset: 4px;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.16);
}
html[data-od-edit-mode] [data-od-editing="true"] {
  outline: 2px solid #2563eb !important;
  outline-offset: 4px;
  background: rgba(37, 99, 235, 0.06);
  cursor: text !important;
}
</style>`;
}
