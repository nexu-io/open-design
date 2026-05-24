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
