// Browser-side bridge for the markdown viewer's shiki re-highlight trigger:
// notifies on an OS/app theme change so cached-highlighted HTML can be
// invalidated. Lives in providers/ because it touches `document.documentElement`
// and `window.matchMedia`; the slice hook reaches it through `ThemeWatchPort`
// so it stays DOM-free and unit-testable.
export function subscribeThemeChange(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const root = document.documentElement;
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}
