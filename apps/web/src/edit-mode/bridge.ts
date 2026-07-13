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
        clearGuidesLayer();
        guidesMemoryEl = null;
        guidesMemoryId = null;
        guidesMemoryClearedAt = 0;
      }
      if (enabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      setSelectedTarget(ev.data.id || null);
      if (!ev.data.id) clearGuidesLayer();
      else {
        renderSelectedChromeForCurrent();
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
    if (ev.data.type === 'od-edit-text-finish') {
      finishActiveTextEdit(ev.data.commit !== false);
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
      // page-level styles; commit any in-flight edit first so the host and
      // iframe stay in sync, then let the host decide whether to surface the
      // page-styles card.
      if (activeTextEdit) finishActiveTextEdit(true);
      window.parent.postMessage({ type: 'od-edit-background' }, '*');
      return;
    }
    // Switching to a different target commits the in-flight edit first, so the
    // previous edit is never silently dropped.
    if (activeTextEdit && activeTextEdit.el !== el) finishActiveTextEdit(true);
    var kind = inferKind(el);
    var selectedTarget = targetFrom(el, true);
    setSelectedTarget(selectedTarget.id);
    renderSelectedChromeForCurrent();
    window.parent.postMessage({ type: 'od-edit-select', target: selectedTarget }, '*');
    window.parent.postMessage({ type: 'od-edit-inspect-select', target: selectedTarget }, '*');
    if (kind === 'text' || kind === 'link') {
      makeEditable(el, ev);
      return;
    }
  }, true);
  document.addEventListener('pointerover', function(ev){
    if (!enabled) return;
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
    }
  }, true);
  window.addEventListener('resize', postTargets);
  var hoverGuidesScrollScheduled = false;
  var scheduleGuideFrame = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function(cb){ return setTimeout(cb, 16); };
  // Guides are drawn in viewport (fixed) coordinates, so any scroll — page or
  // inner container — invalidates them; re-measure the tracked hover element.
  window.addEventListener('scroll', function(){
    if (!enabled || hoverGuidesScrollScheduled) return;
    hoverGuidesScrollScheduled = true;
    scheduleGuideFrame(function(){
      hoverGuidesScrollScheduled = false;
      if (!lastHoverEl) return;
      if (!lastHoverEl.isConnected) {
        lastHoverEl = null;
        clearGuidesLayer();
        return;
      }
      renderHoverRelation(targetFrom(lastHoverEl, false));
    });
  }, true);
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
</style>`;
}
