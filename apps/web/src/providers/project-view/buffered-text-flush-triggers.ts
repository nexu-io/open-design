// Browser-side bridge for the buffered-text-updates flush triggers: a
// backgrounded tab's `visibilitychange` (flush so a hidden tab doesn't fall
// behind) and `pagehide` (flush + a synchronous keepalive persist so the last
// buffered chunk survives a reload mid-stream). SSR-guarded so the
// project-view slice's streaming-text-buffer stays DOM-free (ADR 0002).

export interface BufferedTextFlushHandlers {
  onHiddenFlush: () => void;
  onPageHideFlush: () => void;
}

/** Subscribe to the flush triggers; returns an unsubscribe that tears the
 * listeners down. */
export function subscribeBufferedTextFlushTriggers(
  handlers: BufferedTextFlushHandlers,
): () => void {
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      handlers.onHiddenFlush();
    }
  };

  const onPageHide = () => {
    handlers.onPageHideFlush();
  };

  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (hasWindow) {
    window.addEventListener('pagehide', onPageHide);
  }

  return () => {
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (hasWindow) {
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}
