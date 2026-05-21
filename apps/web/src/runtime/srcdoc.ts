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
import {
  buildManualEditBridge,
  buildManualEditBridgeStyle,
  MANUAL_EDIT_DISCOVERY_SELECTOR,
  MANUAL_EDIT_SOURCE_PATH_ATTR,
} from '../edit-mode/bridge';
import {
  SELECTION_BRIDGE_SCRIPT,
  SELECTION_BRIDGE_STYLE,
  ROUTE_PERSIST_SCRIPT,
} from '@open-design/contracts/preview-bridges';

export type SrcdocOptions = {
  deck?: boolean;
  baseHref?: string;
  initialSlideIndex?: number;
  commentBridge?: boolean;
  inspectBridge?: boolean;
  selectionBridge?: boolean;
  editBridge?: boolean;
  paletteBridge?: boolean;
  initialPalette?: string | null;
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
  const withOdIds = annotateMissingOdIds(wrapped);
  const withSourcePaths = options.editBridge ? annotateManualEditSourcePaths(withOdIds) : withOdIds;
  const withBase = options.baseHref ? injectBaseHref(withSourcePaths, options.baseHref) : withSourcePaths;
  const withShim = injectSandboxShim(withBase);
  const withDeck = options.deck ? injectDeckBridge(withShim, options.initialSlideIndex) : withShim;
  // Comment + Inspect share an element-selection bridge: both pick a
  // [data-od-id] / [data-screen-label] node and route the host's reply
  // to either the comment popover (annotate) or the inspect panel
  // (live-style overrides). Inject once when either mode is on. Pass the
  // requested modes through so the bridge boots with picking already
  // active — without that initial seed there is a window after each
  // srcdoc rebuild where the host's `od:*-mode` postMessage races the
  // bridge's own listener install and the iframe ignores clicks.
  const withSelection = options.selectionBridge || options.commentBridge || options.inspectBridge
    ? injectSelectionBridge(withDeck, {
        initialCommentMode: !!options.commentBridge,
        initialInspectMode: !!options.inspectBridge,
      })
    : withDeck;
  const withPalette = options.paletteBridge
    ? injectPaletteBridge(withSelection, { initialPalette: options.initialPalette ?? null })
    : withSelection;
  const withEdit = options.editBridge ? injectManualEditBridge(withPalette) : withPalette;
  // The tweaks bridge is always injected — it's a passive listener that
  // toggles a `.tw-panel`'s visibility in response to host postMessage. Tying
  // it to a per-call option would force iframe srcdoc regeneration (and a
  // visible flash) every time the host toggle flips.
  const withTweaks = injectTweaksBridge(withEdit);
  // Issue #2143 — preserve in-iframe SPA route across mode toggles.
  // Mode flips (comment / draw / inspect / edit / tweaks) re-render the
  // srcDoc string and remount the iframe, wiping React-Router state. The
  // bridge stamps the artifact's history.{push,replace}State + popstate +
  // hashchange events into sessionStorage and restores the path before any
  // user script runs on the next mount, so the artifact comes back where
  // the user left it instead of jumping to the entry document.
  const withRoutePersist = injectRoutePersistBridge(withTweaks);
  return injectSrcdocTransportActivationBridge(injectSnapshotBridge(withRoutePersist));
}

/**
 * Build the lazy transport shell.
 *
 * The shell does two things:
 *   1. Register a listener for `od:srcdoc-transport-activate` that replaces
 *      its own document with the real artifact HTML.
 *   2. Post `od:srcdoc-transport-ready` to the parent as soon as the listener
 *      is installed. This `ready` signal is the only reliable way for the
 *      host to know the listener is live; without it, the host risks posting
 *      `activate` before the iframe's script has executed (e.g. right after a
 *      key-driven re-mount), in which case the message is dropped and the
 *      iframe stays stuck on the empty shell. See #2253.
 */
export function buildLazySrcdocTransport(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script data-od-lazy-srcdoc-transport>(function(){
      window.addEventListener('message', function(ev){
        var data = ev && ev.data;
        if (!data || data.type !== 'od:srcdoc-transport-activate' || typeof data.html !== 'string') return;
        document.open();
        document.write(data.html);
        document.close();
      });
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'od:srcdoc-transport-ready' }, '*');
        }
      } catch (_) { /* sandboxed parent — host falls back to onLoad */ }
    })();</script>
  </head>
  <body></body>
</html>`;
}

export interface SrcDocActivationInputs {
  /** The real artifact HTML the host wants to inject into the shell. */
  srcDoc: string;
  /** Host is currently showing the URL-loaded iframe (srcDoc iframe is hidden). */
  useUrlLoadPreview: boolean;
  /** Host's render pipeline is routing through the lazy transport shell. */
  useLazySrcDocTransport: boolean;
  /** The shell document has loaded AND posted `od:srcdoc-transport-ready`. */
  shellReady: boolean;
  /** Which artifact HTML has already been pushed into this shell (dedupe). */
  activatedHtml: string | null;
}

/**
 * Pure decision for whether the host should now post
 * `od:srcdoc-transport-activate` to the shell iframe.
 *
 * Gating on `shellReady` is the fix for #2253: without it, an activation
 * triggered by `useUrlLoadPreview` flipping to false (e.g. opening the
 * Tweaks palette) can fire while the iframe's shell script has not yet
 * registered its message listener. The message is dropped, the shell stays
 * on its empty 536-byte body, and the dedupe check then suppresses the
 * follow-up activation from the iframe's onLoad path.
 */
export function canActivateSrcDocTransport(state: SrcDocActivationInputs): boolean {
  if (!state.srcDoc) return false;
  if (state.useUrlLoadPreview) return false;
  if (!state.useLazySrcDocTransport) return false;
  if (!state.shellReady) return false;
  if (state.activatedHtml === state.srcDoc) return false;
  return true;
}

function injectSrcdocTransportActivationBridge(doc: string): string {
  const script = `<script data-od-srcdoc-transport-activation>(function(){
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:srcdoc-transport-activate' || typeof data.html !== 'string') return;
    document.open();
    document.write(data.html);
    document.close();
  });
})();</script>`;
  return injectBeforeBodyEnd(doc, script);
}

function injectSnapshotBridge(doc: string): string {
  const script = `<script data-od-snapshot-bridge>(function(){
  function copyComputedStyle(source, target){
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    var computed = window.getComputedStyle(source);
    var style = target.getAttribute('style') || '';
    for (var i = 0; i < computed.length; i++){
      var prop = computed[i];
      style += prop + ':' + computed.getPropertyValue(prop) + ';';
    }
    target.setAttribute('style', style);
  }
  function syncElementState(source, target){
    var tag = source.tagName ? source.tagName.toLowerCase() : '';
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input' || tag === 'textarea') target.setAttribute('value', source.value || '');
    if (tag === 'canvas') {
      try {
        var img = document.createElement('img');
        img.setAttribute('src', source.toDataURL('image/png'));
        img.setAttribute('style', target.getAttribute('style') || '');
        target.parentNode && target.parentNode.replaceChild(img, target);
      } catch (_) {}
    }
  }
  function inlineSnapshotStyles(originalRoot, cloneRoot){
    copyComputedStyle(originalRoot, cloneRoot);
    syncElementState(originalRoot, cloneRoot);
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length);
    for (var i = 0; i < count; i++){
      copyComputedStyle(originals[i], clones[i]);
      syncElementState(originals[i], clones[i]);
    }
    var scripts = cloneRoot.querySelectorAll('script');
    for (var s = scripts.length - 1; s >= 0; s--) scripts[s].remove();
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    return Promise.all(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }
  function renderSnapshot(id){
    var w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var docW = Math.max(w, document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0);
    var docH = Math.max(h, document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var clone = document.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    inlineSnapshotStyles(document.documentElement, clone);
    var serializer = new XMLSerializer();
    var html = serializer.serializeToString(clone);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="' + (-window.scrollX || 0) + '" y="' + (-window.scrollY || 0) + '" width="' + docW + '" height="' + docH + '">' +
      html +
      '</foreignObject></svg>';
    var img = new Image();
    img.onload = function(){
      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, w, h);
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }, '*');
      } catch (err) {
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: String(err && err.message || err) }, '*');
      }
    };
    img.onerror = function(){
      window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: 'snapshot image failed' }, '*');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    waitForImages().then(function(){ renderSnapshot(String(data.id)); });
  });
})();</script>`;
  return injectBeforeBodyEnd(doc, script);
}

// Palette bridge: re-skin the page on host postMessage. Generated pages
// hard-code multiple shades of one accent and a CSS-variable swap will
// not catch them. We walk the DOM and shift any chromatic paint to the
// target palette's hue while keeping each color's saturation and
// lightness — pale tints stay pale, bold CTAs stay bold, just in the
// new color family. Mono-noir desaturates instead of shifting.
function injectPaletteBridge(
  doc: string,
  options: { initialPalette: string | null } = { initialPalette: null },
): string {
  const initial = options.initialPalette
    ? JSON.stringify(String(options.initialPalette))
    : 'null';
  const script = `<script data-od-palette-bridge>(function(){
  var PALETTES = {
    'coral':       { hue: 10,  satFloor: 0.55, mono: false },
    'electric':    { hue: 262, satFloor: 0.55, mono: false },
    'acid-forest': { hue: 142, satFloor: 0.55, mono: false },
    'risograph':   { hue: 349, satFloor: 0.60, mono: false },
    'mono-noir':   { hue: 0,   satFloor: 0,    mono: true  }
  };
  var current = ${initial};
  var ATTR = 'data-od-palette-fix';
  var SAVED = '__odPaletteSaved__';
  var MIN_SAT = 0.08;
  var WALK_LIMIT = 12000;
  var STYLE_RULE_LIMIT = 5000;
  var ROOT_SELECTOR = /(^|,)\\s*(:root|html|body|:host)\\s*($|,)/;
  var varApplied = Object.create(null);
  var probeEl = null;
  function parseRgb(s){
    var str = String(s||'').trim();
    if (!str || str === 'transparent' || str === 'none') return null;
    var m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(/[\\s,/]+/).filter(Boolean).map(function(x){ return parseFloat(x); });
    if (p.length < 3) return null;
    return { r: p[0]||0, g: p[1]||0, b: p[2]||0, a: p[3] == null ? 1 : p[3] };
  }
  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    var max=Math.max(r,g,b), min=Math.min(r,g,b);
    var h=0, s=0, l=(max+min)/2;
    if (max!==min){
      var d=max-min;
      s = l>0.5 ? d/(2-max-min) : d/(max+min);
      if (max===r) h=(g-b)/d + (g<b?6:0);
      else if (max===g) h=(b-r)/d + 2;
      else h=(r-g)/d + 4;
      h *= 60;
    }
    return {h:h, s:s, l:l};
  }
  function h2rgb(p,q,t){
    if (t<0) t+=1;
    if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  }
  function hslStr(h,s,l){
    h = ((h%360)+360)%360/360;
    var r,g,b;
    if (s===0){ r=g=b=l; }
    else {
      var q = l<0.5 ? l*(1+s) : l+s-l*s;
      var p = 2*l-q;
      r=h2rgb(p,q,h+1/3); g=h2rgb(p,q,h); b=h2rgb(p,q,h-1/3);
    }
    return 'rgb('+Math.round(r*255)+','+Math.round(g*255)+','+Math.round(b*255)+')';
  }
  function chromatic(c){
    if (!c || c.a < 0.3) return null;
    var hsl = rgbToHsl(c.r,c.g,c.b);
    if (hsl.s < MIN_SAT) return null;
    if (hsl.l < 0.04 || hsl.l > 0.98) return null;
    return hsl;
  }
  function shift(hsl, palette){
    if (palette.mono) return hslStr(0, 0, hsl.l);
    var sat = Math.max(hsl.s, palette.satFloor * 0.7);
    return hslStr(palette.hue, sat, hsl.l);
  }
  function normalizeColor(value){
    var raw = String(value||'').trim();
    if (!raw) return null;
    var direct = parseRgb(raw);
    if (direct) return direct;
    if (raw.indexOf('var(') === 0 || raw.indexOf('--') === 0) return null;
    if (!probeEl){
      probeEl = document.createElement('div');
      probeEl.style.display = 'none';
      (document.body || document.documentElement).appendChild(probeEl);
    }
    probeEl.style.color = '';
    try { probeEl.style.color = raw; } catch (_){ return null; }
    if (!probeEl.style.color) return null;
    return parseRgb(probeEl.style.color);
  }
  function isRootSelector(selector){
    return !!selector && ROOT_SELECTOR.test(String(selector));
  }
  function forEachStyleRule(rules, visit, budget){
    if (!rules || !budget.left) return;
    for (var i=0; i<rules.length && budget.left>0; i++){
      var rule = rules[i];
      budget.left--;
      if (rule.selectorText && rule.style && isRootSelector(rule.selectorText)) visit(rule);
      if (rule.cssRules && rule.cssRules.length) forEachStyleRule(rule.cssRules, visit, budget);
    }
  }
  function applyVarTint(palette){
    var sheets = document.styleSheets;
    if (!sheets || !sheets.length) return;
    var budget = { left: STYLE_RULE_LIMIT };
    for (var i=0; i<sheets.length; i++){
      var sheet = sheets[i];
      var rules = null;
      try { rules = sheet.cssRules; } catch (_){ continue; }
      forEachStyleRule(rules, function(rule){
        var decl = rule.style;
        for (var j=0; j<decl.length; j++){
          var name = decl[j];
          if (name.indexOf('--') !== 0) continue;
          var raw = decl.getPropertyValue(name);
          var color = normalizeColor(raw);
          var hsl = chromatic(color);
          if (!hsl) continue;
          document.documentElement.style.setProperty(name, shift(hsl, palette));
          varApplied[name] = true;
        }
      }, budget);
    }
  }
  function restoreVars(){
    for (var name in varApplied){
      document.documentElement.style.setProperty(name, '');
    }
    varApplied = Object.create(null);
  }
  function restoreAll(){
    restoreVars();
    var nodes = document.querySelectorAll('['+ATTR+']');
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i], saved = el[SAVED];
      if (saved){
        if ('bg' in saved) el.style.backgroundColor = saved.bg;
        if ('color' in saved) el.style.color = saved.color;
        if ('border' in saved) el.style.borderColor = saved.border;
        if ('fill' in saved){ if (saved.fill) el.setAttribute('fill', saved.fill); else el.removeAttribute('fill'); }
        if ('stroke' in saved){ if (saved.stroke) el.setAttribute('stroke', saved.stroke); else el.removeAttribute('stroke'); }
      }
      el.removeAttribute(ATTR);
      delete el[SAVED];
    }
  }
  function applyTint(id){
    var palette = PALETTES[id];
    if (!palette) return;
    applyVarTint(palette);
    var all = document.body ? document.body.querySelectorAll('*') : [];
    for (var i=0; i<all.length && i<WALK_LIMIT; i++){
      var el = all[i], cs = getComputedStyle(el), saved = {}, changed = false;
      var bg = chromatic(parseRgb(cs.backgroundColor));
      if (bg){ saved.bg = el.style.backgroundColor; el.style.setProperty('background-color', shift(bg, palette), 'important'); changed = true; }
      var fg = chromatic(parseRgb(cs.color));
      if (fg){ saved.color = el.style.color; el.style.setProperty('color', shift(fg, palette), 'important'); changed = true; }
      var bd = chromatic(parseRgb(cs.borderTopColor));
      if (bd){ saved.border = el.style.borderColor; el.style.setProperty('border-color', shift(bd, palette), 'important'); changed = true; }
      var fillAttr = el.getAttribute && el.getAttribute('fill');
      if (fillAttr){
        var f = chromatic(parseRgb(cs.fill));
        if (f){ saved.fill = fillAttr; el.setAttribute('fill', shift(f, palette)); changed = true; }
      }
      var strokeAttr = el.getAttribute && el.getAttribute('stroke');
      if (strokeAttr){
        var sk = chromatic(parseRgb(cs.stroke));
        if (sk){ saved.stroke = strokeAttr; el.setAttribute('stroke', shift(sk, palette)); changed = true; }
      }
      if (changed){ el[SAVED] = saved; el.setAttribute(ATTR, '1'); }
    }
  }
  function apply(id){
    restoreAll();
    if (!id || !PALETTES[id]){ current = null; return; }
    current = id;
    applyTint(id);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:palette') return;
    apply(data.palette ? String(data.palette) : null);
  });
  function boot(){ if (current) apply(current); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();</script>`;
  return injectBeforeBodyEnd(doc, script);
}

function annotateManualEditSourcePaths(doc: string): string {
  if (typeof DOMParser === 'undefined') return doc;
  try {
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    parsed.body.querySelectorAll(MANUAL_EDIT_DISCOVERY_SELECTOR).forEach((el) => {
      if (el.hasAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR)) return;
      const path = sourcePathForElement(el);
      if (path) el.setAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR, path);
    });
    return serializeHtmlDocument(parsed);
  } catch {
    return doc;
  }
}

function sourcePathForElement(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    parts.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

function serializeHtmlDocument(doc: Document): string {
  const doctype = doc.doctype ? '<!doctype html>\n' : '';
  return `${doctype}${doc.documentElement.outerHTML}`;
}

/**
 * Auto-annotate structural HTML elements that lack `data-od-id` or
 * `data-screen-label` so that the selection bridge (Picker / Pods /
 * Tweaks) can target them. This fixes imported designs whose HTML was
 * generated outside of Open Design and therefore carries no OD-specific
 * annotations.
 */
function annotateMissingOdIds(doc: string): string {
  if (typeof DOMParser === 'undefined') return doc;
  try {
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    // Only target divs that are direct children of semantic containers or body;
    // deeply nested layout divs (e.g. flex/grid wrappers) create noise in the
    // selection bridge without adding meaningful pickable targets.
    const selector = [
      'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'button', 'a', '[id]',
      'body > div[class]', 'body > div[id]',
      'section > div[class]', 'section > div[id]',
      'article > div[class]', 'article > div[id]',
      'main > div[class]', 'main > div[id]',
      'header > div[class]', 'header > div[id]',
      'footer > div[class]', 'footer > div[id]',
      'nav > div[class]', 'nav > div[id]',
      'aside > div[class]', 'aside > div[id]',
      '[id] > div[class]', '[id] > div[id]',
    ].join(', ');
    const skipTags = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed']);
    let fallbackIndex = 0;
    parsed.body.querySelectorAll(selector).forEach((el) => {
      if (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label')) return;
      const tag = el.tagName.toLowerCase();
      if (skipTags.has(tag)) return;
      const path = sourcePathForElement(el);
      el.setAttribute('data-od-id', path || `od-${tag}-${fallbackIndex++}`);
    });
    return serializeHtmlDocument(parsed);
  } catch {
    return doc;
  }
}

function injectManualEditBridge(doc: string): string {
  const withStyle = injectBeforeHeadEnd(doc, buildManualEditBridgeStyle());
  return injectBeforeBodyEnd(withStyle, buildManualEditBridge(true));
}

// Run before user scripts so React-Router reads the restored path on its
// initial render instead of the entry path. Idempotent across remounts via
// data-od-route-persist marker. Storage key is per-origin (sessionStorage
// is keyed to the iframe's "null" srcdoc origin which is stable across
// remounts within the same parent doc); we partition by document.title +
// pathname-prefix when present so two artifacts in the same session don't
// collide. Failure modes are silent — sandboxed iframes without storage
// fall back to memory-only which still survives same-tab remounts.
function injectRoutePersistBridge(doc: string): string {
  return injectBeforeHeadEnd(doc, ROUTE_PERSIST_SCRIPT);
}

function injectBeforeHeadEnd(doc: string, payload: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parsed = new DOMParser().parseFromString(doc, 'text/html');
      if (parsed.head) parsed.head.insertAdjacentHTML('beforeend', payload);
      return serializeHtmlDocument(parsed);
    } catch { /* DOMParser failed; fall through to string path */ }
  }
  // String fallback: find the real </head> (last one before <body>)
  // to skip </head> literals inside <script>/<style> in <head>.
  const lower = doc.toLowerCase();
  const bodyStart = lower.indexOf('<body');
  const limit = bodyStart >= 0 ? bodyStart : lower.length;
  const idx = lower.lastIndexOf('</head>', limit - 1);
  if (idx >= 0) return doc.slice(0, idx) + payload + doc.slice(idx);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${payload}`);
  return payload + doc;
}

function injectBeforeBodyEnd(doc: string, payload: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parsed = new DOMParser().parseFromString(doc, 'text/html');
      if (parsed.body) parsed.body.insertAdjacentHTML('beforeend', payload);
      return serializeHtmlDocument(parsed);
    } catch { /* DOMParser failed; fall through to string path */ }
  }
  // String fallback: find the real </body> (last one before </html>)
  // to skip </body> literals inside <script>/<style> in <body>.
  const lower = doc.toLowerCase();
  const htmlEnd = lower.lastIndexOf('</html>');
  const limit = htmlEnd >= 0 ? htmlEnd : lower.length;
  const idx = lower.lastIndexOf('</body>', limit - 1);
  if (idx >= 0) return doc.slice(0, idx) + payload + doc.slice(idx);
  return doc + payload;
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
// allow-popups and allow-popups-to-escape-sandbox are needed for 
// links with target="_blank" to work in the sandboxed preview.
// Empty hrefs and hash only hrefs will be intercepted and ignored.
// hrefs leading to an id on the page will be scrolled into view.
function injectSandboxShim(doc: string): string {
  const shim = `<script data-od-sandbox-shim>(function(){
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
  document.addEventListener('click', (e) => {
    if (!e.target || !(e.target instanceof Element)) return;
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href === null) return;
    var isAnchor = href.startsWith('#') || href === '';
    if (isAnchor) {
      e.preventDefault();
      if (href === '' || href === '#') {
        window.scrollTo({ top: 0 });
        history.replaceState(null, '', ' ');
      } else {
        var targetId = href.slice(1);
        var target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView();
          location.hash === href && history.replaceState(null, '', ' ');
          location.hash = href;
        }
      }
    } else if (link.getAttribute('target') === '_blank') {
      e.preventDefault();
      let safe = false;
      try {
        var url = new URL(href, location.href);
        safe =
          url.protocol === 'http:' ||
          url.protocol === 'https:' ||
          url.protocol === 'mailto:';
      } catch (_) {}
      safe && window.open(href, '_blank', 'noopener,noreferrer');
    }
  });
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${shim}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${shim}`);
  return shim + doc;
}

// Selection bridge: shared substrate for Comment mode and Inspect mode.
// Both modes pick a [data-od-id] / [data-screen-label] element on click;
// the difference is what the host does with the selection — annotate
// (Comment) or live-tune basic styles (Inspect).
//
// Inspect adds four messages on top of the comment protocol:
//   in:  { type: 'od:inspect-set', elementId, selector, prop, value }
//        Apply (or unset, when value === '') a per-element CSS override.
//   in:  { type: 'od:inspect-reset', elementId? } Clear overrides for one
//        element, or all if elementId is omitted.
//   in:  { type: 'od:inspect-extract' } Reply with the cumulative
//        override map so the host can persist to source.
//   in:  { type: 'od:inspect-replay', overrides } Replace the in-memory
//        override map with the host's authoritative set so the iframe
//        preview matches host state after every srcdoc rebuild. Without
//        this the bridge re-hydrates only the persisted <style> block on
//        load, so any unsaved edit the host still holds disappears from
//        the preview while saveInspectToSource() can later commit CSS the
//        user is no longer seeing. Re-validates every entry under the
//        same allow-list / value sanitizer applied to od:inspect-set.
//   out: { type: 'od:inspect-overrides', overrides } The current snapshot,
//        sent in reply to extract and after every set/reset/replay. The
//        host re-derives the persisted CSS body from the structured map
//        under its own allow-list — the bridge's own stylesheet text is
//        NOT included in this message because artifact JS can forge a
//        same-source od:inspect-overrides containing a hostile `css`.
//
// Overrides are written into a single <style data-od-inspect-overrides>
// block in <head>, with `!important` on every property so the bridge
// can defeat author inline styles (common in agent-generated HTML).
//
// Security: this bridge runs inside a sandboxed iframe but still shares the
// host page context for the override <style> element. The message listener
// does NOT validate ev.origin — the web app runs on configurable ports and
// preview domains, so the host origin is not stable. The bridge therefore
// trusts any parent that can postMessage to it and relies on iframe
// sandboxing + the prop allow-list / value sanitization below to contain
// damage. Any parent able to postMessage here can already mount the iframe.
function injectSelectionBridge(
  doc: string,
  options: { initialCommentMode?: boolean; initialInspectMode?: boolean } = {},
): string {
  // Issue #2143 — selection bridge is now shared with the daemon URL-load
  // path so comment / inspect modes don't need a transport flip. The shared
  // payload boots dormant; we seed initial modes via a tiny inline script
  // that posts to self after the bridge installs its message listener.
  const initScript = (options.initialCommentMode || options.initialInspectMode)
    ? `<script data-od-selection-bridge-init>(function(){
        if (${options.initialCommentMode ? 'true' : 'false'}) {
          window.postMessage({ type: 'od:comment-mode', enabled: true, mode: 'picker' }, '*');
        }
        if (${options.initialInspectMode ? 'true' : 'false'}) {
          window.postMessage({ type: 'od:inspect-mode', enabled: true }, '*');
        }
      })();</script>`
    : '';
  return injectBeforeBodyEnd(
    injectBeforeHeadEnd(doc, SELECTION_BRIDGE_STYLE),
    SELECTION_BRIDGE_SCRIPT + initScript,
  );
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
//
// Framework decks (apps/daemon/src/prompts/deck-framework.ts) opt out:
// their `fit()` already centers a `transform-origin: top left` stage with
// an explicit `translate(tx, ty)` that assumes the stage's natural layout
// position is (0, 0). If we force `place-content: center` on their
// `.deck-shell` grid, the implicit track gets re-centered to
// ((sw-1920)/2, (sh-1080)/2) and `fit()`'s translate stacks on top, so
// the scaled stage lands ~1000px off-screen and the user sees a mostly-
// black preview with a sliver of slide content in the top-left. Skip the
// override whenever the framework's marker id is present.
function injectDeckBridge(doc: string, initialSlideIndex = 0): string {
  const safeInitialSlideIndex = Number.isFinite(initialSlideIndex)
    ? Math.max(0, Math.floor(initialSlideIndex))
    : 0;
  const isFrameworkDeck = /\bid\s*=\s*["']deck-stage["']/i.test(doc);
  const styleFix = isFrameworkDeck
    ? ''
    : `<style data-od-deck-fix>
.stage, .deck-stage, .deck-shell { place-content: center !important; }
</style>`;
  const script = `<script data-od-deck-bridge>(function(){
  var initialSlideIndex = ${safeInitialSlideIndex};
  var didRestoreInitialSlide = initialSlideIndex <= 0;
  function slides(){
    // Structured selectors first so decorative .slide markup in non-deck
    // pages (icons, badges, code samples) is not counted as deck slides;
    // fall back to all .slide only when nothing structured matched, so
    // freeform decks that nest slides under an extra wrapper still report
    // the real count instead of leaving the host counter at 1 / 0.
    var structured = document.querySelectorAll('.deck > .slide, .deck-stage > .slide, .deck-shell > .slide, body > .slide');
    if (structured.length) return structured;
    return document.querySelectorAll('.slide');
  }
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
      var i = activeIndex(list);
      var count = list.length;
      window.parent.postMessage({
        type: 'od:slide-state',
        active: i,
        count: count,
      }, '*');
      document.querySelectorAll('.slide-number').forEach(function(el){
        el.setAttribute('data-current',i+1); el.setAttribute('data-total',count);
      });
      document.querySelectorAll('.progress-bar>span').forEach(function(el){
        el.style.width=(count?((i+1)/count*100)+'%':'0');
      });
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
  return injectBeforeBodyEnd(injectBeforeHeadEnd(doc, styleFix), script);
}

// The tweaks bridge lets the host toolbar toggle the visibility of the artifact's
// native tweaks panel. Bidirectional: host posts `od:tweaks-panel-visible` to
// drive panel visibility; bridge posts `od:tweaks-panel-state` back whenever the
// artifact's own `× close` button or `T` shortcut flips the `.tw-hidden` class,
// so the toolbar toggle stays in sync. Also reports `od:tweaks-available` so the
// host can disable the toggle on artifacts without a `.tw-panel`.
function injectTweaksBridge(doc: string): string {
  // Hide-state styling mirrors the artifact's own `.tw-hidden` (transform +
  // opacity) so the CSS transition plays in both directions. `.tw-restore` is
  // kept permanently hidden — the host toolbar is the only entry point.
  const style = `<style data-od-tweaks-bridge-style>
[data-od-tweaks-hidden] .tw-panel {
  transform: translateX(calc(100% + 32px)) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.tw-restore { display: none !important; }
</style>`;
  const script = `<script data-od-tweaks-bridge>(function(){
  // Synchronously hide BEFORE the artifact body parses so the panel never
  // flashes on initial paint. The host removes the attribute via postMessage
  // once it knows the desired state.
  document.documentElement.setAttribute('data-od-tweaks-hidden', '');

  var suppressEcho = false;
  var observer = null;

  function panelEl(){ return document.querySelector('.tw-panel'); }

  function applyClassesToPanel(visible){
    var panel = panelEl();
    if (panel) panel.classList.toggle('tw-hidden', !visible);
  }

  function setPanelVisible(visible){
    suppressEcho = true;
    document.documentElement.toggleAttribute('data-od-tweaks-hidden', !visible);
    applyClassesToPanel(visible);
    // Clear flag after the MutationObserver has had a chance to fire for this
    // change so we don't echo our own host-driven toggles back to the host.
    Promise.resolve().then(function(){ suppressEcho = false; });
  }

  function postState(){
    var panel = panelEl();
    if (!panel) return;
    try {
      parent.postMessage({
        type: 'od:tweaks-panel-state',
        visible: !panel.classList.contains('tw-hidden'),
      }, '*');
    } catch (e) {}
  }

  function postAvailability(){
    try {
      parent.postMessage({
        type: 'od:tweaks-available',
        available: !!panelEl(),
      }, '*');
    } catch (e) {}
  }

  function attachObserver(){
    var panel = panelEl();
    if (!panel || observer) return;
    observer = new MutationObserver(function(){
      if (suppressEcho) return;
      postState();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  function onReady(){
    // Capture the panel authored visibility BEFORE we apply the host hidden
    // attribute. The bridge sets data-od-tweaks-hidden synchronously in head
    // (before the body parses), so on entry to onReady the attribute is
    // always present even though the artifact may have authored the panel
    // as default-visible. Reading the panel class first is the only place
    // we can still observe the author intent. Then drive the attribute,
    // classes, and posted state from that captured value so a default
    // visible tw-panel reports visible:true and the toolbar toggle starts
    // ON. Issue surfaced in PR #1643 review.
    var panel = panelEl();
    var initialVisible = !!panel && !panel.classList.contains('tw-hidden');
    document.documentElement.toggleAttribute('data-od-tweaks-hidden', !initialVisible);
    applyClassesToPanel(initialVisible);
    attachObserver();
    postAvailability();
    // Post the captured initial visibility so the toolbar toggle reflects
    // the default state on mount. Without this the toggle reads OFF while
    // a default-visible tw-panel artifact clearly shows its panel and the
    // user would have to click toggle-on then toggle-off to actually hide.
    postState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  window.addEventListener('message', function(ev){
    if (!ev.data || ev.data.type !== 'od:tweaks-panel-visible') return;
    setPanelVisible(!!ev.data.visible);
  });
})();</script>`;
  const withStyle = /<\/head>/i.test(doc)
    ? doc.replace(/<\/head>/i, style + '</head>')
    : /<head[^>]*>/i.test(doc)
      ? doc.replace(/<head[^>]*>/i, (m) => m + style)
      : style + doc;
  // Inject the bridge as early as possible (inside <head>) so the synchronous
  // attribute set runs before the artifact body parses.
  if (/<\/head>/i.test(withStyle)) return withStyle.replace(/<\/head>/i, script + '</head>');
  if (/<head[^>]*>/i.test(withStyle)) return withStyle.replace(/<head[^>]*>/i, (m) => m + script);
  return script + withStyle;
}
