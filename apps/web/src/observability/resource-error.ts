// Resource-loading error observer.
//
// The bubbling `error` event (registered with capture=false) catches
// thrown JS errors but NOT failed resource loads — `<script>`, `<link>`,
// `<img>`, etc. emit an `error` event that does not propagate. To pick
// those up we register a *capturing* listener on `window`. This is the
// canonical browser pattern for chunk-load failures, which we very much
// want to know about: a missing `_next/static/chunks/xxx.js` results in
// a non-functional app with no JS exception.
//
// Each event includes the failed tag + its URL. The URL is left alone
// here — the runtime-side scrub pipeline does not redact static-asset
// URLs, but since these are our own host-served chunks they don't leak
// anything sensitive.

import { reportSafetyEvent } from '../analytics/error-tracking';

const RESOURCE_TAGS = new Set([
  'SCRIPT',
  'LINK',
  'IMG',
  'IFRAME',
  'AUDIO',
  'VIDEO',
  'SOURCE',
  'TRACK',
]);

let installed = false;

export function installResourceErrorObserver(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined') return () => undefined;
  installed = true;

  const listener = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!RESOURCE_TAGS.has(target.tagName)) return;
    const src = readSrc(target);
    if (src == null) return;
    reportSafetyEvent('client_resource_error', {
      tag: target.tagName.toLowerCase(),
      // crossorigin / async / defer are useful signals for diagnosing
      // chunk-load problems that depend on CDN cache + SW interaction.
      async_attr: target.getAttribute('async') != null ? true : false,
      defer_attr: target.getAttribute('defer') != null ? true : false,
      crossorigin: target.getAttribute('crossorigin'),
      url: src,
    });
  };

  // capture=true is required — resource error events do not bubble.
  window.addEventListener('error', listener, /*useCapture=*/ true);

  return () => {
    window.removeEventListener('error', listener, /*useCapture=*/ true);
    installed = false;
  };
}

function readSrc(el: Element): string | null {
  // <link> uses href; everything else uses src.
  const value =
    el instanceof HTMLLinkElement ? el.href :
    el instanceof HTMLScriptElement ? el.src :
    el instanceof HTMLImageElement ? el.src :
    el instanceof HTMLIFrameElement ? el.src :
    el instanceof HTMLSourceElement ? el.src :
    el instanceof HTMLTrackElement ? el.src :
    el instanceof HTMLMediaElement ? el.src :
    el.getAttribute('src') ?? el.getAttribute('href');
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}
