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
  if (isManualEditHostNode(el)) return false;
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
  var styleProps = ['fontFamily','fontSize','fontWeight','color','textAlign','lineHeight','letterSpacing','width','height','minHeight','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius','position','left','top','right','bottom','transform','zIndex','boxShadow'];
  var dragState = null; // { el, startX, startY, startLeft, startTop, startWidth, startHeight, handle, id }
  var handles = []; // live handle elements
  var selectedElForHandles = null; // which element currently has handles shown
  var selectedIds = {}; // map of id → true for multi-selected elements
  var rubberband = null; // { el, startX, startY } for drag-to-select rectangle
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
    if (!el || !el.hasAttribute || isHostNode(el)) return false;
    return !!(el.hasAttribute('data-od-id') || el.hasAttribute(sourcePathAttr));
  }
  function markBrandKitTarget(el, id, kind, label){
    if (!el || !el.setAttribute || isHostNode(el)) return;
    if (!el.hasAttribute('data-od-id')) el.setAttribute('data-od-id', id);
    if (kind && !el.hasAttribute('data-od-edit')) el.setAttribute('data-od-edit', kind);
    if (label && !el.hasAttribute('data-od-label')) el.setAttribute('data-od-label', label);
  }
  function markBrandKitOne(selector, id, kind, label){
    markBrandKitTarget(document.querySelector(selector), id, kind, label);
  }
  function annotateBrandKitRuntimeTargets(){
    if (!document.getElementById('od-brand-payload')) return;
    markBrandKitOne('.kit-head', 'brand-header', 'container', 'Brand header');
    markBrandKitOne('.kit-title', 'brand-name', 'text');
    markBrandKitOne('.kit-tagline', 'brand-tagline', 'text');
    markBrandKitOne('.kit-source', 'brand-source', 'link');
    markBrandKitOne('.head-actions', 'brand-header-actions', 'container');
    markBrandKitOne('.logo-empty', 'brand-logo-empty', 'container', 'Logo empty state');
    markBrandKitOne('.logo-stage', 'brand-logo-stage', 'container', 'Logo stage');
    markBrandKitOne('#logo-img', 'brand-logo-img', 'image');
    markBrandKitOne('.logo-notes', 'brand-logo-notes', 'text');
    Array.prototype.forEach.call(document.querySelectorAll('.logo-thumb'), function(el, i){ markBrandKitTarget(el, 'brand-logo-thumb-' + i, 'image'); });
    markBrandKitOne('.fonts', 'brand-fonts', 'container');
    Array.prototype.forEach.call(document.querySelectorAll('.font-tile'), function(el, i){
      markBrandKitTarget(el, 'brand-font-tile-' + i, 'container');
      markBrandKitTarget(el.querySelector('.ag'), 'brand-font-sample-' + i, 'text');
      markBrandKitTarget(el.querySelector('.ft-name'), 'brand-font-name-' + i, 'text');
      markBrandKitTarget(el.querySelector('.ft-role'), 'brand-font-role-' + i, 'text');
    });
    markBrandKitOne('.kit-hero', 'brand-hero-image', 'container');
    markBrandKitOne('.kit-hero img', 'brand-hero-img', 'image');
    Array.prototype.forEach.call(document.querySelectorAll('.type-row'), function(el, i){
      markBrandKitTarget(el, 'brand-type-' + i, 'container');
      markBrandKitTarget(el.querySelector('.type-label'), 'brand-type-label-' + i, 'text');
      markBrandKitTarget(el.querySelector('.type-font'), 'brand-type-font-' + i, 'text');
      markBrandKitTarget(el.querySelector('.type-sample'), 'brand-type-sample-' + i, 'text');
    });
    markBrandKitOne('.palette', 'brand-palette', 'container');
    Array.prototype.forEach.call(document.querySelectorAll('.swatch'), function(el, i){
      markBrandKitTarget(el, 'brand-color-' + i, 'container');
      markBrandKitTarget(el.querySelector('.hex'), 'brand-color-hex-' + i, 'text');
      markBrandKitTarget(el.querySelector('.swatch-name'), 'brand-color-name-' + i, 'text');
      markBrandKitTarget(el.querySelector('.swatch-role'), 'brand-color-role-' + i, 'text');
      markBrandKitTarget(el.querySelector('.swatch-usage'), 'brand-color-usage-' + i, 'text');
    });
    markBrandKitOne('.voice-tone', 'brand-voice-tone', 'text');
    markBrandKitOne('.vocab .use .v', 'brand-voice-vocab-use', 'text');
    markBrandKitOne('.vocab .avoid .v', 'brand-voice-vocab-avoid', 'text');
    Array.prototype.forEach.call(document.querySelectorAll('.chips .chip'), function(el, i){ markBrandKitTarget(el, 'brand-voice-adjective-' + i, 'text'); });
    Array.prototype.forEach.call(document.querySelectorAll('.pillars li span:last-child'), function(el, i){ markBrandKitTarget(el, 'brand-voice-pillar-' + i, 'text'); });
    markBrandKitOne('.imagery', 'brand-imagery-card', 'container');
    markBrandKitOne('.imagery p:first-child', 'brand-imagery-style', 'text');
    markBrandKitOne('.gallery', 'brand-images-section', 'container');
    Array.prototype.forEach.call(document.querySelectorAll('.shot'), function(el, i){
      markBrandKitTarget(el, 'brand-image-' + i, 'container');
      markBrandKitTarget(el.querySelector('img'), 'brand-image-img-' + i, 'image');
      markBrandKitTarget(el.querySelector('.shot-cap'), 'brand-image-caption-' + i, 'text');
      markBrandKitTarget(el.querySelector('.shot-kind'), 'brand-image-kind-' + i, 'text');
    });
    markBrandKitOne('.ds-frame-wrap', 'brand-system-section', 'container');
    markBrandKitOne('.assets', 'brand-assets-section', 'container');
    Array.prototype.forEach.call(document.querySelectorAll('.asset'), function(el, i){
      markBrandKitTarget(el, 'brand-asset-' + i, 'container');
      markBrandKitTarget(el.querySelector('.asset-name'), 'brand-asset-name-' + i, 'text');
      markBrandKitTarget(el.querySelector('.asset-desc'), 'brand-asset-desc-' + i, 'text');
    });
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
      outerHtml: includeOuterHtml ? (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-id="path-[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '') : ''
    };
  }
  function allTargets(){
    annotateBrandKitRuntimeTargets();
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
    annotateBrandKitRuntimeTargets();
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
  // A single in-flight inline text edit. The session is deliberately NOT tied
  // to iframe blur: moving the pointer to the host's floating inspector blurs
  // the iframe, and committing/ending on blur is exactly the #3646 focus-loss
  // bug. The session ends only on an explicit action — Enter, Escape, picking
  // another target, clicking empty background, leaving edit mode, or an
  // od-edit-text-finish message from the host.
  var activeTextEdit = null;
  function postTextSession(el, active, extra){
    if (!el) return;
    window.parent.postMessage(Object.assign({
      type: 'od-edit-text-session',
      id: stableId(el),
      active: !!active
    }, extra || {}), '*');
  }
  function finishActiveTextEdit(commit){
    if (!activeTextEdit) return false;
    var session = activeTextEdit;
    activeTextEdit = null;
    var el = session.el;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-od-editing');
    el.removeEventListener('keydown', session.onKey);
    if (guard) guard.editingEl = null;
    var value = (el.textContent || '').trim();
    var changed = value !== session.originalText.trim();
    if (commit && changed) {
      window.parent.postMessage({
        type: 'od-edit-text-commit',
        id: stableId(el),
        value: value
      }, '*');
    } else if (!commit) {
      el.textContent = session.originalText;
    }
    postTextSession(el, false, { committed: !!commit, changed: changed });
    return true;
  }
  function makeEditable(el, clickEvent){
    if (!el) return;
    if (activeTextEdit && activeTextEdit.el === el) {
      placeCaretFromClick(clickEvent, el);
      return;
    }
    if (activeTextEdit) finishActiveTextEdit(true);
    if (el.getAttribute('contenteditable') === 'true') return;
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
        finishActiveTextEdit(true);
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finishActiveTextEdit(false);
      }
    }
    activeTextEdit = { el: el, originalText: originalText, onKey: onKey };
    el.addEventListener('keydown', onKey);
    postTextSession(el, true);
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
      if (!enabled) {
        // Leaving edit mode commits the pending inline edit rather than
        // dropping it (the #3647 exit-path regression).
        finishActiveTextEdit(true);
        clearSelectedTarget();
        removeHandles();
        removeRotationHandle();
      }
      if (enabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      setSelectedTarget(ev.data.id || null);
      if (!enabled) return;
      if (ev.data.id) {
        var selEl2 = findById(ev.data.id);
        if (selEl2) setTimeout(function(){ createHandles(selEl2); }, 0);
        else removeHandles();
      } else {
        removeHandles();
      }
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
    if (ev.data.type === 'od-edit-text-finish') {
      finishActiveTextEdit(ev.data.commit !== false);
      return;
    }
  });
  // ── Drag & Resize Engine ──

  var HANDLE_SIZE = 8;
  var DRAG_THRESHOLD = 3; // px before drag activates (vs click)

  // ── Multi-select helpers ──
  function getSelectedCount(){ var n=0; for (var _k in selectedIds) n++; return n; }
  function getSelectedIds(){ var ids=[]; for (var _k in selectedIds) ids.push(_k); return ids; }
  function isSelectedId(id){ return !!selectedIds[id]; }
  function addToMultiSelectionById(id){ if (id){ selectedIds[id]=true; } }
  function removeFromMultiSelectionById(id){ if (id){ delete selectedIds[id]; } }
  function clearMultiSelection(){ selectedIds={}; }
  function applyMultiSelectionAttrs(){
    // Highlight all selected elements, focus highlight on the last clicked
    var all = document.querySelectorAll('[data-od-edit-selected]');
    for (var s=0; s<all.length; s++) all[s].removeAttribute('data-od-edit-selected');
    var ids = getSelectedIds();
    for (var j=0; j<ids.length; j++){
      var selEl = findById(ids[j]);
      if (selEl) selEl.setAttribute('data-od-edit-selected', 'true');
    }
  }
  function postMultiSelect(){
    window.parent.postMessage({ type: 'od-edit-multi-select', ids: getSelectedIds() }, '*');
    applyMultiSelectionAttrs();
  }

  // ── Rubberband drag-to-select ──
  function startRubberband(clientX, clientY){
    rubberband = { startX: clientX, startY: clientY, el: null };
  }
  function updateRubberband(clientX, clientY){
    if (!rubberband) return;
    var rx = Math.min(rubberband.startX, clientX);
    var ry = Math.min(rubberband.startY, clientY);
    var rw = Math.max(10, Math.abs(clientX - rubberband.startX));
    var rh = Math.max(10, Math.abs(clientY - rubberband.startY));
    if (!rubberband.el){
      rubberband.el = document.createElement('div');
      rubberband.el.setAttribute('data-od-rubberband', '');
      rubberband.el.style.cssText = 'position:fixed;z-index:2147483646;background:rgba(37,99,235,0.12);border:1px solid #2563eb;pointer-events:none;';
      document.body.appendChild(rubberband.el);
    }
    rubberband.el.style.left = rx + 'px';
    rubberband.el.style.top = ry + 'px';
    rubberband.el.style.width = rw + 'px';
    rubberband.el.style.height = rh + 'px';
  }
  function endRubberband(clientX, clientY){
    if (!rubberband) return;
    if (rubberband.el && rubberband.el.parentNode) rubberband.el.parentNode.removeChild(rubberband.el);
    // Find elements intersecting rubberband rectangle
    var rx = Math.min(rubberband.startX, clientX);
    var ry = Math.min(rubberband.startY, clientY);
    var rw = Math.abs(clientX - rubberband.startX);
    var rh = Math.abs(clientY - rubberband.startY);
    // Only activate if rubberband is larger than a click (>= 5px)
    if (rw < 5 && rh < 5){ rubberband = null; return; }
    var rubberbandRect = { left: rx, top: ry, right: rx+rw, bottom: ry+rh };
    clearMultiSelection();
    var allEls = document.querySelectorAll(discoverySelector);
    for (var i=0; i<allEls.length; i++){
      var el2 = allEls[i];
      if (!isSourceMappable(el2)) continue;
      var rect2 = el2.getBoundingClientRect();
      if (rect2.right > rubberbandRect.left && rect2.left < rubberbandRect.right &&
          rect2.bottom > rubberbandRect.top && rect2.top < rubberbandRect.bottom){
        addToMultiSelectionById(stableId(el2));
      }
    }
    rubberband = null;
    postMultiSelect();
    if (getSelectedCount() >= 1){
      // Show handles on first selected
      var firstId = getSelectedIds()[0];
      if (firstId) {
        var firstEl = findById(firstId);
        if (firstEl) createHandles(firstEl);
      }
    }
  }

  // ── Multi-element drag helpers ──
  function getSelectedElements(){
    var result = [];
    var ids = getSelectedIds();
    for (var i=0; i<ids.length; i++){
      var el3 = findById(ids[i]);
      if (el3 && el3.isConnected) result.push(el3);
    }
    return result;
  }
  function commitMultiPosition(els){
    var positions = [];
    for (var m=0; m<els.length; m++){
      var e = els[m];
      if (!e || !e.isConnected) continue;
      var r = e.getBoundingClientRect();
      positions.push({ id: stableId(e), left: Math.round(r.left)+'px', top: Math.round(r.top)+'px', width: Math.round(r.width)+'px', height: Math.round(r.height)+'px' });
    }
    if (positions.length > 0){
      window.parent.postMessage({ type: 'od-edit-position-commit-batch', positions: positions }, '*');
    }
  }

  // ── Rotation handle ──
  var rotationHandle = null;
  var rotationLineEl = null;
  function createRotationHandle(el){
    removeRotationHandle();
    if (!el || !el.isConnected) return;
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top;
    // Connecting line
    var line = document.createElement('div');
    line.setAttribute('data-od-rotation-line', '');
    line.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;background:#2563eb;left:' + cx + 'px;top:' + (cy - 24) + 'px;width:1px;height:24px;';
    document.body.appendChild(line);
    rotationLineEl = line;
    // Handle circle
    var handle = document.createElement('div');
    handle.setAttribute('data-od-rotation-handle', '');
    handle.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:auto;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #2563eb;cursor:grab;transform:translate(-50%,-50%);left:' + cx + 'px;top:' + (cy - 30) + 'px;';
    document.body.appendChild(handle);
    rotationHandle = { el: handle, cx: cx, cy: cy, w: rect.width, h: rect.height, targetEl: el };
  }
  function updateRotationHandlePos(el){
    if (!rotationHandle || rotationHandle.targetEl !== el) { removeRotationHandle(); return; }
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    rotationHandle.cx = cx;
    rotationHandle.cy = rect.top;
    rotationHandle.el.style.left = cx + 'px';
    rotationHandle.el.style.top = (rect.top - 30) + 'px';
    if (rotationLineEl){
      rotationLineEl.style.left = cx + 'px';
      rotationLineEl.style.top = (rect.top - 24) + 'px';
    }
  }
  function removeRotationHandle(){
    if (rotationHandle && rotationHandle.el.parentNode) rotationHandle.el.parentNode.removeChild(rotationHandle.el);
    if (rotationLineEl && rotationLineEl.parentNode) rotationLineEl.parentNode.removeChild(rotationLineEl);
    rotationHandle = null;
    rotationLineEl = null;
  }

  function removeHandles(){
    for (var i = 0; i < handles.length; i++) {
      if (handles[i] && handles[i].parentNode) handles[i].parentNode.removeChild(handles[i]);
    }
    handles = [];
    selectedElForHandles = null;
  }

  function createHandles(el){
    removeHandles();
    if (!el || el === document.body || el === document.documentElement) return;
    // Guard: element destroyed by srcdoc reload after position commit
    if (!el.isConnected) return;
    selectedElForHandles = el;
    var rect = el.getBoundingClientRect();
    var containerEl = el.offsetParent || document.body;
    if (!containerEl || !containerEl.isConnected) return;
    var containerRect = containerEl.getBoundingClientRect();
    var positions = [
      { h: 'nw', cursor: 'nwse-resize', left: rect.left - containerRect.left - HANDLE_SIZE/2, top: rect.top - containerRect.top - HANDLE_SIZE/2 },
      { h: 'n',  cursor: 'ns-resize',   left: rect.left - containerRect.left + rect.width/2 - HANDLE_SIZE/2, top: rect.top - containerRect.top - HANDLE_SIZE/2 },
      { h: 'ne', cursor: 'nesw-resize', left: rect.left - containerRect.left + rect.width - HANDLE_SIZE/2, top: rect.top - containerRect.top - HANDLE_SIZE/2 },
      { h: 'e',  cursor: 'ew-resize',   left: rect.left - containerRect.left + rect.width - HANDLE_SIZE/2, top: rect.top - containerRect.top + rect.height/2 - HANDLE_SIZE/2 },
      { h: 'se', cursor: 'nwse-resize', left: rect.left - containerRect.left + rect.width - HANDLE_SIZE/2, top: rect.top - containerRect.top + rect.height - HANDLE_SIZE/2 },
      { h: 's',  cursor: 'ns-resize',   left: rect.left - containerRect.left + rect.width/2 - HANDLE_SIZE/2, top: rect.top - containerRect.top + rect.height - HANDLE_SIZE/2 },
      { h: 'sw', cursor: 'nesw-resize', left: rect.left - containerRect.left - HANDLE_SIZE/2, top: rect.top - containerRect.top + rect.height - HANDLE_SIZE/2 },
      { h: 'w',  cursor: 'ew-resize',   left: rect.left - containerRect.left - HANDLE_SIZE/2, top: rect.top - containerRect.top + rect.height/2 - HANDLE_SIZE/2 },
    ];
    for (var j = 0; j < positions.length; j++) {
      var p = positions[j];
      var handle = document.createElement('div');
      handle.setAttribute('data-od-drag-handle', p.h);
      handle.style.cssText = [
        'position:absolute',
        'left:' + Math.round(p.left) + 'px',
        'top:' + Math.round(p.top) + 'px',
        'width:' + HANDLE_SIZE + 'px',
        'height:' + HANDLE_SIZE + 'px',
        'background:#2563eb',
        'border:2px solid #fff',
        'border-radius:1px',
        'z-index:2147483647',
        'pointer-events:auto',
        'cursor:' + p.cursor,
        'box-sizing:border-box',
      ].join(';');
      containerEl.appendChild(handle);
      handles.push(handle);
    }
  }

  function updateHandlePositions(el){
    if (selectedElForHandles !== el) return;
    if (!el) { removeHandles(); return; }
    var rect = el.getBoundingClientRect();
    var containerEl = el.offsetParent || document.body;
    var containerRect = containerEl.getBoundingClientRect();
    var offsets = [
      { h: 'nw', left: -HANDLE_SIZE/2, top: -HANDLE_SIZE/2 },
      { h: 'n',  left: rect.width/2 - HANDLE_SIZE/2, top: -HANDLE_SIZE/2 },
      { h: 'ne', left: rect.width - HANDLE_SIZE/2, top: -HANDLE_SIZE/2 },
      { h: 'e',  left: rect.width - HANDLE_SIZE/2, top: rect.height/2 - HANDLE_SIZE/2 },
      { h: 'se', left: rect.width - HANDLE_SIZE/2, top: rect.height - HANDLE_SIZE/2 },
      { h: 's',  left: rect.width/2 - HANDLE_SIZE/2, top: rect.height - HANDLE_SIZE/2 },
      { h: 'sw', left: -HANDLE_SIZE/2, top: rect.height - HANDLE_SIZE/2 },
      { h: 'w',  left: -HANDLE_SIZE/2, top: rect.height/2 - HANDLE_SIZE/2 },
    ];
    for (var j = 0; j < handles.length; j++) {
      if (j >= offsets.length) break;
      var o = offsets[j];
      handles[j].style.left = Math.round(rect.left - containerRect.left + o.left) + 'px';
      handles[j].style.top = Math.round(rect.top - containerRect.top + o.top) + 'px';
    }
  }

  function parseRotation(el){
    var t = el.style.transform || '';
    var m = t.match(/rotate\((-?[0-9.]+)deg\)/);
    return m ? parseFloat(m[1]) : 0;
  }
  function ensureAbsolute(el){
    var pos = window.getComputedStyle(el).position;
    if (pos !== 'absolute' && pos !== 'fixed') {
      var rect = el.getBoundingClientRect();
      el.style.position = 'absolute';
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.style.margin = '0';
    }
  }

  function commitPosition(el, id){
    var rect = el.getBoundingClientRect();
    var msg = {
      type: 'od-edit-position-commit',
      id: id,
      left: Math.round(rect.left) + 'px',
      top: Math.round(rect.top) + 'px',
      width: Math.round(rect.width) + 'px',
      height: Math.round(rect.height) + 'px',
    };
    var t = el.style.transform || '';
    if (t) msg.transform = t;
    window.parent.postMessage(msg, '*');
  }

  // Pointer handlers for drag + resize
  function onPointerDown(ev){
    if (!enabled) return;
    // Check rotation handle first
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-rotation-handle]')){
      ev.preventDefault(); ev.stopPropagation();
      if (!rotationHandle) return;
      dragState = { el: rotationHandle.targetEl, startX: ev.clientX, startY: ev.clientY, handle: 'rotate', id: stableId(rotationHandle.targetEl), moved: false,
        startLeft: rotationHandle.cx, startTop: rotationHandle.cy, startWidth: 0, startHeight: 0, rotationStart: parseRotation(rotationHandle.targetEl) };
      rotationHandle.targetEl.setPointerCapture(ev.pointerId);
      return;
    }
    // Check handle hit first
    var handleEl = ev.target && ev.target.closest ? ev.target.closest('[data-od-drag-handle]') : null;
    if (handleEl && selectedElForHandles) {
      ev.preventDefault();
      ev.stopPropagation();
      var el = selectedElForHandles;
      ensureAbsolute(el);
      var rect = el.getBoundingClientRect();
      dragState = {
        el: el,
        startX: ev.clientX,
        startY: ev.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startWidth: rect.width,
        startHeight: rect.height,
        handle: handleEl.getAttribute('data-od-drag-handle'),
        id: stableId(el),
        moved: false,
      };
      el.setPointerCapture(ev.pointerId);
      window.parent.postMessage({ type: 'od-edit-drag-start', id: dragState.id }, '*');
      return;
    }
    // Check if pointer is on a selectable element
    var targetEl = closestTarget(ev);
    var targetId = targetEl ? stableId(targetEl) : null;
    var isMultiDrag = targetEl && isSelectedId(targetId) && getSelectedCount() > 1;

    if (targetEl && !handleEl && (targetEl === selectedElForHandles || isMultiDrag)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (isMultiDrag) {
        // Multi-drag: store all selected elements
        var selEls = getSelectedElements();
        var multiEls = [];
        for (var i2 = 0; i2 < selEls.length; i2++) {
          var selEl = selEls[i2];
          ensureAbsolute(selEl);
          var sr = selEl.getBoundingClientRect();
          multiEls.push({ el: selEl, startLeft: sr.left, startTop: sr.top });
        }
        dragState = {
          el: targetEl,
          startX: ev.clientX,
          startY: ev.clientY,
          startLeft: 0, startTop: 0,
          startWidth: 0, startHeight: 0,
          handle: 'body',
          id: targetId,
          moved: false,
          multiEls: multiEls,
        };
      } else {
        // Single drag
        ensureAbsolute(targetEl);
        var rect2 = targetEl.getBoundingClientRect();
        dragState = {
          el: targetEl,
          startX: ev.clientX,
          startY: ev.clientY,
          startLeft: rect2.left,
          startTop: rect2.top,
          startWidth: rect2.width,
          startHeight: rect2.height,
          handle: 'body',
          id: targetId,
          moved: false,
        };
      }
      targetEl.setPointerCapture(ev.pointerId);
      window.parent.postMessage({ type: 'od-edit-drag-start', id: dragState.id }, '*');
      return;
    }
    // Start rubberband on background click (no source-mapped ancestor)
    if (!targetEl && !handleEl){
      startRubberband(ev.clientX, ev.clientY);
      return;
    }
  }

  function onPointerMove(ev){
    if (rubberband) { updateRubberband(ev.clientX, ev.clientY); return; }
    if (!dragState) return;
    // Rotation
    if (dragState.handle === 'rotate'){
      var angle = Math.atan2(ev.clientY - dragState.cy, ev.clientX - dragState.cx) * 180 / Math.PI + 90;
      dragState.el.style.transform = 'rotate(' + Math.round(angle) + 'deg)';
      dragState.moved = true;
      updateRotationHandlePos(dragState.el);
      updateHandlePositions(dragState.el);
      return;
    }
    var dx = ev.clientX - dragState.startX;
    var dy = ev.clientY - dragState.startY;
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    dragState.moved = true;
    // Multi-drag
    if (dragState.multiEls){
      for (var mi=0; mi<dragState.multiEls.length; mi++){
        var me = dragState.multiEls[mi];
        me.el.style.left = (me.startLeft + dx) + 'px';
        me.el.style.top = (me.startTop + dy) + 'px';
      }
      updateHandlePositions(dragState.el);
      return;
    }
    var el = dragState.el;
    if (dragState.handle === 'body') {
      el.style.left = (dragState.startLeft + dx) + 'px';
      el.style.top = (dragState.startTop + dy) + 'px';
    } else {
      // Resize — anchor the opposite corner
      var h = dragState.handle;
      var newLeft = dragState.startLeft;
      var newTop = dragState.startTop;
      var newW = dragState.startWidth;
      var newH = dragState.startHeight;
      if (h.indexOf('e') >= 0) { newW = Math.max(10, dragState.startWidth + dx); }
      if (h.indexOf('w') >= 0) { newLeft = dragState.startLeft + dx; newW = Math.max(10, dragState.startWidth - dx); }
      if (h.indexOf('s') >= 0) { newH = Math.max(10, dragState.startHeight + dy); }
      if (h.indexOf('n') >= 0) { newTop = dragState.startTop + dy; newH = Math.max(10, dragState.startHeight - dy); }
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
      el.style.width = newW + 'px';
      el.style.height = newH + 'px';
    }
    updateHandlePositions(el);
  }

  function onPointerUp(ev){
    if (rubberband) { endRubberband(ev.clientX, ev.clientY); return; }
    if (!dragState) return;
    var el = dragState.el;
    var id = dragState.id;
    try { el.releasePointerCapture(ev.pointerId); } catch(e) {}
    if (dragState.handle === 'rotate'){
      if (dragState.moved){
        commitPosition(el, id);
        dragEndedJustNow = true;
      }
      dragState = null;
      updateRotationHandlePos(el);
      updateHandlePositions(el);
      return;
    }
    if (dragState.moved) {
      if (dragState.multiEls){
        commitMultiPosition(dragState.multiEls.map(function(m2){ return m2.el; }));
        dragEndedJustNow = true;
      } else {
        commitPosition(el, id);
        dragEndedJustNow = true;
      }
    }
    dragState = null;
    if (el) {
      updateHandlePositions(el);
      window.parent.postMessage({ type: 'od-edit-drag-end', id: id || '' }, '*');
    }
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  // Also listen on pointerup outside iframe bounds
  document.addEventListener('pointerleave', function(ev){
    if (rubberband){
      if (rubberband.el && rubberband.el.parentNode) rubberband.el.parentNode.removeChild(rubberband.el);
      rubberband = null;
      return;
    }
    if (dragState) {
      var el2 = dragState.el;
      var id2 = dragState.id;
      try { el2.releasePointerCapture(ev.pointerId); } catch(e) {}
      if (dragState.moved) {
        if (dragState.multiEls){
          commitMultiPosition(dragState.multiEls.map(function(m2){ return m2.el; }));
        } else {
          commitPosition(el2, id2);
        }
      }
      dragState = null;
      window.parent.postMessage({ type: 'od-edit-drag-end', id: id2 || '' }, '*');
    }
  }, true);

  // ── end drag engine ──

  var dragEndedJustNow = false;
  document.addEventListener('click', function(ev){
    if (!enabled) return;
    if (dragEndedJustNow) { dragEndedJustNow = false; return; }
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-drag-handle]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var el = closestTarget(ev);
    if (!el) {
      removeHandles();
      clearMultiSelection();
      postMultiSelect();
      if (activeTextEdit) finishActiveTextEdit(true);
      window.parent.postMessage({ type: 'od-edit-background' }, '*');
      return;
    }
    var id = stableId(el);
    if (ev.shiftKey) {
      // Shift+click: toggle individual element in multi-selection
      if (isSelectedId(id)) { removeFromMultiSelectionById(id); }
      else { addToMultiSelectionById(id); }
      // Show handles on last-clicked
      if (el) { createHandles(el); }
      postMultiSelect();
      // If single after toggle, also send select for inspector
      if (getSelectedCount() === 1){
        window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true) }, '*');
      }
      return;
    }
    if (isSelectedId(id) && getSelectedCount() > 1){
      // Click on a multi-selected element: collapse to single select
      clearMultiSelection();
      addToMultiSelectionById(id);
      postMultiSelect();
    } else if (!isSelectedId(id)){
      // Click on unselected element: clear multi-select
      clearMultiSelection();
      addToMultiSelectionById(id);
      postMultiSelect();
    }
    if (activeTextEdit && activeTextEdit.el !== el) finishActiveTextEdit(true);
    var kind = inferKind(el);
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true) }, '*');
    // Show resize handles for selected element
    setTimeout(function(){ createHandles(el); createRotationHandle(el); }, 0);
    if (kind === 'text' || kind === 'link') {
      makeEditable(el, ev);
      return;
    }
  }, true);
  document.addEventListener('pointerover', function(ev){
    if (!enabled) return;
    // While editing, hovering must not retarget the inspector or surface a new
    // affordance — that's the other half of the #3646 instability.
    if (activeTextEdit) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) return;
    postHoverTarget(el);
  }, true);
  window.addEventListener('resize', postTargets);
  function bootEditBridge(){
    annotateBrandKitRuntimeTargets();
    postTargets();
    var brandRoot = document.getElementById('root') || document.body;
    if (window.MutationObserver && brandRoot && document.getElementById('od-brand-payload')) {
      new MutationObserver(function(){ annotateBrandKitRuntimeTargets(); postTargets(); })
        .observe(brandRoot, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootEditBridge);
  else setTimeout(bootEditBridge, 0);
  document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
})();</script>`;
}

export function buildManualEditBridgeStyle(): string {
  return `<style data-od-edit-bridge-style>
html[data-od-edit-mode] body * { cursor: pointer !important; }
html[data-od-edit-mode] [data-od-id],
html[data-od-edit-mode] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-source-path] { outline: 1px dashed rgba(37, 99, 235, 0.35) !important; outline-offset: 3px !important; }
html[data-od-edit-mode] [data-od-id]:hover,
html[data-od-edit-mode] [data-od-runtime-id]:hover,
html[data-od-edit-mode] [data-od-source-path]:hover { outline: 2px solid #2563eb !important; outline-offset: 3px !important; }
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
[data-od-drag-handle] {
  pointer-events: auto !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.9);
}
</style>`;
}
