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

/**
 * Block a stray file drop from navigating the whole app away from the
 * workspace. Only file drags outside an allowed drop target (the design
 * files panel, the chat composer) are suppressed; drops inside those
 * targets are left alone so their own drop handlers still fire.
 */
export function subscribeWindowFileDropGuard(): () => void {
  if (typeof window === 'undefined') return () => {};
  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const isAllowedDropTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('.df-panel, .composer'));
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
    e.preventDefault();
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDrop);
  };
}

/**
 * Subscribe a `wheel` listener on a specific element (not `window`), so a
 * slice hook can react to wheel gestures over a scrollable strip (e.g. the
 * workspace tab bar) without touching a bare DOM global itself.
 */
export function subscribeTabBarWheelScroll(
  tabBar: HTMLElement,
  onWheel: (event: WheelEvent) => void,
): () => void {
  tabBar.addEventListener('wheel', onWheel, { passive: false });
  return () => tabBar.removeEventListener('wheel', onWheel);
}

/**
 * Scroll `tabBar` so its `.ws-tab.active` child is fully visible, accounting
 * for the sticky Design Files tab pinned to the scrollport's left edge (its
 * real width, not a hardcoded offset).
 */
export function scrollActiveTabIntoView(tabBar: HTMLElement): void {
  const el = tabBar.querySelector<HTMLElement>('.ws-tab.active');
  if (!el) return;
  const tabRect = el.getBoundingClientRect();
  const barRect = tabBar.getBoundingClientRect();
  const stickyEl = tabBar.querySelector<HTMLElement>('.ws-tab.design-files-tab');
  const stickyWidth = stickyEl ? stickyEl.getBoundingClientRect().width : 0;
  const visibleLeft = barRect.left + stickyWidth;
  const visibleRight = barRect.right;
  if (tabRect.left < visibleLeft) {
    tabBar.scrollLeft += tabRect.left - visibleLeft;
  } else if (tabRect.right > visibleRight) {
    tabBar.scrollLeft += tabRect.right - visibleRight;
  }
}

/**
 * Batch `tabBar` overflow/width remeasurement behind a `requestAnimationFrame`
 * and re-trigger it on element resize (`ResizeObserver`, when available) and
 * window resize. Calls `onMeasure` once immediately and again on every
 * subsequent trigger; the caller does the actual DOM reads/writes so this
 * bridge stays a pure scheduling primitive.
 */
export function subscribeTabBarOverflowMeasure(
  tabBar: HTMLElement,
  onMeasure: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  let frame = 0;
  const requestMeasure = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      onMeasure();
    });
  };
  requestMeasure();
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestMeasure);
  if (resizeObserver) {
    resizeObserver.observe(tabBar);
    Array.from(tabBar.children).forEach((child) => resizeObserver.observe(child));
  }
  window.addEventListener('resize', requestMeasure);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', requestMeasure);
  };
}
