import { useEffect, useRef, useState } from 'react';

const heightMessage = 'od:design-kit-content-height';

/** Keep preview scripts isolated while reporting their intrinsic document size. */
export function ContentHeightFrame({ src, title, className }: {
  src: string;
  title: string;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [document, setDocument] = useState<string>();
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const controller = new AbortController();
    setDocument(undefined);
    setHeight(undefined);
    void fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const html = await response.text();
        if (controller.signal.aborted) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const base = doc.createElement('base');
        base.href = new URL(src, window.location.href).href;
        doc.head.prepend(base);
        const style = doc.createElement('style');
        style.textContent = 'html, body { height: auto !important; min-height: 0 !important; }';
        doc.head.append(style);
        const script = doc.createElement('script');
        script.textContent = `(() => {
          let pending = false;
          let previous = 0;
          const measure = () => {
            pending = false;
            const body = document.body;
            const rect = body.getBoundingClientRect();
            const css = getComputedStyle(body);
            const height = Math.ceil(Math.max(body.scrollHeight, rect.height)
              + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0));
            if (height > 0 && height !== previous) {
              previous = height;
              parent.postMessage({ type: '${heightMessage}', height }, '*');
            }
          };
          const schedule = () => {
            if (!pending) { pending = true; requestAnimationFrame(measure); }
          };
          new ResizeObserver(schedule).observe(document.body);
          new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
          window.addEventListener('resize', schedule);
          window.addEventListener('load', schedule);
          document.addEventListener('load', schedule, true);
          document.fonts.ready.then(schedule);
          schedule();
        })();`;
        doc.body.append(script);
        setDocument('<!doctype html>' + doc.documentElement.outerHTML);
      })
      .catch(() => { /* Keep the original URL preview when fetching is unavailable. */ });
    return () => controller.abort();
  }, [src]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== heightMessage) return;
      const next = event.data.height;
      if (typeof next === 'number' && Number.isFinite(next) && next > 0) setHeight(Math.ceil(next));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  return <iframe ref={frame} src={src} srcDoc={document} title={title}
    className={className} style={height ? { height } : undefined}
    loading="lazy" sandbox="allow-scripts allow-popups" />;
}
