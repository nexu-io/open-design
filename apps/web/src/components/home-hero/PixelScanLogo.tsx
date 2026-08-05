import { useEffect, useRef } from 'react';
import { PixelScanField, drawStaticLogo } from './pixel-scan/engine';

interface Props {
  className?: string;
  /** Accessible label for the wordmark (the canvas itself is decorative). */
  label?: string;
}

// Mounts the pixel-scan shader wordmark onto a sized, position:relative host.
// `three` is lazy-imported so the WebGL runtime stays out of the main bundle;
// reduced motion (or a failed import / missing WebGL) falls back to the same
// word drawn statically. A ResizeObserver keeps the canvas in sync as the hero
// column reflows. The engine listens on the HOST (the canvas itself is
// pointer-events:none via .home-hero__logo--tiles > canvas).
export function PixelScanLogo({ className, label = 'Open Design' }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      drawStaticLogo(canvas, host);
      return undefined;
    }

    let disposed = false;
    let field: PixelScanField | null = null;
    let ro: ResizeObserver | null = null;
    let frame = 0;

    void import('three')
      .then((THREE) => {
        if (disposed) return;
        field = new PixelScanField(host, canvas, THREE);
        field.start();
        ro = new ResizeObserver(() => {
          // Coalesce bursts of resize notifications into one re-measure per frame.
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            frame = 0;
            field?.resize();
          });
        });
        ro.observe(host);
      })
      .catch((err: unknown) => {
        // Surface the underlying failure — the static fallback must not mask it.
        console.error('[pixel-scan] falling back to static logo:', err);
        if (!disposed) drawStaticLogo(canvas, host);
      });

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      field?.destroy();
    };
  }, []);

  return (
    <div ref={hostRef} className={className} role="img" aria-label={label}>
      <canvas ref={canvasRef} />
    </div>
  );
}
