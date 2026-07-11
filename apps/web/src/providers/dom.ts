// Generic browser-confirm bridge. Lives in providers/ because it touches
// `window`; a slice reaches it through an injected port so its hooks stay
// DOM-free and unit-testable with a fake (see Phase 8 escape hatch #2 in
// dev-skills/fixing-open-design-web/SKILL.md).
export function confirmDialog(message: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

/**
 * Subscribe to the page-teardown signals (`pagehide` + `beforeunload`) a slice
 * needs to flush pending work before the browser tears the page down. Returns
 * an unsubscribe that tears both listeners down.
 */
export function subscribePageUnload(onUnload: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('pagehide', onUnload);
  window.addEventListener('beforeunload', onUnload);
  return () => {
    window.removeEventListener('pagehide', onUnload);
    window.removeEventListener('beforeunload', onUnload);
  };
}
