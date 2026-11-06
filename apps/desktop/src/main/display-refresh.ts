import type { OpenDesignHostDisplayRefresh } from "@open-design/host";

type EventSource = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
};
type Bounds = { x: number; y: number; width: number; height: number };
export type DisplayRefreshWindow = EventSource & {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  isMaximized(): boolean;
  getBounds(): Bounds;
  setBounds(bounds: Bounds, animate: boolean): void;
  setVibrancy(value: "under-window" | null): void;
  invalidateShadow(): void;
};

/**
 * A one-DIP width pulse asks Chromium to allocate its drawing surface at the
 * current display scale; cycling vibrancy rebuilds the native glass material.
 * Restore after one frame interval (main has no requestAnimationFrame), then
 * invalidate the shadow. This is a preventive refresh, not proof of GPU recovery.
 * Maximized windows only cycle material so their zoom state is preserved.
 * The restore only writes bounds the pulse still owns: a maximize, fullscreen
 * or other resize that lands during the frame interval keeps its bounds.
 * Refreshes requested during a user gesture wait until it settles; a gesture
 * starting during the pulse restores it synchronously before macOS applies the
 * user's bounds. Only pass application
 * windows created with MAC_WINDOW_CHROME, never invisible capture windows.
 */
export function attachDisplayRefresh(input: {
  platform: string;
  screen: EventSource & {
    getDisplayMatching(bounds: Bounds): { scaleFactor: number };
    getAllDisplays(): unknown[];
  };
  powerMonitor: EventSource;
  getWindows(): DisplayRefreshWindow[];
  notify(window: DisplayRefreshWindow, refresh: OpenDesignHostDisplayRefresh): void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}): () => void {
  if (input.platform !== "darwin") return () => {};
  const later = input.setTimeout ?? setTimeout;
  const cancel = input.clearTimeout ?? clearTimeout;
  const listeners: (() => void)[] = [];
  const busy = new Set<DisplayRefreshWindow>();
  const moveTimers = new Map<DisplayRefreshWindow, ReturnType<typeof setTimeout>>();
  const restores = new Map<DisplayRefreshWindow, () => void>();
  // Reasons that arrived during a gesture; dragging across displays is the
  // common way to change scale, so they run once the gesture settles.
  const deferred = new Map<DisplayRefreshWindow, Set<string>>();
  const reasons = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const listen = (source: EventSource, event: string, listener: (...args: any[]) => void) => {
    source.on(event, listener);
    listeners.push(() => source.removeListener(event, listener));
  };
  for (const window of input.getWindows()) {
    // Clear busy after `ms` without gesture events. A click on the title bar
    // emits `will-move` with no `moved`, so the gesture start arms a fallback.
    const idle = () => {
      const previous = moveTimers.get(window);
      if (previous !== undefined) cancel(previous);
      moveTimers.delete(window);
      busy.delete(window);
      const pending = deferred.get(window);
      deferred.delete(window);
      if (pending && !disposed) refresh(window, [...pending]);
    };
    const settle = (ms: number) => {
      const previous = moveTimers.get(window);
      if (previous !== undefined) cancel(previous);
      moveTimers.set(window, later(idle, ms));
    };
    const start = () => {
      restores.get(window)?.();
      busy.add(window);
      settle(1000);
    };
    listen(window, "will-move", start);
    listen(window, "will-resize", start);
    // On macOS `moved` aliases `move`, so it fires throughout a drag.
    listen(window, "moved", () => {
      if (busy.has(window)) settle(500);
    });
    listen(window, "resized", idle);
    listen(window, "closed", () => {
      restores.get(window)?.();
      busy.delete(window);
      deferred.delete(window);
    });
  }
  function refresh(window: DisplayRefreshWindow, refreshReasons: string[]) {
    if (busy.has(window)) {
      const pending = deferred.get(window) ?? new Set<string>();
      for (const reason of refreshReasons) pending.add(reason);
      deferred.set(window, pending);
      return;
    }
    if (window.isDestroyed() || !window.isVisible() || window.isMinimized()
      || window.isFullScreen()) return;
    const bounds = window.getBounds();
    const pulse = !window.isMaximized();
    let pulsed: Bounds | undefined;
    let frame: ReturnType<typeof setTimeout> | undefined;
    const owned = () => {
      if (!pulsed || window.isMaximized() || window.isFullScreen()) return false;
      const current = window.getBounds();
      return current.x === pulsed.x && current.y === pulsed.y
        && current.width === pulsed.width && current.height === pulsed.height;
    };
    const restore = () => {
      if (frame !== undefined) cancel(frame);
      restores.delete(window);
      if (window.isDestroyed()) return;
      try {
        if (owned()) window.setBounds(bounds, false);
      } finally {
        if (!window.isDestroyed()) window.setVibrancy("under-window");
      }
    };
    restores.set(window, restore);
    try {
      window.setVibrancy(null);
      if (pulse) {
        window.setBounds({ ...bounds, width: bounds.width + 1 }, false);
        // Compare against what macOS applied, which may be constrained.
        pulsed = window.getBounds();
      }
      frame = later(() => {
        restore();
        if (disposed || window.isDestroyed()) return;
        window.invalidateShadow();
        input.notify(window, {
          reasons: refreshReasons,
          scaleFactor: input.screen.getDisplayMatching(window.getBounds()).scaleFactor,
          displayCount: input.screen.getAllDisplays().length,
        });
      }, 16);
    } catch (error) {
      restore();
      throw error;
    }
  }
  const schedule = (reason: string) => {
    if (disposed) return;
    reasons.add(reason);
    if (timer !== undefined) cancel(timer);
    timer = later(() => {
      timer = undefined;
      const refreshReasons = [...reasons];
      reasons.clear();
      for (const window of input.getWindows()) refresh(window, refreshReasons);
    }, 500);
  };
  for (const event of ["display-added", "display-removed"]) {
    listen(input.screen, event, () => schedule(event));
  }
  listen(input.screen, "display-metrics-changed", (_event, _display, changedMetrics: string[]) => {
    if (changedMetrics.includes("scaleFactor")) schedule("display-metrics-changed");
  });
  for (const event of ["resume", "unlock-screen"]) {
    listen(input.powerMonitor, event, () => schedule(event));
  }
  return () => {
    disposed = true;
    if (timer !== undefined) cancel(timer);
    for (const remove of listeners) remove();
    for (const pending of moveTimers.values()) cancel(pending);
    moveTimers.clear();
    for (const restore of restores.values()) restore();
    busy.clear();
    deferred.clear();
  };
}
