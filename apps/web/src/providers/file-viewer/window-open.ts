// Browser-side bridge opening a URL in a new tab. Lives in providers/ because
// it touches `window`; slice hooks reach it through an injected port so they
// stay DOM-free and unit-testable.
export function openInNewTab(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Resolves a relative share path to an absolute URL against the current origin. */
export function getLocationOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
