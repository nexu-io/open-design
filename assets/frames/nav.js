/* Open Design — multi-page prototype navigation relay  (served at /frames/nav.js)
 *
 * Drop-in position keeper for link-style multi-page prototypes — an entry
 * gallery/list that links out to separate screen pages (e.g. index.html ->
 * screens/td1.html) and a "back to list" link to return. Without it, every
 * "back to list" is a fresh page load that snaps the list back to 0,0 and
 * forgets which screen the user was on.
 *
 * Usage — two lines, no per-project logic:
 *   1. On EVERY page (the list page and each screen page):
 *        <script src="/frames/nav.js"></script>
 *   2. Mark each "back to the list/home" link with data-home:
 *        <a href="index.html" data-home>&larr; All screens</a>
 *
 * What it does:
 *   - Restores the list's scroll position when the user returns to it via a
 *     back link, instead of resetting to the top.
 *   - Restores the last-viewed screen when the host reloads the iframe to the
 *     entry page (fullscreen / refresh).
 *
 * Why window.name (not localStorage): the preview renders inside an iframe
 * sandboxed `allow-scripts` WITHOUT `allow-same-origin`, so localStorage /
 * sessionStorage throw or are an in-memory shim that resets on reload.
 * window.name is not Web Storage — it survives same-context navigations and
 * reloads inside the sandbox, so it is the one reliable relay channel here.
 *
 * The relay owns window.name for this project; format:
 *   "ODNAV <screenPath#hash> ::GS=<listScrollY>"   (either part optional)
 */
(function () {
  var PREFIX = 'ODNAV ';
  var GS = ' ::GS=';

  function read() {
    var w = String(window.name || '');
    if (w.indexOf(PREFIX) !== 0) return { path: '', gs: null };
    var body = w.slice(PREFIX.length);
    var gi = body.indexOf(GS);
    if (gi < 0) return { path: body, gs: null };
    var n = parseInt(body.slice(gi + GS.length), 10);
    return { path: body.slice(0, gi), gs: isNaN(n) ? null : n };
  }
  function write(path, gs) {
    try { window.name = PREFIX + (path || '') + (gs == null ? '' : GS + gs); }
    catch (e) {}
  }
  function isHome() {
    var m = document.querySelector('meta[name="od-nav"]');
    if (m) return (m.getAttribute('content') || '') === 'home';
    return /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
  }
  function pathOf(s) { var h = s.indexOf('#'); return h < 0 ? s : s.slice(0, h); }

  var here = location.pathname + location.hash;

  if (isHome()) {
    var st = read();
    // 1) On reload/fullscreen, jump back to the last-viewed screen.
    if (st.path && pathOf(st.path) !== location.pathname) { location.replace(st.path); return; }
    // 2) Otherwise restore the saved list scroll (consume it so a later
    //    deliberate scroll-to-top is not overridden on the next load).
    //    This script runs in <head> before the body has height, so a single
    //    scrollTo here is a no-op; re-apply on DOMContentLoaded and the next
    //    frame so the list lands at the saved offset without a 0,0 flash.
    if (st.gs != null) {
      var y = st.gs;
      write('', null);
      var apply = function () { window.scrollTo(0, y); };
      apply();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
      requestAnimationFrame(apply);
    }
    // 3) Before leaving the list for a screen, remember where we were.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.hasAttribute('data-home')) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
      write('', Math.round(window.scrollY));
    }, true);
    return;
  }

  // Screen page: record path+hash so the list page can forward back here on
  // reload/fullscreen, preserving the list-scroll token across the visit.
  function rec() { write(here, read().gs); }
  rec();
  window.addEventListener('hashchange', function () { here = location.pathname + location.hash; rec(); });
  // A back-to-list link drops the forward target but keeps the scroll token,
  // so the list restores the user's place instead of forwarding back here.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('[data-home]');
    if (a) write('', read().gs);
  }, true);
})();
