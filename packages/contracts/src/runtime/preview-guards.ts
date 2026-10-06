/**
 * Cross-runtime preview guard constants plus daemon-safe script builders.
 *
 * The srcDoc runtime consumes the shared redirect protocol constants; the
 * daemon uses the inert script builders to install equivalent passive guards
 * in a real-URL response without importing browser-app private source.
 */

export const PREVIEW_REDIRECT_GUARD_MAX_HOPS = 15;
export const PREVIEW_REDIRECT_GUARD_WINDOW_MS = 4000;
export const PREVIEW_REDIRECT_GUARD_SELF_REFRESH_MIN_DELAY_MS = 2000;
export const PREVIEW_REDIRECT_LOOP_MESSAGE = 'od:redirect-loop-blocked';
/**
 * URL preview responses above this size stay byte-for-byte streamable so the
 * daemon can honor Range requests and avoid buffering a very large document.
 * Callers must not claim URL guards are installed above this boundary.
 */
export const PREVIEW_URL_GUARD_MAX_HTML_BYTES = 2 * 1024 * 1024;

export function previewHtmlHasLoadTimeLocationNavigation(source: string): boolean {
  if (/\blocation\s*\.\s*(?:reload|replace|assign)\s*\(/i.test(source)) return true;
  if (/\blocation\s*\.\s*href\s*=[^=]/i.test(source)) return true;
  if (/\b(?:window|document|self|top|parent)\s*\.\s*location\s*=[^=]/i.test(source)) return true;
  return false;
}

export function buildPreviewSandboxShim(): string {
  return `<script data-od-sandbox-shim>(function(){
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
  function shimHistoryMethod(name){
    try {
      var h = window.history;
      var original = h && h[name];
      if (typeof original !== 'function') return;
      h[name] = function(state, title, url){
        try { return original.call(h, state, title, url); }
        catch (_) { return undefined; }
      };
    } catch (_) {}
  }
  shimHistoryMethod('pushState');
  shimHistoryMethod('replaceState');
  document.addEventListener('click', function(e){
    if (!e.target || !(e.target instanceof Element)) return;
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href === null) return;
    var isAnchor = href.indexOf('#') === 0 || href === '';
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
          if (location.hash === href) history.replaceState(null, '', ' ');
          location.hash = href;
        }
      }
    } else if (link.getAttribute('target') === '_blank') {
      e.preventDefault();
      var safe = false;
      try {
        var parsedUrl = new URL(href, location.href);
        safe = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
      } catch (_) {}
      if (safe) window.open(href, '_blank', 'noopener,noreferrer');
    }
  });
})();</script>`;
}

export function buildPreviewFocusGuard(): string {
  return `<script data-od-preview-focus-guard>(function(){
  var lastTrustedInputAt = 0;
  function userActivated(){ return Date.now() - lastTrustedInputAt < 1000; }
  function markTrustedInput(event){ if (event && event.isTrusted) lastTrustedInputAt = Date.now(); }
  document.addEventListener('pointerdown', function(event){ markTrustedInput(event); }, true);
  document.addEventListener('keydown', function(event){ markTrustedInput(event); }, true);
  try {
    var nativeWindowFocus = window.focus && window.focus.bind(window);
    Object.defineProperty(window, 'focus', {
      configurable: true,
      writable: true,
      value: function(){ if (userActivated() && nativeWindowFocus) return nativeWindowFocus(); }
    });
  } catch (_) {}
  try {
    var nativeElementFocus = HTMLElement.prototype.focus;
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      writable: true,
      value: function(options){ if (userActivated()) return nativeElementFocus.call(this, options); }
    });
  } catch (_) {}
})();</script>`;
}

export function buildPreviewRedirectGuard(
  options: { blockLoadTimeScriptRedirect?: boolean } = {},
): string {
  return `<script data-od-preview-redirect-guard>(function(){
  var NAME_PREFIX = '__odRedirectGuard=';
  var MAX_HOPS = ${PREVIEW_REDIRECT_GUARD_MAX_HOPS};
  var WINDOW_MS = ${PREVIEW_REDIRECT_GUARD_WINDOW_MS};
  var SELF_MIN_DELAY_MS = ${PREVIEW_REDIRECT_GUARD_SELF_REFRESH_MIN_DELAY_MS};
  var MESSAGE_TYPE = ${JSON.stringify(PREVIEW_REDIRECT_LOOP_MESSAGE)};
  var BLOCK_LOAD_TIME_SCRIPT_REDIRECT = ${options.blockLoadTimeScriptRedirect ? 'true' : 'false'};
  function nowMs(){ try { return Date.now(); } catch (_) { return 0; } }
  function readState(){
    try {
      var raw = window.name;
      if (typeof raw === 'string' && raw.indexOf(NAME_PREFIX) === 0) {
        var parsed = JSON.parse(raw.slice(NAME_PREFIX.length));
        if (parsed && typeof parsed.hops === 'number' && typeof parsed.windowStart === 'number') return parsed;
      }
    } catch (_) {}
    return null;
  }
  function writeState(state){
    try { window.name = NAME_PREFIX + JSON.stringify({ hops: state.hops, windowStart: state.windowStart }); } catch (_) {}
  }
  function clearState(){
    try { if (typeof window.name === 'string' && window.name.indexOf(NAME_PREFIX) === 0) window.name = ''; } catch (_) {}
  }
  function nextState(){
    var t = nowMs();
    var prev = readState();
    var withinWindow = prev && (t - prev.windowStart) <= WINDOW_MS;
    return { hops: (withinWindow ? prev.hops : 0) + 1, windowStart: withinWindow ? prev.windowStart : t };
  }
  function scheduleCandidateReset(state){
    try {
      if (typeof setTimeout !== 'function') return;
      setTimeout(function(){
        try {
          var current = readState();
          if (current && current.hops === state.hops && current.windowStart === state.windowStart) clearState();
        } catch (_) {}
      }, WINDOW_MS + 1);
    } catch (_) {}
  }
  function report(hops){
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: MESSAGE_TYPE, hops: hops }, '*');
      }
    } catch (_) {}
  }
  function recordScriptRedirectCandidate(){
    if (!BLOCK_LOAD_TIME_SCRIPT_REDIRECT) return;
    var state = nextState();
    if (state.hops > MAX_HOPS) {
      clearState();
      report(state.hops);
      return;
    }
    writeState(state);
    scheduleCandidateReset(state);
  }
  function metaRefreshes(){
    var out = [];
    try {
      var metas = document.getElementsByTagName('meta');
      for (var i = 0; i < metas.length; i++) {
        var equiv = metas[i].getAttribute ? metas[i].getAttribute('http-equiv') : null;
        if (equiv && String(equiv).toLowerCase() === 'refresh') out.push(metas[i]);
      }
    } catch (_) {}
    return out;
  }
  function parseContent(meta){
    var content = '';
    try { content = String(meta.getAttribute('content') || ''); } catch (_) {}
    var delayMatch = content.match(/^\\s*([0-9]+(?:\\.[0-9]+)?)/);
    var delayMs = delayMatch ? Math.round(parseFloat(delayMatch[1]) * 1000) : 0;
    var urlMatch = content.match(/[;,]\\s*url\\s*=\\s*['"]?\\s*([^'"\\s]+)/i);
    return { delayMs: delayMs, url: urlMatch ? urlMatch[1] : '' };
  }
  function currentArtifactHref(){
    try {
      var href = String(location.href || '');
      if (href === 'about:srcdoc') return String(document.baseURI || href);
      return href;
    } catch (_) { return ''; }
  }
  function isSelfTarget(url){
    if (!url) return true;
    try {
      var base = document.baseURI || location.href;
      return new URL(url, base).href === currentArtifactHref();
    } catch (_) { return false; }
  }
  function isFastSrcdocUrlHop(parsed){
    if (!parsed.url || parsed.delayMs > SELF_MIN_DELAY_MS) return false;
    try { return String(location.href || '') === 'about:srcdoc'; } catch (_) { return false; }
  }
  function neutralize(metas){
    for (var i = 0; i < metas.length; i++) {
      try { if (metas[i].parentNode) metas[i].parentNode.removeChild(metas[i]); } catch (_) {}
    }
    try { if (window.stop) window.stop(); } catch (_) {}
  }
  function evaluate(){
    var metas = metaRefreshes();
    if (!metas.length) {
      if (!BLOCK_LOAD_TIME_SCRIPT_REDIRECT) clearState();
      return;
    }
    var selfLoop = false;
    for (var i = 0; i < metas.length; i++) {
      var parsed = parseContent(metas[i]);
      if (parsed.delayMs <= SELF_MIN_DELAY_MS && isSelfTarget(parsed.url)) { selfLoop = true; break; }
      if (isFastSrcdocUrlHop(parsed)) { selfLoop = true; break; }
    }
    var state = nextState();
    if (selfLoop || state.hops > MAX_HOPS) {
      neutralize(metas);
      clearState();
      report(state.hops);
      return;
    }
    writeState(state);
  }
  recordScriptRedirectCandidate();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', evaluate);
  else evaluate();
})();</script>`;
}
