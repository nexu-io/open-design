const RELAY_MARKER = 'data-od-prototype-location-relay';

const LOCATION_RELAY_SCRIPT = `<script ${RELAY_MARKER}>(function(){
  function reportLoc(){
    try {
      (window.parent || window).postMessage({
        type: 'od:url-load-loc',
        pathname: location.pathname,
        search: location.search,
        hash: location.hash
      }, '*');
    } catch (_) {}
  }
  reportLoc();
  window.addEventListener('hashchange', reportLoc);
  ['pushState', 'replaceState'].forEach(function(method){
    var original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function(){
      var result = original.apply(this, arguments);
      reportLoc();
      return result;
    };
  });
  // Plain <a href> click triggers a full navigation; relative URLs drop the
  // base's ?preview=1, so the destination raw response goes through the
  // byte-accurate branch with no relay injected and the host stops receiving
  // od:url-load-loc. Re-stamp preview=1 on same-origin navigations so the
  // next page keeps the relay.
  document.addEventListener('click', function(e){
    var link = e.target && e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== '' && link.target !== '_self') return;
    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    if (url.searchParams.get('preview') === '1') return;
    e.preventDefault();
    url.searchParams.set('preview', '1');
    try { location.assign(url.toString()); } catch (_) {}
  }, true);
})();</script>`;

export function injectPrototypeLocationRelay(html: string): string {
  if (html.includes(RELAY_MARKER)) return html;
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${LOCATION_RELAY_SCRIPT}</head>`);
  }
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${LOCATION_RELAY_SCRIPT}</body>`);
  }
  return `${html}${LOCATION_RELAY_SCRIPT}`;
}
