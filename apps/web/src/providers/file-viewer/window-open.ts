// Browser-side bridge opening a URL in a new tab. Lives in providers/ because
// it touches `window`; slice hooks reach it through an injected port so they
// stay DOM-free and unit-testable.
export function openInNewTab(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
