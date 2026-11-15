import { useEffect, useMemo, useState } from 'react';
import { findRealTagEnd, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { buildSrcdoc } from '../runtime/srcdoc';

export function useHostResolvedPreview(url: string | null | undefined): string | undefined {
  const request = useMemo(() => ({ url }), [url]);
  const [document, setDocument] = useState<{ request: typeof request; html: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          cache: 'no-store',
          ...(/^\/api\/design-systems\//.test(url) ? { headers: { 'x-od-design-system-preview': '1' } } : {}),
        });
        if (!response.ok || !/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return;
        const responseUrl = response.url || new URL(url, window.location.href).href;
        const location = response.headers.get('content-location');
        const baseHref = location ? new URL(location, responseUrl).href : responseUrl;
        let html = buildSrcdoc(await response.text(), { baseHref });
        const policy = response.headers.get('content-security-policy');
        if (policy) {
          const tags = policy.split(',').map((value) => `<meta http-equiv="Content-Security-Policy" content="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`).join('');
          const headEnd = findRealTagEnd(html, HTML_TAG_PATTERNS.headOpen);
          html = headEnd < 0 ? tags + html : html.slice(0, headEnd) + tags + html.slice(headEnd);
        }
        if (!controller.signal.aborted) setDocument({ request, html });
      } catch {}
    })();
    return () => controller.abort();
  }, [request, url]);
  return document?.request === request ? document.html : undefined;
}
