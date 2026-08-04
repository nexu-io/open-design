// Chrome-devtools-style picking: the click/hover resolver walks up from the
// hit node to the nearest source-mapped element matching this selector, so
// every tag listed here is a pickable depth level. Keep leaf/graphic tags
// (canvas, svg, video, …) and inline formatting tags in sync with what real
// generated pages contain — a missing tag means clicks "skip" that child and
// select its container instead.
export const MANUAL_EDIT_DISCOVERY_SELECTOR =
  'main, nav, section, article, aside, header, footer, div, h1, h2, h3, h4, h5, h6, p, a, button, img, ul, ol, li, dl, dt, dd, table, thead, tbody, tfoot, tr, td, th, caption, blockquote, figure, figcaption, label, summary, pre, code, strong, em, b, i, small, mark, span, u, s, strike, sub, sup, abbr, font, cite, q, kbd, samp, var, ins, del, dfn, time, address, hr, canvas, svg, video, audio, picture';
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
 * Inline formatting tags that keep an element "text-like": a caret can drop
 * into it and the commit round-trips through the source patcher. Elements
 * whose children are exclusively these tags commit via `set-inner-html`
 * (preserving the inline markup); pure text leaves keep committing via
 * `set-text`. Anything with block/interactive children stays a container.
 */
export const MANUAL_EDIT_INLINE_TEXT_TAGS = [
  'strong', 'em', 'b', 'i', 'u', 's', 'strike', 'span', 'mark', 'small', 'sub', 'sup', 'br', 'code', 'font', 'abbr',
] as const;

/**
 * A "text-like" element carries visible text and contains, at most, inline
 * formatting markup (see MANUAL_EDIT_INLINE_TEXT_TAGS) all the way down. This
 * — not the tag name — is what makes a bare `<div>Title</div>`, an `<li>`, or
 * an `<h4>` with a `<strong>` word editable, exactly like a `<p>`.
 *
 * Elements with block or interactive children (`<a>`, `<div>`, `<img>`, …)
 * are deliberately NOT text-like: their nested structure cannot round-trip
 * through a text/innerHTML commit safely, so they stay containers
 * (style-only).
 */
export function manualEditElementIsTextLike(el: Element): boolean {
  const text = (el.textContent || '').trim();
  if (!text) return false;
  return manualEditInlineSubtree(el);
}

function manualEditInlineSubtree(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName ? child.tagName.toLowerCase() : '';
    if (!(MANUAL_EDIT_INLINE_TEXT_TAGS as readonly string[]).includes(tag)) return false;
    if (!manualEditInlineSubtree(child)) return false;
  }
  return true;
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
  if (manualEditElementIsTextLike(el)) return 'text';
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
  var styleProps = ['fontFamily','fontSize','fontWeight','fontStyle','textDecorationLine','color','textAlign','lineHeight','letterSpacing','whiteSpace','display','position','left','top','right','bottom','zIndex','width','height','minHeight','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','transform','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius'];
  var inlineTextTags = ${JSON.stringify(MANUAL_EDIT_INLINE_TEXT_TAGS)};
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
  // Positional ids (data-od-source-path and auto-annotated path-N data-od-id)
  // encode DOM positions computed at srcDoc build time. After any in-place
  // structural mutation (insert/remove/duplicate via od-edit-apply-dom) those
  // positions shift for following siblings, so every positional stamp must be
  // recomputed or later patches would resolve against the WRONG source
  // element. Authored semantic data-od-id values are never touched; elements
  // whose saved-source markup was just inserted (no annotations at all) get
  // stamped here so they are immediately source-mappable and selectable.
  var positionalIdPattern = /^path-\\d+(-\\d+)*$/;
  function restampPositionalIdentity(){
    var nodes = document.body ? document.body.querySelectorAll(discoverySelector) : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isHostNode(el)) continue;
      var path = domPath(el);
      if (!path) continue;
      var sp = el.getAttribute(sourcePathAttr);
      if ((sp === null || positionalIdPattern.test(sp)) && sp !== path) el.setAttribute(sourcePathAttr, path);
      var odId = el.getAttribute('data-od-id');
      if (odId && positionalIdPattern.test(odId) && odId !== path) el.setAttribute('data-od-id', path);
      var runtime = el.getAttribute('data-od-runtime-id');
      if (runtime && runtime !== path) el.removeAttribute('data-od-runtime-id');
    }
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
  function inlineSubtreeOk(el){
    for (var i = 0; i < el.children.length; i++) {
      var tag = el.children[i].tagName ? el.children[i].tagName.toLowerCase() : '';
      if (inlineTextTags.indexOf(tag) < 0) return false;
      if (!inlineSubtreeOk(el.children[i])) return false;
    }
    return true;
  }
  function isTextLeaf(el){
    var text = (el.textContent || '').trim();
    if (!text) return false;
    return inlineSubtreeOk(el);
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
    // Gesture math (move/resize) adds pointer deltas to these values, so they
    // must be RESOLVED px — an authored 'left: 43%' would otherwise be read as
    // 43px and teleport the element on the first drag. Computed left/top are
    // used px for positioned elements; 'auto' falls back to the offset-parent
    // geometry (the classic jQuery position() formula, margin corrected).
    styles.position = computed.position || '';
    var left = computed.left || '';
    var top = computed.top || '';
    if ((left === 'auto' || top === 'auto') && (computed.position === 'absolute' || computed.position === 'fixed')) {
      var marginLeft = parseFloat(computed.marginLeft) || 0;
      var marginTop = parseFloat(computed.marginTop) || 0;
      if (computed.position === 'fixed') {
        var fixedRect = el.getBoundingClientRect();
        if (left === 'auto') left = (fixedRect.left - marginLeft) + 'px';
        if (top === 'auto') top = (fixedRect.top - marginTop) + 'px';
      } else {
        if (left === 'auto') left = (el.offsetLeft - marginLeft) + 'px';
        if (top === 'auto') top = (el.offsetTop - marginTop) + 'px';
      }
    }
    styles.left = left;
    styles.top = top;
    return styles;
  }
  function transformScaleOf(value){
    if (!value || value === 'none') return null;
    var open = value.indexOf('(');
    if (open < 0) return null;
    var nums = value.slice(open + 1, value.lastIndexOf(')')).split(',');
    var is3d = value.indexOf('matrix3d') === 0;
    var a = parseFloat(nums[0]);
    var b = parseFloat(nums[1]);
    var c = parseFloat(is3d ? nums[4] : nums[2]);
    var d = parseFloat(is3d ? nums[5] : nums[3]);
    if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) return null;
    return { x: Math.sqrt(a * a + b * b), y: Math.sqrt(c * c + d * d) };
  }
  function saneScale(value, fallback){
    return (isFinite(value) && value > 0.01 && value < 100) ? value : fallback;
  }
  // Parent probes are shared by every child in one broadcast; allTargets()
  // arms this so a 400-element page measures each parent once.
  var parentProbeCache = null;
  function parentProbeScale(parent){
    if (!parent) return null;
    if (parentProbeCache && parentProbeCache.has(parent)) return parentProbeCache.get(parent);
    var pw = parent.offsetWidth;
    var ph = parent.offsetHeight;
    var probe = null;
    if (pw > 0 || ph > 0) {
      var pRect = parent.getBoundingClientRect();
      probe = { x: pw > 0 ? pRect.width / pw : NaN, y: ph > 0 ? pRect.height / ph : NaN };
    }
    if (parentProbeCache) parentProbeCache.set(parent, probe);
    return probe;
  }
  /**
   * Scale between the element's own CSS pixel space — what its inline
   * left/top/width mean — and the viewport pixels getBoundingClientRect
   * reports. A deck stage fits its 1920x1080 slides by scaling a wrapper, so
   * without this every gesture writes screen-sized deltas into a shrunken
   * coordinate space: the element trails the cursor on a drag and a widened
   * text box never actually gets wide enough to pull its text onto one line.
   *
   * Measured, never walked: the scaling wrapper can sit in a shadow root that
   * parentElement cannot reach (the deck stage slots slides into a scaled
   * canvas). The parent is the more precise probe — offsetWidth rounds to an
   * integer, which matters far less on a big box — but it reads as unscaled
   * across a slot boundary, so it only wins when it agrees with the element's
   * own measurement.
   */
  function spaceScaleFor(el, rect, computed){
    var own = transformScaleOf(computed.transform) || { x: 1, y: 1 };
    var selfW = el.offsetWidth;
    var selfH = el.offsetHeight;
    var x = saneScale(selfW > 0 ? rect.width / saneScale(own.x, 1) / selfW : NaN, 1);
    var y = saneScale(selfH > 0 ? rect.height / saneScale(own.y, 1) / selfH : NaN, x);
    var probe = parentProbeScale(el.parentElement);
    if (probe) {
      var px = saneScale(probe.x, x);
      var py = saneScale(probe.y, y);
      if (Math.abs(px - x) <= x * 0.05) x = px;
      if (Math.abs(py - y) <= y * 0.05) y = py;
    }
    return { x: x, y: y };
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
    var scale = spaceScaleFor(el, rect, window.getComputedStyle(el));
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
      scale: scale,
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
    parentProbeCache = typeof Map === 'function' ? new Map() : null;
    try {
      for (var i = 0; i < nodes.length; i++) {
        var rect = nodes[i].getBoundingClientRect();
        if (!isSourceMappable(nodes[i])) continue;
        if (!isHiddenTarget(nodes[i], rect) && (rect.width < 4 || rect.height < 4)) continue;
        targets.push(targetFrom(nodes[i], false));
      }
    } finally {
      parentProbeCache = null;
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
    lastSelectionKey = '';
    var el = session.el;
    // Drop the caret BEFORE revoking contenteditable: a selection left inside
    // a node that just lost editability re-anchors to the document end, and
    // the browser natively scrolls to reveal it — yanking the canvas to the
    // page bottom on every Enter commit (bypasses scrollTo/scrollIntoView).
    try {
      var endSel = window.getSelection();
      if (endSel && endSel.rangeCount > 0 && (el.contains(endSel.anchorNode) || el.contains(endSel.focusNode))) {
        endSel.removeAllRanges();
      }
    } catch (e) {}
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-od-editing');
    el.removeEventListener('keydown', session.onKey);
    if (guard) guard.editingEl = null;
    var value = (el.textContent || '').trim();
    var textChanged = value !== session.originalText.trim();
    var htmlChanged = el.innerHTML !== session.originalHtml;
    var changed = textChanged || htmlChanged;
    if (commit && changed) {
      if (el.children.length > 0) {
        // Inline formatting (bold/italic/color spans) lives in child elements;
        // a plain-text commit would flatten it, so escalate to innerHTML.
        window.parent.postMessage({
          type: 'od-edit-html-commit',
          id: stableId(el),
          value: el.innerHTML
        }, '*');
      } else {
        window.parent.postMessage({
          type: 'od-edit-text-commit',
          id: stableId(el),
          value: value
        }, '*');
      }
    } else if (!commit) {
      el.innerHTML = session.originalHtml;
    }
    postTextSession(el, false, { committed: !!commit, changed: changed });
    return true;
  }
  var formatCommands = { bold: 1, italic: 1, underline: 1, strikeThrough: 1, foreColor: 1 };
  // Layout changes inside the sandbox can trigger Chromium scroll anchoring:
  // shrinking a title above the anchor silently changes window.scrollY even
  // though the iframe never reloaded. Keep edit operations visually pinned by
  // restoring both the page scroller and deck-style nested canvas scroller in
  // the same task, after layout has been invalidated.
  function captureEditScroll(){
    var root = document.scrollingElement || document.documentElement || document.body;
    var canvas = document.querySelector('.design-canvas');
    return {
      root: root,
      rootLeft: root ? root.scrollLeft : 0,
      rootTop: root ? root.scrollTop : 0,
      canvas: canvas,
      canvasLeft: canvas ? canvas.scrollLeft : 0,
      canvasTop: canvas ? canvas.scrollTop : 0
    };
  }
  function restoreEditScroll(snapshot){
    if (!snapshot) return;
    if (snapshot.root) {
      snapshot.root.scrollLeft = snapshot.rootLeft;
      snapshot.root.scrollTop = snapshot.rootTop;
    }
    if (snapshot.canvas) {
      snapshot.canvas.scrollLeft = snapshot.canvasLeft;
      snapshot.canvas.scrollTop = snapshot.canvasTop;
    }
  }
  function applyTextFormat(command, value){
    if (!activeTextEdit || !formatCommands[command]) return;
    var el = activeTextEdit.el;
    var scrollSnapshot = captureEditScroll();
    // Range formatting needs real rich editing; plaintext-only refuses the
    // formatting execCommands. The commit path already escalates to an
    // innerHTML commit whenever child elements appear.
    try {
      if (el.getAttribute('contenteditable') !== 'true') el.setAttribute('contenteditable', 'true');
      try { el.focus(); } catch (e) {}
      try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
      try { document.execCommand(command, false, value == null ? null : value); } catch (e) {}
    } finally {
      restoreEditScroll(scrollSnapshot);
    }
    // Applying a format changes B/I/U/S state without moving the caret, so
    // selectionchange never fires — re-announce so the toolbar highlights.
    postTextSelection(el);
  }
  // Formatting state at the current selection, read straight from the browser's
  // editing engine so the toolbar reflects what the text actually renders with
  // (a range's bold span is invisible to the element-level style read).
  function selectionFormatState(){
    var state = { bold: false, italic: false, underline: false, strike: false };
    try { state.bold = !!document.queryCommandState('bold'); } catch (e) {}
    try { state.italic = !!document.queryCommandState('italic'); } catch (e) {}
    try { state.underline = !!document.queryCommandState('underline'); } catch (e) {}
    try { state.strike = !!document.queryCommandState('strikeThrough'); } catch (e) {}
    return state;
  }
  var lastSelectionKey = '';
  function postTextSelection(el){
    if (!activeTextEdit || activeTextEdit.el !== el) return;
    var sel = window.getSelection();
    var inside = !!(sel && sel.rangeCount > 0 && el.contains(sel.anchorNode) && el.contains(sel.focusNode));
    var hasRange = inside && !sel.isCollapsed;
    var format = inside ? selectionFormatState() : null;
    var key = (hasRange ? '1' : '0') + '|' + (format
      ? (format.bold ? 'b' : '') + (format.italic ? 'i' : '') + (format.underline ? 'u' : '') + (format.strike ? 's' : '')
      : 'none');
    if (key === lastSelectionKey) return;
    lastSelectionKey = key;
    window.parent.postMessage({ type: 'od-edit-text-selection', id: stableId(el), hasRange: hasRange, format: format }, '*');
  }
  document.addEventListener('selectionchange', function(){
    if (!activeTextEdit) return;
    postTextSelection(activeTextEdit.el);
  });
  function makeEditable(el, clickEvent){
    if (!el) return;
    if (activeTextEdit && activeTextEdit.el === el) {
      // Single click repositions the caret; double/triple click must KEEP the
      // browser's native word/paragraph selection — collapsing it here made
      // double-click-to-format impossible (drag selection only survives
      // because pointer movement suppresses the click event).
      if (!clickEvent || clickEvent.detail < 2) placeCaretFromClick(clickEvent, el);
      return;
    }
    if (activeTextEdit) finishActiveTextEdit(true);
    if (el.getAttribute('contenteditable') === 'true') return;
    var originalText = el.textContent || '';
    var originalHtml = el.innerHTML;
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
      if (ev.key === 'Home' || ev.key === 'End') {
        // Chromium double-books Home/End inside a contenteditable: the caret
        // moves AND the document smooth-scrolls to its top/bottom (the caret
        // consumption does not suppress the page-scroll default). Consume the
        // key and move the caret to the element's content start/end manually
        // (Shift extends the selection) so an inline edit never yanks the
        // canvas to the page bottom.
        ev.preventDefault();
        try {
          var homeEndSel = window.getSelection();
          if (homeEndSel) {
            var homeEndRange = document.createRange();
            homeEndRange.selectNodeContents(el);
            homeEndRange.collapse(ev.key === 'Home');
            if (ev.shiftKey && homeEndSel.rangeCount > 0) {
              homeEndSel.extend(homeEndRange.startContainer, homeEndRange.startOffset);
            } else {
              homeEndSel.removeAllRanges();
              homeEndSel.addRange(homeEndRange);
            }
          }
        } catch (e) {}
      }
      if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.key && ev.key.toLowerCase() === 'z') {
        // In-session Cmd+Z: the browser's native contenteditable undo consumes
        // the typing steps first. Once the content is back to the session's
        // original markup there is nothing left to undo locally, so escalate
        // to the host's GLOBAL history — one shortcut walks the entire
        // operation chain (text commits, style changes, moves) instead of
        // dead-ending inside a single text element. Redo stays native while
        // the session lives; escalation closes the session, so the next
        // Cmd+Shift+Z reaches the host's global history through the normal
        // non-session path.
        if (!ev.shiftKey && el.innerHTML === originalHtml) {
          ev.preventDefault();
          ev.stopPropagation();
          finishActiveTextEdit(true);
          window.parent.postMessage({ type: 'od-edit-history', op: 'undo' }, '*');
        }
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey) {
        var key = ev.key ? ev.key.toLowerCase() : '';
        if (key === 'b' || key === 'i' || key === 'u') {
          ev.preventDefault();
          applyTextFormat(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline', null);
        }
      }
    }
    activeTextEdit = { el: el, originalText: originalText, originalHtml: originalHtml, onKey: onKey };
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
  function applyPreviewStyles(id, styles, version, measureRect){
    var el = findById(id);
    if (!el) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id || '', version: Number(version) || 0, ok: false, error: 'Target not found' }, '*');
      return;
    }
    var keys = Object.keys(styles || {});
    var scrollSnapshot = captureEditScroll();
    try {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = styles[key];
        var cssName = camelToKebab(key);
        if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
        else el.style.setProperty(cssName, value.trim());
      }
      restoreEditScroll(scrollSnapshot);
      // Only layout-changing previews are measured: a resize needs the height
      // the reflowed content actually took, while a move previews through
      // transform alone and must not pay for a forced layout every frame.
      var measured = null;
      if (measureRect || keys.indexOf('width') >= 0 || keys.indexOf('height') >= 0) {
        var box = el.getBoundingClientRect();
        measured = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
      }
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: true, rect: measured }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: false, error: e && e.message ? String(e.message) : 'Could not apply preview styles' }, '*');
    } finally {
      restoreEditScroll(scrollSnapshot);
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
      }
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
      applyPreviewStyles(ev.data.id, ev.data.styles || {}, ev.data.version, !!ev.data.measureRect);
      return;
    }
    if (ev.data.type === 'od-edit-text-finish') {
      finishActiveTextEdit(ev.data.commit !== false);
      return;
    }
    if (ev.data.type === 'od-edit-format') {
      applyTextFormat(String(ev.data.command || ''), ev.data.value == null ? null : String(ev.data.value));
      return;
    }
    if (ev.data.type === 'od-edit-refresh-targets') {
      // Host applied a gesture commit (move/resize) without reloading the
      // iframe; re-announce targets so overlay chrome tracks fresh rects.
      postTargets();
      return;
    }
    if (ev.data.type === 'od-edit-apply-dom') {
      // In-place content apply: mutate the live DOM instead of reloading the
      // whole iframe (no white flash, no scroll reset, no re-run of page
      // scripts). Used by undo/redo AND by forward content commits.
      // 'op' selects the mutation: 'replace' (default) swaps one element's
      // markup for its saved-source version; 'insert-after' / 'append-child' /
      // 'prepend-child' / 'insert-at-index' add a saved element in place;
      // 'remove' deletes one.
      // ok:false tells the host to fall back to a frozen-source reload.
      var applyOk = false;
      var applyOp = ev.data.op || 'replace';
      var domScrollSnapshot = captureEditScroll();
      // A caret/selection left inside a node we are about to replace or
      // remove re-anchors unpredictably and makes the browser scroll to
      // reveal it — the exact "random jump" this channel exists to avoid.
      function dropSelectionInside(el){
        try {
          var sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && el && (el.contains(sel.anchorNode) || el.contains(sel.focusNode))) {
            sel.removeAllRanges();
          }
        } catch (e) {}
      }
      try {
        if (applyOp === 'remove') {
          var removeEl = findById(ev.data.id);
          if (removeEl && removeEl !== document.body && removeEl.parentElement) {
            if (activeTextEdit && activeTextEdit.el === removeEl) finishActiveTextEdit(false);
            dropSelectionInside(removeEl);
            removeEl.remove();
            applyOk = true;
          }
        } else if (applyOp === 'apply-content') {
          // Runtime-annotated targets (brand-kit ids stamped by this bridge)
          // have no markup of their own in the saved source — their edits
          // persist into the brand payload / runtime overrides. Mirror the
          // same content onto the live element so the canvas reflects the
          // save without a reload (matching what the override applier will
          // render on the NEXT load).
          var contentEl = findById(ev.data.id);
          var contentFields = ev.data.fields || {};
          if (contentEl) {
            if (activeTextEdit && activeTextEdit.el === contentEl) finishActiveTextEdit(false);
            if (typeof contentFields.html === 'string') contentEl.innerHTML = contentFields.html;
            else if (typeof contentFields.text === 'string') contentEl.textContent = contentFields.text;
            if (typeof contentFields.href === 'string') contentEl.setAttribute('href', contentFields.href);
            if (typeof contentFields.src === 'string') contentEl.setAttribute('src', contentFields.src);
            if (typeof contentFields.alt === 'string') contentEl.setAttribute('alt', contentFields.alt);
            if (contentFields.attributes && typeof contentFields.attributes === 'object') {
              Object.keys(contentFields.attributes).forEach(function(name){
                if (!/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(name) || /^data-od-/.test(name) || /^on/i.test(name)) return;
                var attrValue = contentFields.attributes[name];
                if (typeof attrValue !== 'string' || attrValue.trim() === '') contentEl.removeAttribute(name);
                else contentEl.setAttribute(name, attrValue);
              });
            }
            applyOk = true;
          }
        } else if (typeof ev.data.html === 'string' && (applyOp === 'insert-after' || applyOp === 'append-child' || applyOp === 'prepend-child' || applyOp === 'insert-at-index')) {
          var template = document.createElement('template');
          template.innerHTML = ev.data.html;
          var insertNode = template.content.firstElementChild;
          if (insertNode) {
            if (applyOp === 'append-child') {
              (document.body || document.documentElement).appendChild(insertNode);
              applyOk = true;
            } else if (applyOp === 'insert-at-index') {
              var bodyChildren = Array.prototype.slice.call(document.body.children).filter(function(child){ return !isHostNode(child); });
              var bodyIndex = Number(ev.data.fields && ev.data.fields.index);
              if (Number.isInteger(bodyIndex) && bodyIndex >= 0 && bodyIndex <= bodyChildren.length) {
                document.body.insertBefore(insertNode, bodyChildren[bodyIndex] || null);
                applyOk = true;
              }
            } else if (applyOp === 'prepend-child') {
              var containerEl = ev.data.id === '__body__' ? document.body : findById(ev.data.id);
              if (containerEl) {
                containerEl.insertAdjacentElement('afterbegin', insertNode);
                applyOk = true;
              }
            } else {
              var anchorEl = findById(ev.data.id);
              if (anchorEl && anchorEl !== document.body && anchorEl.parentElement) {
                anchorEl.insertAdjacentElement('afterend', insertNode);
                applyOk = true;
              }
            }
          }
        } else {
          var applyEl = findById(ev.data.id);
          if (applyEl && applyEl !== document.body && applyEl.parentElement && typeof ev.data.html === 'string') {
            if (activeTextEdit && activeTextEdit.el === applyEl) finishActiveTextEdit(false);
            dropSelectionInside(applyEl);
            applyEl.outerHTML = ev.data.html;
            applyOk = true;
          }
        }
      } catch (applyError) { applyOk = false; }
      // Structural/content mutations can invoke browser scroll anchoring or
      // caret reveal even though the iframe stayed mounted. Put both scroll
      // containers back before measuring/rebroadcasting the changed targets.
      restoreEditScroll(domScrollSnapshot);
      // Positional identity (path-N source-path / auto-annotated data-od-id)
      // encodes DOM positions; any structural mutation shifts the following
      // siblings, so restamp before anyone reads a stale id. Also stamps the
      // newly inserted markup (saved-source html carries no annotations), so
      // it becomes source-mappable and selectable without an iframe reload.
      if (applyOk) restampPositionalIdentity();
      window.parent.postMessage({ type: 'od-edit-apply-dom-result', version: Number(ev.data.version) || 0, ok: applyOk }, '*');
      if (applyOk) setTimeout(postTargets, 0);
      return;
    }
  });
  // One-shot timer armed by the Cmd/Ctrl+V shortcut; any real paste event
  // disarms it (see the paste listener) so the two channels never double-fire.
  var pendingShortcutPaste = 0;
  document.addEventListener('keydown', function(ev){
    if (!enabled || activeTextEdit) return;
    var target = ev.target;
    if (target && target.closest && target.closest('[contenteditable="true"],[contenteditable="plaintext-only"],input,textarea,select')) return;
    var meta = ev.metaKey || ev.ctrlKey;
    var key = ev.key ? ev.key.toLowerCase() : '';
    if (meta && key === 'z') {
      // Focus lives inside the iframe after any canvas click, so the host's
      // own shortcut listener never hears these — forward them.
      ev.preventDefault();
      ev.stopPropagation();
      window.parent.postMessage({ type: 'od-edit-history', op: ev.shiftKey ? 'redo' : 'undo' }, '*');
      return;
    }
    var selected = document.querySelector('[data-od-edit-selected]');
    if (!selected) return;
    if (meta && key === 'd') {
      ev.preventDefault();
      ev.stopPropagation();
      window.parent.postMessage({ type: 'od-edit-duplicate-request', id: stableId(selected) }, '*');
      return;
    }
    if (meta && key === 'c' && !ev.shiftKey && !ev.altKey) {
      // A real text selection keeps native copy; element copy only fires for
      // a collapsed selection so Cmd+C on highlighted text is never hijacked.
      var copySelection = window.getSelection();
      if (copySelection && copySelection.rangeCount > 0 && !copySelection.isCollapsed) return;
      ev.preventDefault();
      ev.stopPropagation();
      window.parent.postMessage({ type: 'od-edit-copy-request', id: stableId(selected) }, '*');
      return;
    }
    if (meta && key === 'v' && !ev.shiftKey && !ev.altKey) {
      // MUST NOT preventDefault here: cancelling the keydown suppresses the
      // native 'paste' event, and that event is the ONLY place clipboard
      // IMAGE bytes are readable — swallowing it broke image paste entirely.
      // Instead, arm a one-shot fallback for environments where no paste
      // event fires without an editable focus: if the native paste event
      // arrives (Chromium fires it on the focused document even with no
      // caret) it handles both the image and element cases and disarms the
      // fallback; only when it never fires does the fallback forward the
      // element-paste request, so a selected image/container still pastes.
      if (pendingShortcutPaste) clearTimeout(pendingShortcutPaste);
      var shortcutPasteId = stableId(selected);
      pendingShortcutPaste = window.setTimeout(function(){
        pendingShortcutPaste = 0;
        window.parent.postMessage({ type: 'od-edit-paste-request', id: shortcutPasteId }, '*');
      }, 150);
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      ev.stopPropagation();
      window.parent.postMessage({ type: 'od-edit-delete-request', id: stableId(selected) }, '*');
    }
  }, true);
  var scrollPostTimer = 0;
  window.addEventListener('scroll', function(){
    if (!enabled) return;
    if (scrollPostTimer) return;
    scrollPostTimer = window.setTimeout(function(){
      scrollPostTimer = 0;
      postTargets();
    }, 120);
  }, true);
  // Interaction listeners sit on WINDOW capture: the window node is visited
  // before document, so stopping propagation here beats page handlers
  // registered at document or element level in any phase. In edit mode the
  // page must be inert — a click selects the element instead of running the
  // page's own lightbox/menu handlers — while native defaults (caret
  // placement, text selection, scrolling) keep working.
  window.addEventListener('click', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) {
      // Clicks inside the active inline-edit element keep the native caret
      // behavior (that's mousedown's default, untouched), but must not reach
      // the page's own delegated handlers or the sandbox shim's anchor
      // interception — an editing element inside <a href="#"> otherwise
      // opens the page's lightbox AND scrolls the canvas to the top.
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
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
    // The FIRST click only selects — it must not enter inline editing. Making a
    // text box contenteditable reflows it (a deck's line-clamped / height-capped
    // paragraph releases its truncation and visibly grows the instant it is
    // selected), so selection would jump the element's size. Editing begins on
    // an explicit second gesture: a click on the ALREADY-selected element or a
    // double-click. This also makes text select the same way images/containers
    // already do — first click selects, nothing reflows.
    var alreadySelected = !!(el.hasAttribute && el.hasAttribute('data-od-edit-selected'));
    var wantsEdit = alreadySelected || (ev && ev.detail >= 2);
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true) }, '*');
    if ((kind === 'text' || kind === 'link') && wantsEdit) {
      makeEditable(el, ev);
      return;
    }
  }, true);
  window.addEventListener('pointerover', function(ev){
    if (!enabled) return;
    // While editing, hovering must not retarget the inspector or surface a new
    // affordance — that's the other half of the #3646 instability.
    if (activeTextEdit) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) return;
    postHoverTarget(el);
  }, true);
  // Page-inertness guard. Blocking propagation at the window capture node
  // keeps every page-owned pointer/hover handler from firing in edit mode
  // (element-level, delegated, and document-capture alike) while native
  // defaults — caret placement, drag selection, scrolling — stay intact.
  // The bridge's own listeners also live on window, so they are unaffected;
  // 'click' is excluded because the click handler above owns that decision.
  ['pointerdown','pointerup','pointerover','pointerout','pointerenter','pointerleave','pointermove','mousedown','mouseup','mouseover','mouseout','mouseenter','mouseleave','mousemove','dblclick','auxclick','contextmenu','touchstart','touchend','touchmove'].forEach(function(type){
    window.addEventListener(type, function(ev){
      if (!enabled) return;
      ev.stopPropagation();
    }, true);
  });
  // Form submission would navigate the sandboxed document; in edit mode it is
  // always a page-owned "operation" and never a bridge gesture.
  window.addEventListener('submit', function(ev){
    if (!enabled) return;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
  function firstImageFile(transfer){
    if (!transfer || !transfer.files) return null;
    for (var i = 0; i < transfer.files.length; i++) {
      var candidate = transfer.files[i];
      if (candidate && candidate.type && candidate.type.indexOf('image/') === 0) return candidate;
    }
    return null;
  }
  // Read the image's BYTES inside the event turn and post those. Clipboard /
  // drag File handles can be neutered once the paste/drop turn ends, and a
  // postMessage-cloned handle then fails the host's upload with
  // net::ERR_UPLOAD_FILE_CHANGED ("upload request failed"). Bytes in memory
  // survive the frame hop and the fetch.
  function postImagePayload(anchorId, file){
    function send(buffer){
      if (!buffer) return;
      window.parent.postMessage({
        type: 'od-edit-paste-image',
        id: anchorId,
        name: file.name || 'pasted-image.png',
        mime: file.type || 'image/png',
        buffer: buffer
      }, '*');
    }
    function readViaReader(){
      try {
        var reader = new FileReader();
        reader.onload = function(){ send(reader.result); };
        reader.readAsArrayBuffer(file);
      } catch (e) {}
    }
    try {
      if (file.arrayBuffer) {
        file.arrayBuffer().then(send, readViaReader);
        return;
      }
    } catch (e) {}
    readViaReader();
  }
  // Cmd/Ctrl+V routes through the native paste event (not keydown) so the
  // clipboard payload is readable: an image file uploads and inserts as a new
  // <img> element; anything else pastes the host's copied element block. An
  // active inline text session keeps native paste for TEXT (it lands at the
  // caret) — but an image file always inserts as an element, since a text
  // session cannot consume it anyway.
  document.addEventListener('paste', function(ev){
    if (!enabled) return;
    // The native paste event supersedes the Cmd/Ctrl+V shortcut fallback —
    // it can see the clipboard (image vs element) where keydown cannot.
    if (pendingShortcutPaste) {
      clearTimeout(pendingShortcutPaste);
      pendingShortcutPaste = 0;
    }
    var pastedImage = firstImageFile(ev.clipboardData);
    if (!pastedImage) {
      if (activeTextEdit) return;
      if (ev.target && ev.target.closest && ev.target.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
    }
    var pasteSelected = document.querySelector('[data-od-edit-selected]');
    var pasteAnchor = pasteSelected
      ? stableId(pasteSelected)
      : activeTextEdit && activeTextEdit.el
        ? stableId(activeTextEdit.el)
        : '';
    ev.preventDefault();
    ev.stopPropagation();
    if (pastedImage) {
      postImagePayload(pasteAnchor, pastedImage);
      return;
    }
    window.parent.postMessage({ type: 'od-edit-paste-request', id: pasteAnchor }, '*');
  }, true);
  // OS file drag-drop: dropping an image creates a new <img> element anchored
  // at the deepest selectable element under the drop point.
  document.addEventListener('dragover', function(ev){
    if (!enabled || !ev.dataTransfer) return;
    var types = ev.dataTransfer.types || [];
    if (Array.prototype.indexOf.call(types, 'Files') < 0) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
  }, true);
  document.addEventListener('drop', function(ev){
    if (!enabled) return;
    var droppedImage = firstImageFile(ev.dataTransfer);
    if (!droppedImage) return;
    ev.preventDefault();
    ev.stopPropagation();
    var dropAnchor = closestTarget(ev);
    postImagePayload(dropAnchor ? stableId(dropAnchor) : '', droppedImage);
  }, true);
  window.addEventListener('resize', postTargets);
  // A freshly pasted/dropped image can be 0x0 during the immediate target
  // pass after insertion and is intentionally filtered out by allTargets().
  // Image load does not mutate the DOM, so MutationObserver cannot announce
  // the now-measurable target; re-post explicitly when its dimensions settle.
  document.addEventListener('load', function(ev){
    var loaded = ev.target;
    if (!enabled || !loaded || !loaded.tagName || loaded.tagName.toLowerCase() !== 'img') return;
    postTargets();
  }, true);
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
  // Quiet chrome: hover previews as a DASHED outline, click commits to a
  // solid one. The SELECTED frame is drawn host-side by
  // ManualEditSelectionOverlay (action bar + drag/resize handles), so the
  // in-iframe selected rule stays subtle instead of double-framing. Hover
  // excludes the selected element so its solid frame never flickers dashed.
  return `<style data-od-edit-bridge-style>
html[data-od-edit-mode], html[data-od-edit-mode] body { overflow-anchor: none !important; }
html[data-od-edit-mode] body * { cursor: pointer !important; }
html[data-od-edit-mode] [data-od-id]:hover:not([data-od-edit-selected]),
html[data-od-edit-mode] [data-od-runtime-id]:hover:not([data-od-edit-selected]),
html[data-od-edit-mode] [data-od-source-path]:hover:not([data-od-edit-selected]) { outline: 1.5px dashed rgba(37, 99, 235, 0.65) !important; outline-offset: 2px !important; }
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: 1px solid rgba(37, 99, 235, 0.4) !important;
  outline-offset: 2px;
}
html[data-od-edit-mode] [data-od-editing="true"] {
  outline: none !important;
  background: rgba(37, 99, 235, 0.05);
  cursor: text !important;
  caret-color: #2563eb;
}
</style>`;
}
