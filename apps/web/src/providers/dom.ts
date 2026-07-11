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

/**
 * Subscribe a capture-phase `keydown` listener. Capture phase lets a slice's
 * shortcut handling beat the host browser/Electron shell's own top-level
 * shortcut (e.g. Cmd+T/W) before it acts on the event.
 */
export function subscribeCaptureKeyDown(onKeyDown: (event: KeyboardEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}

/**
 * Toggle a class on `document.body` and return a cleanup that removes it.
 * Mirrors the shape of a `useEffect` body + its cleanup so a slice hook can
 * call this directly from an effect without touching `document` itself.
 */
export function toggleDocumentBodyClass(className: string, active: boolean): () => void {
  if (typeof document === 'undefined') return () => {};
  document.body.classList.toggle(className, active);
  return () => {
    document.body.classList.remove(className);
  };
}
