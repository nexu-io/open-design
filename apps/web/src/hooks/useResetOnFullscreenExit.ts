import { useEffect } from 'react';

/**
 * Subscribe to the document's `fullscreenchange` event and call `reset`
 * whenever the browser leaves fullscreen (`document.fullscreenElement`
 * becomes null).
 *
 * Used by viewers that combine in-app present-mode state (e.g. a React
 * `inTabPresent` flag) with the browser's native fullscreen API. When
 * the user exits fullscreen via Esc, the OS menu, the macOS window
 * close button, or any other path outside React's event surface, the
 * in-app state would otherwise stay stuck — leaving a present-mode
 * overlay rendered over a non-fullscreen viewer. Mirrors the same
 * Esc-keeps-React-in-sync trick PreviewModal added in #168, and is the
 * "FileViewer fullscreenchange sync" piece of the #1215 fix.
 *
 * The hook is a no-op when `document` is unavailable (SSR-safe) and
 * automatically cleans up the listener on unmount.
 */
export function useResetOnFullscreenExit(reset: () => void): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      if (!document.fullscreenElement) reset();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [reset]);
}
