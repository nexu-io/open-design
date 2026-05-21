/**
 * Scroll-position relay injected into HTML served on the url-load preview path
 * (`GET /api/projects/:id/raw/*`).
 *
 * Multi-page prototypes navigate between separate files (e.g. an entry gallery
 * that links out to `screens/*.html` and back). Each "back to list" is a full
 * page load, so the list snaps to 0,0 and the user loses their place. The
 * srcDoc preview path already augments served HTML (see
 * `apps/web/src/runtime/srcdoc.ts`); url-load served raw HTML untouched, so
 * generated prototypes had to hand-roll their own position keeping.
 *
 * This injects a tiny per-pathname scroll memory so it works with zero markup
 * and zero per-project code. It relays through `window.name` because the
 * preview iframe is sandboxed `allow-scripts` without `allow-same-origin`,
 * where `localStorage`/`sessionStorage` reset on every reload while
 * `window.name` survives same-context navigation.
 *
 * Coexistence guard: the relay only reads/writes `window.name` when it is
 * empty or already holds our `ODSCROLL:` map. If a project uses `window.name`
 * for its own purpose, the relay yields entirely and never clobbers it.
 */

export const SCROLL_RELAY_MARKER = 'data-od-scroll-relay';

const SCROLL_RELAY_SCRIPT = `<script ${SCROLL_RELAY_MARKER}>(function(){
  if (window.__odScrollRelay) return; window.__odScrollRelay = 1;
  var K = 'ODSCROLL:';
  function nm(){ try { return String(window.name || ''); } catch (e) { return ''; } }
  function ours(){ var n = nm(); return n === '' || n.indexOf(K) === 0; }
  function load(){ if (!ours()) return null; var n = nm(); if (n.indexOf(K) !== 0) return {}; try { return JSON.parse(n.slice(K.length)) || {}; } catch (e) { return {}; } }
  function store(m){ if (!ours()) return; try { window.name = K + JSON.stringify(m); } catch (e) {} }
  var path = location.pathname;
  var map = load();
  if (map && Object.prototype.hasOwnProperty.call(map, path)) {
    var y = map[path] | 0;
    var apply = function(){ window.scrollTo(0, y); };
    apply();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    requestAnimationFrame(apply);
  }
  function remember(){ var m = load(); if (!m) return; m[path] = Math.round(window.scrollY); store(m); }
  window.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') remember(); });
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if (a) remember(); }, true);
})();</script>`;

/**
 * Inject the scroll relay into an HTML document string. Idempotent (a document
 * already carrying the marker is returned unchanged). Prefers to land just
 * before `</body>`, then `</head>`, then appends as a last resort so even
 * fragment-like HTML still gets it.
 */
export function injectScrollRelay(html: string): string {
  if (html.includes(SCROLL_RELAY_MARKER)) return html;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, (m) => `${SCROLL_RELAY_SCRIPT}${m}`);
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, (m) => `${SCROLL_RELAY_SCRIPT}${m}`);
  return html + SCROLL_RELAY_SCRIPT;
}
