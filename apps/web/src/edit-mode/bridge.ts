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
 * deliberately NOT text leaves. `applyManualEditPatch` can persist a flat
 * text edit through nested markup when exactly one descendant text node
 * carries the visible text (an icon `<span>` beside a label being the common
 * case), but it still refuses whenever that target is ambiguous — so
 * classifying every container as a text leaf would let the user type over
 * genuinely mixed inline content (e.g. `<p><strong>Nested</strong> copy</p>`)
 * and then fail to persist. Those stay containers (style-only) until caret
 * availability itself is worth broadening beyond this per-kind allowlist.
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
  var styleProps = ['fontFamily','fontSize','fontWeight','color','textAlign','lineHeight','letterSpacing','width','height','minHeight','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius','transform','display','position','left','top','right','bottom','zIndex','boxShadow','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
  var dragState = null; // { el, startX, startY, startLeft, startTop, startWidth, startHeight, handle, id }
  var handles = []; // live handle elements (8 resize)
  var cornerHandles = []; // live corner-radius handles (4)
  var selectedElForHandles = null; // which element currently has handles shown
  var selectedIds = {}; // map of id → true for multi-selected elements
  var rubberband = null; // { el, startX, startY } for drag-to-select rectangle
  var activeTool = null; // 'rect' | 'circle' | 'text' | 'line' | 'image' | null
  var placementStartX = 0, placementStartY = 0;
  var previewEl = null; // visual preview of shape being drawn
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
  function rectFor(el){
    if (!el || !el.getBoundingClientRect) return null;
    var rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }
  function computedSummaryFor(el){
    var computed = window.getComputedStyle(el);
    return {
      display: computed.display || '',
      position: computed.position || '',
      fontFamily: computed.fontFamily || '',
      fontSize: computed.fontSize || '',
      fontWeight: computed.fontWeight || '',
      lineHeight: computed.lineHeight || '',
      letterSpacing: computed.letterSpacing || '',
      color: computed.color || '',
      backgroundColor: computed.backgroundColor || '',
      borderColor: computed.borderColor || '',
      borderRadius: computed.borderRadius || '',
      padding: computed.padding || '',
      margin: computed.margin || ''
    };
  }
  function siblingRectsFor(el){
    var parent = el && el.parentElement;
    if (!parent) return [];
    return Array.prototype.slice.call(parent.children)
      .filter(function(child){ return child !== el && !isHostNode(child); })
      .map(rectFor)
      .filter(Boolean)
      .slice(0, 24);
  }
  function alignmentGuidesFor(rect, parentRect){
    var guides = [];
    if (!rect) return guides;
    guides.push({ orientation: 'vertical', position: rect.x, label: 'left' });
    guides.push({ orientation: 'vertical', position: rect.x + Math.round(rect.width / 2), label: 'center' });
    guides.push({ orientation: 'vertical', position: rect.x + rect.width, label: 'right' });
    guides.push({ orientation: 'horizontal', position: rect.y, label: 'top' });
    guides.push({ orientation: 'horizontal', position: rect.y + Math.round(rect.height / 2), label: 'middle' });
    guides.push({ orientation: 'horizontal', position: rect.y + rect.height, label: 'bottom' });
    if (parentRect) {
      guides.push({ orientation: 'vertical', position: parentRect.x + Math.round(parentRect.width / 2), label: 'parent center' });
      guides.push({ orientation: 'horizontal', position: parentRect.y + Math.round(parentRect.height / 2), label: 'parent middle' });
    }
    return guides;
  }
  function measurementsFor(rect, parentRect, siblings){
    var measurements = [];
    if (!rect || !parentRect) return measurements;
    measurements.push({
      label: 'left',
      value: Math.max(0, Math.round(rect.x - parentRect.x)),
      orientation: 'horizontal',
      from: parentRect,
      to: rect
    });
    measurements.push({
      label: 'top',
      value: Math.max(0, Math.round(rect.y - parentRect.y)),
      orientation: 'vertical',
      from: parentRect,
      to: rect
    });
    measurements.push({
      label: 'right',
      value: Math.max(0, Math.round(parentRect.x + parentRect.width - rect.x - rect.width)),
      orientation: 'horizontal',
      from: rect,
      to: parentRect
    });
    measurements.push({
      label: 'bottom',
      value: Math.max(0, Math.round(parentRect.y + parentRect.height - rect.y - rect.height)),
      orientation: 'vertical',
      from: rect,
      to: parentRect
    });
    var nearest = (siblings || [])
      .map(function(sibling){
        var horizontalGap = sibling.x >= rect.x + rect.width
          ? sibling.x - rect.x - rect.width
          : rect.x >= sibling.x + sibling.width
            ? rect.x - sibling.x - sibling.width
            : null;
        var verticalGap = sibling.y >= rect.y + rect.height
          ? sibling.y - rect.y - rect.height
          : rect.y >= sibling.y + sibling.height
            ? rect.y - sibling.y - sibling.height
            : null;
        var gap = horizontalGap !== null ? horizontalGap : verticalGap;
        return gap === null ? null : { sibling: sibling, gap: Math.round(gap), orientation: horizontalGap !== null ? 'horizontal' : 'vertical' };
      })
      .filter(Boolean)
      .sort(function(a, b){ return a.gap - b.gap; })[0];
    if (nearest) {
      measurements.push({
        label: 'nearest',
        value: Math.max(0, nearest.gap),
        orientation: nearest.orientation,
        from: rect,
        to: nearest.sibling
      });
    }
    return measurements;
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
    var ownRect = rectFor(el);
    var parentRect = rectFor(el.parentElement);
    var siblingRects = siblingRectsFor(el);
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
      computedSummary: computedSummaryFor(el),
      parentRect: parentRect,
      siblingRects: siblingRects,
      measurements: measurementsFor(ownRect, parentRect, siblingRects),
      alignmentGuides: alignmentGuidesFor(ownRect, parentRect),
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
  var lastHoverEl = null;
  // Hover-guides memory: which element's guides were rendered last and when
  // the hover was cleared. Survives od-edit-hover-reset so the host can ask
  // for the guides back (od-edit-guides-restore) right before a capture —
  // reaching a toolbar button always clears the live hover first.
  var guidesMemoryEl = null;
  var guidesMemoryId = null;
  var guidesMemoryClearedAt = 0;
  var guidesEnabled = true;
  var selectedTargetId = null;
  // Free drag-to-reposition state. pointerdown records a pending drag; once the
  // pointer moves past DRAG_THRESHOLD it becomes an active drag that writes an
  // inline translate() the same way the inspector writes any style, so the
  // panel's Save persists it. justDragged suppresses the click that follows a
  // drag (so the drop doesn't also select / enter text-edit).
  var DRAG_THRESHOLD = 4;
  var dragPending = null;
  var justDragged = false;
  function readTranslateBase(el){
    // Split the element's existing inline transform into a non-translate
    // prefix (rotate/scale/etc. we preserve) and the translate() we manage.
    var raw = (el.style && el.style.transform) || '';
    var base = { prefix: '', tx: 0, ty: 0 };
    var m = raw.match(/translate\\(\\s*(-?[\\d.]+)px\\s*,\\s*(-?[\\d.]+)px\\s*\\)/);
    if (m) {
      base.tx = parseFloat(m[1]) || 0;
      base.ty = parseFloat(m[2]) || 0;
      base.prefix = raw.replace(m[0], '').replace(/\\s+/g, ' ').trim();
    } else if (raw && raw !== 'none') {
      base.prefix = raw.trim();
    }
    return base;
  }
  function composeTransform(prefix, tx, ty){
    var t = 'translate(' + Math.round(tx) + 'px, ' + Math.round(ty) + 'px)';
    return prefix ? (prefix + ' ' + t) : t;
  }
  function clearHoverTracking(){
    if (lastHoverEl) guidesMemoryClearedAt = Date.now();
    lastHoverId = null;
    lastHoverEl = null;
  }
  function ensureGuidesLayer(){
    var layer = document.querySelector('[data-od-edit-guides-layer]');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.setAttribute('data-od-edit-guides-layer', 'true');
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }
  function clearGuidesLayer(){
    var layer = document.querySelector('[data-od-edit-guides-layer]');
    if (layer) layer.replaceChildren();
  }
  function addGuideNode(layer, className, style, text){
    var node = document.createElement('div');
    node.className = className;
    Object.keys(style || {}).forEach(function(key){ node.style[key] = style[key]; });
    if (text) node.textContent = text;
    layer.appendChild(node);
  }
  function renderBox(layer, target, mode){
    if (!target || !target.rect) return;
    var rect = target.rect;
    addGuideNode(layer, 'od-edit-guide-box od-edit-guide-box-' + mode, {
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px'
    });
  }
  function renderSelectedChrome(layer, target){
    if (!target || !target.rect) return;
    renderBox(layer, target, 'selected');
    var rect = target.rect;
    var points = [
      [rect.x, rect.y],
      [rect.x + rect.width / 2, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height / 2],
      [rect.x + rect.width, rect.y + rect.height / 2],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width / 2, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height]
    ];
    for (var i = 0; i < points.length; i++) {
      addGuideNode(layer, 'od-edit-guide-handle', {
        left: Math.round(points[i][0]) + 'px',
        top: Math.round(points[i][1]) + 'px'
      });
    }
  }
  function renderSelectedChromeForCurrent(){
    if (!enabled || !guidesEnabled || !selectedTargetId) {
      clearGuidesLayer();
      return;
    }
    var selectedEl = findById(selectedTargetId);
    if (!selectedEl) {
      clearGuidesLayer();
      return;
    }
    var layer = ensureGuidesLayer();
    layer.replaceChildren();
    renderSelectedChrome(layer, targetFrom(selectedEl, false));
  }
  function rectCenter(rect){
    return {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2)
    };
  }
  function addRelationMeasurement(layer, selectedRect, hoverRect){
    var selectedCenter = rectCenter(selectedRect);
    var hoverCenter = rectCenter(hoverRect);
    var horizontalGap = null;
    var verticalGap = null;
    if (hoverRect.x >= selectedRect.x + selectedRect.width) {
      horizontalGap = {
        value: Math.round(hoverRect.x - selectedRect.x - selectedRect.width),
        x1: selectedRect.x + selectedRect.width,
        x2: hoverRect.x,
        y: hoverCenter.y
      };
    } else if (selectedRect.x >= hoverRect.x + hoverRect.width) {
      horizontalGap = {
        value: Math.round(selectedRect.x - hoverRect.x - hoverRect.width),
        x1: hoverRect.x + hoverRect.width,
        x2: selectedRect.x,
        y: hoverCenter.y
      };
    }
    if (hoverRect.y >= selectedRect.y + selectedRect.height) {
      verticalGap = {
        value: Math.round(hoverRect.y - selectedRect.y - selectedRect.height),
        y1: selectedRect.y + selectedRect.height,
        y2: hoverRect.y,
        x: hoverCenter.x
      };
    } else if (selectedRect.y >= hoverRect.y + hoverRect.height) {
      verticalGap = {
        value: Math.round(selectedRect.y - hoverRect.y - hoverRect.height),
        y1: hoverRect.y + hoverRect.height,
        y2: selectedRect.y,
        x: hoverCenter.x
      };
    }
    var chosen = horizontalGap && (!verticalGap || horizontalGap.value <= verticalGap.value)
      ? { orientation: 'horizontal', gap: horizontalGap }
      : verticalGap
        ? { orientation: 'vertical', gap: verticalGap }
        : null;
    if (!chosen) {
      return;
    }
    if (chosen.orientation === 'horizontal') {
      var hg = chosen.gap;
      addGuideNode(layer, 'od-edit-guide-line od-edit-guide-line-h od-edit-guide-line-distance', {
        left: Math.min(hg.x1, hg.x2) + 'px',
        top: hg.y + 'px',
        width: Math.abs(hg.x2 - hg.x1) + 'px'
      });
      addGuideNode(layer, 'od-edit-guide-measure', {
        left: Math.max(6, Math.min(window.innerWidth - 72, Math.min(hg.x1, hg.x2) + Math.abs(hg.x2 - hg.x1) / 2 - 18)) + 'px',
        top: Math.max(6, Math.min(window.innerHeight - 24, hg.y + 8)) + 'px'
      }, hg.value + 'px');
    } else {
      var vg = chosen.gap;
      addGuideNode(layer, 'od-edit-guide-line od-edit-guide-line-v od-edit-guide-line-distance', {
        left: vg.x + 'px',
        top: Math.min(vg.y1, vg.y2) + 'px',
        height: Math.abs(vg.y2 - vg.y1) + 'px'
      });
      addGuideNode(layer, 'od-edit-guide-measure', {
        left: Math.max(6, Math.min(window.innerWidth - 72, vg.x + 8)) + 'px',
        top: Math.max(6, Math.min(window.innerHeight - 24, Math.min(vg.y1, vg.y2) + Math.abs(vg.y2 - vg.y1) / 2 - 10)) + 'px'
      }, vg.value + 'px');
    }
  }
  function renderReferenceGuides(layer, rect){
    [rect.x, rect.x + rect.width].forEach(function(x){
      addGuideNode(layer, 'od-edit-guide-line od-edit-guide-line-v od-edit-guide-line-reference', {
        left: x + 'px',
        top: '0px',
        height: window.innerHeight + 'px'
      });
    });
    [rect.y, rect.y + rect.height].forEach(function(y){
      addGuideNode(layer, 'od-edit-guide-line od-edit-guide-line-h od-edit-guide-line-reference', {
        left: '0px',
        top: y + 'px',
        width: window.innerWidth + 'px'
      });
    });
  }
  function renderHoverRelation(hoverTarget){
    if (!enabled || !guidesEnabled || !hoverTarget || !hoverTarget.rect) {
      clearGuidesLayer();
      return;
    }
    var selectedEl = selectedTargetId ? findById(selectedTargetId) : null;
    if (selectedEl && stableId(selectedEl) === hoverTarget.id) {
      // Hovering the selected element itself: the selection outline already
      // marks it, and self-relative guides would only double-draw.
      renderSelectedChromeForCurrent();
      return;
    }
    var layer = ensureGuidesLayer();
    layer.replaceChildren();
    renderReferenceGuides(layer, hoverTarget.rect);
    if (selectedEl) {
      renderSelectedChrome(layer, targetFrom(selectedEl, false));
    }
    renderBox(layer, hoverTarget, 'hover');
    if (selectedEl) {
      addRelationMeasurement(layer, targetFrom(selectedEl, false).rect, hoverTarget.rect);
    }
  }
  function postHoverTarget(el){
    if (!enabled || !el) return;
    var id = stableId(el);
    if (id === lastHoverId) return;
    lastHoverId = id;
    lastHoverEl = el;
    guidesMemoryEl = el;
    guidesMemoryId = id;
    var target = targetFrom(el, true);
    renderHoverRelation(target);
    window.parent.postMessage({ type: 'od-edit-hover', target: target }, '*');
    window.parent.postMessage({ type: 'od-edit-inspect-hover', target: target }, '*');
  }
  function renderHoverRelationOnly(el){
    if (!enabled || !el) return;
    var id = stableId(el);
    if (id === lastHoverId) return;
    lastHoverId = id;
    lastHoverEl = el;
    guidesMemoryEl = el;
    guidesMemoryId = id;
    renderHoverRelation(targetFrom(el, false));
  }
  function clearSelectedTarget(){
    var selected = document.querySelectorAll('[data-od-edit-selected]');
    for (var i = 0; i < selected.length; i++) selected[i].removeAttribute('data-od-edit-selected');
  }
  function setSelectedTarget(id){
    clearSelectedTarget();
    selectedTargetId = id || null;
    if (!id) return;
    var el = findById(id);
    if (el) el.setAttribute('data-od-edit-selected', 'true');
    renderSelectedChromeForCurrent();
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
        clearGuidesLayer();
        // Re-entering Edit must treat the first pointerover as fresh. Keeping
        // lastHoverId here made the same element look deduplicated forever
        // after an exit -> enter cycle, so its green guides never came back.
        clearHoverTracking();
        guidesMemoryEl = null;
        guidesMemoryId = null;
        guidesMemoryClearedAt = 0;
      }
      if (enabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      setSelectedTarget(ev.data.id || null);
      if (!ev.data.id) { clearGuidesLayer(); removeHandles(); }
      else {
        renderSelectedChromeForCurrent();
        var selEl2 = findById(ev.data.id);
        if (selEl2) setTimeout(function(){ createHandles(selEl2); }, 0);
        else removeHandles();
      }
      return;
    }
    if (ev.data.type === 'od-edit-guides-mode') {
      guidesEnabled = ev.data.enabled !== false;
      if (!guidesEnabled) clearGuidesLayer();
      return;
    }
    if (ev.data.type === 'od-edit-capture-chrome') {
      document.documentElement.toggleAttribute('data-od-hide-edit-chrome', !!ev.data.hidden);
      return;
    }
    if (ev.data.type === 'od-edit-hover-reset') {
      // Host signals the cursor truly left the canvas, so the next pointerover
      // re-announces the hovered element (defeats the per-element dedupe) and
      // any hover guides stop lingering over the preview.
      clearHoverTracking();
      renderSelectedChromeForCurrent();
      return;
    }
    if (ev.data.type === 'od-edit-guides-restore') {
      // Re-renders the hover guides the user was looking at before the cursor
      // left the canvas (e.g. to reach a toolbar button) so a capture can
      // include them. Deliberately does NOT touch lastHoverEl and does NOT
      // post od-edit-hover: the host hover affordance stays dismissed and the
      // next od-edit-hover-reset cleanly clears the restored guides.
      var maxAge = Number(ev.data.maxAgeMs) || 0;
      var restored = false;
      var liveHoverEl = null;
      if (enabled && guidesEnabled) {
        liveHoverEl = lastHoverEl && lastHoverEl.isConnected ? lastHoverEl : null;
        var memoryEl = null;
        if (!liveHoverEl && guidesMemoryClearedAt && (!maxAge || Date.now() - guidesMemoryClearedAt <= maxAge)) {
          memoryEl = guidesMemoryEl && guidesMemoryEl.isConnected
            ? guidesMemoryEl
            : (guidesMemoryId ? findById(guidesMemoryId) : null);
        }
        var restoreEl = liveHoverEl || memoryEl;
        if (restoreEl) {
          renderHoverRelation(targetFrom(restoreEl, false));
          restored = true;
        }
      }
      // "live" tells the host the guides belong to a still-active hover (e.g.
      // a keyboard-triggered capture): clearing them afterwards would blank
      // the guides under the user's cursor, so the host must skip the clear.
      window.parent.postMessage({
        type: 'od-edit-guides-restore:result',
        id: ev.data.id || null,
        restored: restored,
        live: !!(restored && liveHoverEl)
      }, '*');
      return;
    }
    if (ev.data.type === 'od-edit-preview-style') {
      applyPreviewStyles(ev.data.id, ev.data.styles || {}, ev.data.version);
      return;
    }
    if (ev.data.type === 'od-edit-preview-text') {
      // Live text preview from the host panel's 文本 textarea — the counterpart
      // to od-edit-preview-style. Setting textContent on the (blurred, the host
      // textarea holds focus) element mirrors exactly what the set-text patch
      // will persist, so a newline typed in the panel shows immediately instead
      // of only after Save. Guarded to text leaves (no element children) so it
      // can never clobber nested markup — set-text rejects those anyway. When an
      // inline session is live on the same element, updating its textContent is
      // safe: the session commits the current textContent on save and restores
      // its own originalText on cancel, so both paths still reconcile.
      var ptEl = findById(ev.data.id || '');
      if (ptEl && ptEl !== document.body && ptEl.children.length === 0) {
        ptEl.textContent = String(ev.data.value == null ? '' : ev.data.value);
      }
      return;
    }
    if (ev.data.type === 'od-edit-set-tool') {
      activeTool = ev.data.tool || null;
      if (!activeTool) { removeHandles(); removeRotationHandle(); }
      if (previewEl && previewEl.parentNode) { previewEl.parentNode.removeChild(previewEl); previewEl = null; }
      return;
    }
    if (ev.data.type === 'od-edit-text-finish') {
      finishActiveTextEdit(ev.data.commit !== false);
      return;
    }
  });
  // pointerdown records a candidate drag; the actual move/commit happens in
  // pointermove/pointerup. We don't preventDefault here so a plain press that
  // never moves still behaves as a normal click (select / enter text-edit).
  document.addEventListener('pointerdown', function(ev){
    if (!enabled || activeTextEdit) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) { dragPending = null; return; }
    // Elements with resize handles are owned by the handle engine below.
    if (selectedElForHandles && selectedElForHandles === el) return;
    var base = readTranslateBase(el);
    dragPending = {
      el: el,
      id: stableId(el),
      startX: ev.clientX,
      startY: ev.clientY,
      prefix: base.prefix,
      baseTx: base.tx,
      baseTy: base.ty,
      started: false
    };
  }, true);
  document.addEventListener('pointerup', function(ev){
    if (!dragPending) return;
    var drag = dragPending;
    dragPending = null;
    if (!drag.started) return; // never moved past threshold → let click select
    justDragged = true;
    ev.preventDefault();
    ev.stopPropagation();
    var transform = drag.el.style.transform || '';
    var msg = { type: 'od-edit-drag-commit', id: drag.id, transform: transform };
    if (drag.bumpedDisplay) msg.display = 'inline-block';
    window.parent.postMessage(msg, '*');
  }, true);
  // ── Drag & Resize Engine ──

  var HANDLE_SIZE = 8;
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
    for (var j = 0; j < cornerHandles.length; j++) {
      if (cornerHandles[j] && cornerHandles[j].parentNode) cornerHandles[j].parentNode.removeChild(cornerHandles[j]);
    }
    handles = [];
    cornerHandles = [];
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
    // Corner radius handles (small gray diamonds at each corner)
    var r = parseFloat(el.style.borderRadius || '0') || 0;
    if (r > 0 || true) {
      var CH = 6;
      var cornerPositions = [
        { c: 'tl', left: -CH/2, top: -CH/2, cursor: 'nesw-resize', prop: 'borderTopLeftRadius' },
        { c: 'tr', left: rect.width - CH/2, top: -CH/2, cursor: 'nwse-resize', prop: 'borderTopRightRadius' },
        { c: 'br', left: rect.width - CH/2, top: rect.height - CH/2, cursor: 'nesw-resize', prop: 'borderBottomRightRadius' },
        { c: 'bl', left: -CH/2, top: rect.height - CH/2, cursor: 'nwse-resize', prop: 'borderBottomLeftRadius' },
      ];
      for (var cj = 0; cj < cornerPositions.length; cj++) {
        var cp2 = cornerPositions[cj];
        var ch = document.createElement('div');
        ch.setAttribute('data-od-corner-handle', cp2.c);
        ch.setAttribute('data-od-corner-prop', cp2.prop);
        ch.style.cssText = [
          'position:absolute',
          'left:' + Math.round(rect.left - containerRect.left + cp2.left) + 'px',
          'top:' + Math.round(rect.top - containerRect.top + cp2.top) + 'px',
          'width:' + CH + 'px',
          'height:' + CH + 'px',
          'background:#94a3b8',
          'border:1.5px solid #fff',
          'border-radius:50%',
          'z-index:2147483647',
          'pointer-events:auto',
          'cursor:' + cp2.cursor,
          'box-sizing:border-box',
        ].join(';');
        containerEl.appendChild(ch);
        cornerHandles.push(ch);
      }
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
  function saveInlinePosition(el){
    return { position: el.style.position, left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, margin: el.style.margin };
  }
  function restoreInlinePosition(el, saved){
    el.style.position = saved.position || '';
    el.style.left = saved.left || '';
    el.style.top = saved.top || '';
    el.style.width = saved.width || '';
    el.style.height = saved.height || '';
    el.style.margin = saved.margin || '';
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
      el.style.transform = ''; // fold any prior translate into left/top — rect above already includes it
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
    // Shape tool placement
    if (activeTool){
      var ctEl = closestTarget(ev);
      var pId = ctEl ? stableId(ctEl) : '__body__';
      if (activeTool === 'text'){
        ev.preventDefault(); ev.stopPropagation();
        var newId = 'od-n-' + Date.now();
        window.parent.postMessage({ type: 'od-edit-add-element', parentId: pId, tag: 'div', left: Math.round(ev.clientX) + 'px', top: Math.round(ev.clientY) + 'px', width: '200px', height: '40px', html: '<div contenteditable="plaintext-only" data-od-edit="text">Type here</div>' }, '*');
        activeTool = null;
        return;
      }
      if (activeTool === 'image'){
        // Image tool: prompt is handled by host panel; just commit coordinated
        var imgId = 'od-n-' + Date.now();
        window.parent.postMessage({ type: 'od-edit-add-element', parentId: pId, tag: 'img', left: Math.round(ev.clientX) + 'px', top: Math.round(ev.clientY) + 'px', width: '200px', height: '150px', html: '<img src="" alt="image" style="background:#f0f0f0;border:1px dashed #ccc;">' }, '*');
        activeTool = null;
        return;
      }
      // rect/circle/line: start drawing
      ev.preventDefault(); ev.stopPropagation();
      placementStartX = ev.clientX;
      placementStartY = ev.clientY;
      previewEl = document.createElement('div');
      previewEl.style.cssText = 'position:fixed;z-index:2147483646;background:rgba(37,99,235,0.1);border:2px dashed #2563eb;pointer-events:none;';
      previewEl.style.left = ev.clientX + 'px';
      previewEl.style.top = ev.clientY + 'px';
      document.body.appendChild(previewEl);
      return;
    }
    // Check rotation handle first
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-rotation-handle]')){
      ev.preventDefault(); ev.stopPropagation();
      if (!rotationHandle) return;
      dragState = { el: rotationHandle.targetEl, startX: ev.clientX, startY: ev.clientY, handle: 'rotate', id: stableId(rotationHandle.targetEl), moved: false,
        startLeft: rotationHandle.cx, startTop: rotationHandle.cy, startWidth: 0, startHeight: 0, rotationStart: parseRotation(rotationHandle.targetEl),
        cx: rotationHandle.cx, cy: rotationHandle.cy };
      rotationHandle.targetEl.setPointerCapture(ev.pointerId);
      return;
    }
    // Check corner radius handles
    var cornerEl2 = ev.target && ev.target.closest ? ev.target.closest('[data-od-corner-handle]') : null;
    if (cornerEl2 && selectedElForHandles){
      ev.preventDefault(); ev.stopPropagation();
      var cornerProp2 = cornerEl2.getAttribute('data-od-corner-prop') || 'borderRadius';
      var curR = parseFloat(selectedElForHandles.style[cornerProp2] || selectedElForHandles.style.borderRadius || '0') || 0;
      dragState = { el: selectedElForHandles, startX: ev.clientX, startY: ev.clientY, handle: 'corner', id: stableId(selectedElForHandles), moved: false,
        startLeft: curR, startTop: 0, startWidth: 0, startHeight: 0, cornerProp: cornerProp2 };
      selectedElForHandles.setPointerCapture(ev.pointerId);
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
      var savedPosBefore = saveInlinePosition(targetEl);
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
          savedPos: savedPosBefore,
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
          savedPos: savedPosBefore,
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
    if (previewEl){
      // Shape placement: resize preview
      var sx = Math.min(placementStartX, ev.clientX);
      var sy = Math.min(placementStartY, ev.clientY);
      var sw = Math.max(10, Math.abs(ev.clientX - placementStartX));
      var sh = Math.max(10, Math.abs(ev.clientY - placementStartY));
      if (activeTool === 'circle'){
        var d = Math.max(sw, sh);
        previewEl.style.borderRadius = '50%';
        previewEl.style.left = sx + 'px';
        previewEl.style.top = sy + 'px';
        previewEl.style.width = d + 'px';
        previewEl.style.height = d + 'px';
      } else {
        previewEl.style.left = sx + 'px';
        previewEl.style.top = sy + 'px';
        previewEl.style.width = sw + 'px';
        previewEl.style.height = sh + 'px';
      }
      return;
    }
    if (rubberband) { updateRubberband(ev.clientX, ev.clientY); return; }
    if (!dragState) return;
    // Corner
    if (dragState.handle === 'corner'){
      var newR = Math.max(0, dragState.startLeft + Math.max(Math.abs(ev.clientX - dragState.startX), Math.abs(ev.clientY - dragState.startY)));
      if (dragState.cornerProp.indexOf('Left') >= 0 || dragState.cornerProp.indexOf('Right') >= 0){
        newR = Math.max(0, dragState.startLeft + (Math.abs(ev.clientX - dragState.startX) + Math.abs(ev.clientY - dragState.startY)) / 2);
      }
      dragState.el.style[dragState.cornerProp] = Math.round(newR) + 'px';
      dragState.moved = true;
      updateHandlePositions(dragState.el);
      updateRotationHandlePos(dragState.el);
      return;
    }
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
    if (previewEl){
      var sx2 = Math.min(placementStartX, ev.clientX);
      var sy2 = Math.min(placementStartY, ev.clientY);
      var sw2 = Math.max(20, Math.abs(ev.clientX - placementStartX));
      var sh2 = Math.max(20, Math.abs(ev.clientY - placementStartY));
      if (previewEl.parentNode) previewEl.parentNode.removeChild(previewEl);
      previewEl = null;
      var ctEl2 = closestTarget(ev) || { parentElement: document.body };
      var pId2 = ctEl2 && ctEl2.parentElement ? stableId(ctEl2) : '__body__';
      var nId = 'od-n-' + Date.now();
      var tag2 = 'div';
      var html2 = '';
      if (activeTool === 'rect'){
        html2 = '<div></div>';
      } else if (activeTool === 'circle'){
        html2 = '<div style="border-radius:50%;"></div>';
      } else if (activeTool === 'line'){
        html2 = '<div style="background:#333;"></div>';
        sh2 = '2px';
      }
      window.parent.postMessage({ type: 'od-edit-add-element', parentId: pId2, tag: tag2, left: Math.round(sx2) + 'px', top: Math.round(sy2) + 'px', width: Math.round(sw2) + 'px', height: Math.round(sh2) + 'px', html: html2, id: nId }, '*');
      activeTool = null;
      return;
    }
    if (rubberband) { endRubberband(ev.clientX, ev.clientY); return; }
    if (!dragState) return;
    var el = dragState.el;
    var id = dragState.id;
    try { el.releasePointerCapture(ev.pointerId); } catch(e) {}
    if (dragState.handle === 'corner'){
      if (dragState.moved){
        var cv = dragState.el.style[dragState.cornerProp] || '';
        commitStyle(dragState.el, dragState.cornerProp, cv);
        dragEndedJustNow = true;
      }
      dragState = null;
      updateHandlePositions(el);
      updateRotationHandlePos(el);
      return;
    }
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
    } else if (dragState.savedPos && dragState.handle === 'body') {
      // Drag started (ensureAbsolute mutated the DOM) but didn't move.
      // Restore original inline position so the layout is not permanently altered.
      restoreInlinePosition(el, dragState.savedPos);
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
      } else if (dragState.savedPos && dragState.handle === 'body') {
        restoreInlinePosition(el2, dragState.savedPos);
      }
      dragState = null;
      window.parent.postMessage({ type: 'od-edit-drag-end', id: id2 || '' }, '*');
    }
  }, true);

  // ── end drag engine ──

  var dragEndedJustNow = false;
  document.addEventListener('click', function(ev){
    if (!enabled) return;
    if (justDragged) { justDragged = false; ev.preventDefault(); ev.stopPropagation(); return; }
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
    var selectedTarget = targetFrom(el, true);
    setSelectedTarget(selectedTarget.id);
    renderSelectedChromeForCurrent();
    window.parent.postMessage({ type: 'od-edit-select', target: selectedTarget }, '*');
    window.parent.postMessage({ type: 'od-edit-inspect-select', target: selectedTarget }, '*');
    // Show resize handles for selected element
    setTimeout(function(){ createHandles(el); createRotationHandle(el); }, 0);
    if (kind === 'text' || kind === 'link') {
      makeEditable(el, ev);
      return;
    }
  }, true);
  function previewHtmlFileForLink(link){
    if (!link || link.hasAttribute('download')) return null;
    var target = String(link.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return null;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return null;
    try {
      var baseUrl = new URL(document.baseURI || location.href);
      var nextUrl = new URL(href, baseUrl);
      if (nextUrl.origin !== baseUrl.origin) return null;
      var fileRoot = null;
      var projectMarker = '/api/projects/';
      var projectIndex = baseUrl.pathname.indexOf(projectMarker);
      if (projectIndex < 0) return null;
      var projectIdStart = projectIndex + projectMarker.length;
      var routeMarkerStart = baseUrl.pathname.indexOf('/', projectIdStart);
      if (routeMarkerStart < 0 || routeMarkerStart === projectIdStart) return null;
      var rawMarker = '/raw/';
      if (baseUrl.pathname.slice(routeMarkerStart, routeMarkerStart + rawMarker.length) === rawMarker) {
        fileRoot = baseUrl.pathname.slice(0, routeMarkerStart + rawMarker.length);
      } else {
        var previewMarker = '/preview/';
        if (baseUrl.pathname.slice(routeMarkerStart, routeMarkerStart + previewMarker.length) !== previewMarker) return null;
        var scopeStart = routeMarkerStart + previewMarker.length;
        var scopeEnd = baseUrl.pathname.indexOf('/', scopeStart);
        if (scopeEnd < 0 || scopeEnd === scopeStart) return null;
        fileRoot = baseUrl.pathname.slice(0, scopeEnd + 1);
      }
      if (nextUrl.pathname.indexOf(fileRoot) !== 0) return null;
      var fileName = decodeURIComponent(nextUrl.pathname.slice(fileRoot.length));
      if (
        !fileName ||
        fileName.charAt(0) === '/' ||
        fileName.split('/').some(function(part){ return !part || part === '.' || part === '..'; }) ||
        !/\\.html?$/i.test(fileName)
      ) return null;
      return { fileName: fileName, search: nextUrl.search || '', hash: nextUrl.hash || '' };
    } catch (_) {
      return null;
    }
  }
  // Once Manual Edit has activated srcDoc, keep same-project HTML navigation
  // in the host workspace. Letting the iframe navigate itself replaces this
  // document (and therefore this bridge) with a raw URL response; a later Edit
  // toggle then looks active in the toolbar but cannot draw/select anything.
  document.addEventListener('click', function(ev){
    if (enabled || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var origin = ev.target;
    var link = origin && origin.closest ? origin.closest('a[href]') : null;
    var destination = previewHtmlFileForLink(link);
    if (!destination) return;
    ev.preventDefault();
    window.parent.postMessage({
      type: 'od:preview-open-file',
      fileName: destination.fileName,
      search: destination.search,
      hash: destination.hash
    }, '*');
  }, true);
  document.addEventListener('pointerover', function(ev){
    if (!enabled) return;
    // A drag in progress owns the overlay (selection chrome only); pointerover
    // must not surface hover reference guides that would clutter the move.
    if (dragPending && dragPending.started) return;
    // While editing, hovering must not retarget the inspector or surface a new
    // affordance — that's the other half of the #3646 instability. It should
    // still draw the selected-vs-hover spacing overlay, though.
    if (activeTextEdit) {
      var hoverEditEl = closestTarget(ev);
      if (!hoverEditEl) {
        clearHoverTracking();
        renderSelectedChromeForCurrent();
        return;
      }
      renderHoverRelationOnly(hoverEditEl);
      return;
    }
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) return;
    postHoverTarget(el);
  }, true);
  document.addEventListener('pointermove', function(ev){
    if (!enabled) return;
    // Active/candidate drag takes over pointermove: translate the element live
    // and skip the hover-guides bookkeeping below.
    if (dragPending) {
      var dx = ev.clientX - dragPending.startX;
      var dy = ev.clientY - dragPending.startY;
      if (!dragPending.started && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragPending.started = true;
        // transform() has no effect on non-replaced inline elements (plain
        // <span>/<a>), so bump those to inline-block once so the drag is
        // visible; the change is persisted with the transform on commit.
        try {
          var disp = window.getComputedStyle(dragPending.el).display;
          if (disp === 'inline') {
            dragPending.el.style.display = 'inline-block';
            dragPending.bumpedDisplay = true;
          }
        } catch (e) {}
        // Grabbing an unselected element selects it first, so the panel + the
        // selection chrome follow the element being moved.
        if (selectedTargetId !== dragPending.id) {
          setSelectedTarget(dragPending.id);
          window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(dragPending.el, true) }, '*');
        }
      }
      if (dragPending.started) {
        dragPending.el.style.transform = composeTransform(dragPending.prefix, dragPending.baseTx + dx, dragPending.baseTy + dy);
        // Live guides for the element being moved: its four edge lines + the
        // selection box/handles, redrawn at the new position each frame.
        if (guidesEnabled) {
          var dragLayer = ensureGuidesLayer();
          dragLayer.replaceChildren();
          var dragTarget = targetFrom(dragPending.el, false);
          renderReferenceGuides(dragLayer, dragTarget.rect);
          renderSelectedChrome(dragLayer, dragTarget);
        } else {
          renderSelectedChromeForCurrent();
        }
        ev.preventDefault();
      }
      return;
    }
    var hoveredEl = closestTarget(ev);
    if (activeTextEdit) {
      if (!hoveredEl || (activeTextEdit.el && stableId(activeTextEdit.el) === stableId(hoveredEl))) {
        clearHoverTracking();
        renderSelectedChromeForCurrent();
      }
      return;
    }
    if (!hoveredEl) {
      clearHoverTracking();
      renderSelectedChromeForCurrent();
      return;
    }
    // A toolbar toggle or iframe visibility swap can leave the pointer inside
    // the same DOM element without producing a fresh pointerover. Treat normal
    // movement as the recovery path; postHoverTarget keeps this cheap through
    // its stable-id dedupe during ordinary movement.
    postHoverTarget(hoveredEl);
  }, true);
  window.addEventListener('resize', postTargets);
  // style-commit passthrough (z-index / opacity / box-shadow / transform panel)
  // ── Z-index keyboard shortcuts ──
  document.addEventListener('keydown', function(ev){
    if (!enabled || !selectedElForHandles) return;
    if (activeTextEdit) return;
    if (!ev.ctrlKey && !ev.metaKey) return;
    var el = selectedElForHandles;
    var cur = parseInt(el.style.zIndex || '', 10) || 0;
    if (ev.key === ']'){
      ev.preventDefault();
      el.style.zIndex = String(cur + 1);
      commitStyle(selectedElForHandles, 'zIndex', String(cur + 1));
    } else if (ev.key === '['){
      ev.preventDefault();
      el.style.zIndex = String(Math.max(0, cur - 1));
      commitStyle(selectedElForHandles, 'zIndex', String(Math.max(0, cur - 1)));
    } else if (ev.key === ']' && ev.shiftKey){
      ev.preventDefault();
      el.style.zIndex = '9999';
      commitStyle(selectedElForHandles, 'zIndex', '9999');
    }
  }, true);

  function commitStyle(el, prop, value){
    window.parent.postMessage({
      type: 'od-edit-preview-style-applied',
      id: stableId(el), version: (Date.now() % 100000), ok: true,
    }, '*');
    // Defer actual commit via set-style
    var target = el ? targetFrom(el, false) : null;
    if (!target) return;
    var patch = { id: stableId(el), kind: 'set-style', styles: {} };
    patch.styles[prop] = value;
    window.parent.postMessage({ type: 'od-edit-style-commit', id: stableId(el), prop: prop, value: value }, '*');
  }

  // Double-tap Command screenshot hotkey (edit mode only). Keyboard focus can
  // live inside the sandboxed iframe, where the host's window listener never
  // hears the keys — detect here and delegate the capture to the host. Two
  // quick bare Meta taps trigger; any non-Meta key cancels (so ⌘C never
  // fires), and holding BOTH Meta keys is the module-capture chord owned by
  // the snapshot bridge, so it resets instead of triggering.
  // Registered on documentElement, NOT window/document: the keyboard guard
  // wraps window/document keydown listeners and suppresses them during inline
  // text editing, which would silently eat the hotkey exactly when the user
  // is editing a text element.
  var screenshotTap = { at: 0, left: false, right: false };
  document.documentElement.addEventListener('keydown', function(ev){
    if (!enabled) return;
    if (ev.key !== 'Meta') {
      screenshotTap.at = 0;
      return;
    }
    if (ev.code === 'MetaLeft') screenshotTap.left = true;
    if (ev.code === 'MetaRight') screenshotTap.right = true;
    if (ev.repeat) return;
    if (screenshotTap.left && screenshotTap.right) {
      screenshotTap.at = 0;
      return;
    }
    var now = Date.now();
    if (screenshotTap.at && now - screenshotTap.at <= 600) {
      screenshotTap.at = 0;
      window.parent.postMessage({ type: 'od-edit-screenshot-hotkey' }, '*');
    } else {
      screenshotTap.at = now;
    }
  }, true);
  document.documentElement.addEventListener('keyup', function(ev){
    if (ev.code === 'MetaLeft') screenshotTap.left = false;
    if (ev.code === 'MetaRight') screenshotTap.right = false;
  }, true);
  window.addEventListener('blur', function(){
    screenshotTap.at = 0;
    screenshotTap.left = false;
    screenshotTap.right = false;
  });
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
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: none !important;
}
html[data-od-edit-mode] [data-od-editing="true"] {
  outline: none !important;
  cursor: text !important;
}
[data-od-edit-guides-layer] {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  font: 11px/1.2 Inter, system-ui, sans-serif;
}
[data-od-edit-guides-layer] .od-edit-guide-box {
  position: fixed;
  border: 1px solid var(--selected, var(--accent, CanvasText));
  box-sizing: border-box;
}
[data-od-edit-guides-layer] .od-edit-guide-box-hover {
  border-style: dashed;
}
[data-od-edit-guides-layer] .od-edit-guide-box-selected {
  border-style: solid;
}
[data-od-edit-guides-layer] .od-edit-guide-handle {
  position: fixed;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  margin-top: -5px;
  border: 2px solid var(--selected, var(--accent, CanvasText));
  border-radius: 999px;
  background: Canvas;
  box-sizing: border-box;
}
[data-od-edit-guides-layer] .od-edit-guide-line {
  position: fixed;
  background: color-mix(in srgb, var(--amber, var(--selected, var(--accent, CanvasText))) 70%, transparent);
}
[data-od-edit-guides-layer] .od-edit-guide-line-v {
  width: 1px;
}
[data-od-edit-guides-layer] .od-edit-guide-line-h {
  height: 1px;
}
[data-od-edit-guides-layer] .od-edit-guide-line-distance {
  background: var(--amber, var(--selected, var(--accent, CanvasText)));
}
[data-od-edit-guides-layer] .od-edit-guide-line-reference {
  background: color-mix(in srgb, var(--amber, var(--selected, var(--accent, CanvasText))) 36%, transparent);
}
[data-od-edit-guides-layer] .od-edit-guide-measure {
  position: fixed;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--amber, var(--selected, var(--accent, CanvasText)));
  color: var(--accent-contrast, Canvas);
  box-shadow: 0 5px 16px color-mix(in srgb, var(--selected, var(--accent, CanvasText)) 18%, transparent);
}
html[data-od-hide-edit-chrome] [data-od-edit-guides-layer],
html[data-od-hide-edit-chrome] [data-od-edit-selected],
html[data-od-hide-edit-chrome] [data-od-editing="true"] {
  opacity: 0 !important;
  box-shadow: none !important;
  outline-color: transparent !important;
}
[data-od-drag-handle] {
  pointer-events: auto !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.9);
}
</style>`;
}
