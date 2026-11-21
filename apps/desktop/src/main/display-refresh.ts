import type { OpenDesignHostDisplayRefresh } from "@open-design/host";

type EventSource = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
};
type Bounds = { x: number; y: number; width: number; height: number };
type ScaleCheckPhase = "initial" | "after-refresh" | "after-reshow";

type ScaleCheck = {
  reason: string;
  phase: ScaleCheckPhase;
  timer?: ReturnType<typeof setTimeout>;
  readDeadline?: ReturnType<typeof setTimeout>;
  retriedRead?: boolean;
};

type ScaleObservation = {
  reason: string;
  phase: ScaleCheckPhase;
  nativeScale: number;
  rendererScale: number | null;
  outcome: "ok" | "refresh" | "reshow" | "reshow-throttled" | "still-low" | "unavailable";
};
export type DisplayRefreshWindow = EventSource & {
  webContents?: EventSource;
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  isMaximized(): boolean;
  getBounds(): Bounds;
  setBounds(bounds: Bounds, animate: boolean): void;
  setVibrancy(value: "under-window" | null): void;
  invalidateShadow(): void;
  isFocused(): boolean;
  hide(): void;
  show(): void;
  showInactive(): void;
};

/** How long the renderer gets to pick up a new scale before it is compared. */
const SCALE_SETTLE_MS = 1000;
const SCALE_READ_TIMEOUT_MS = 1000;
/** A window is re-shown at most this often, so a cure that does not work cannot flicker in a loop. */
const RESHOW_INTERVAL_MS = 10 * 60_000;
/** Focus re-checks the scale at most this often. */
const FOCUS_CHECK_INTERVAL_MS = 60_000;

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
 *
 * The scale guard checks first reveal, renderer loads, window
 * restores and existing display/focus triggers. Each recovery step is followed
 * by a fresh measurement. Checks deferred by window state or gestures resume
 * on the next eligible event.
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
  /** Renderer device pixel ratio divided by page zoom, i.e. the display scale it draws at. */
  readRendererScale?(window: DisplayRefreshWindow): Promise<number>;
  observeScale?(observation: ScaleObservation): void;
  now?(): number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}): () => void {
  if (input.platform !== "darwin") return () => {};
  const readScale = input.readRendererScale;
  const later = input.setTimeout ?? setTimeout;
  const cancel = input.clearTimeout ?? clearTimeout;
  const listeners: (() => void)[] = [];
  const busy = new Set<DisplayRefreshWindow>();
  const attachedSheets = new Set<DisplayRefreshWindow>();
  const moveTimers = new Map<DisplayRefreshWindow, ReturnType<typeof setTimeout>>();
  const restores = new Map<DisplayRefreshWindow, {
    restore(): void;
    reasons: string[];
    recovery: ScaleCheck | undefined;
  }>();
  // Reasons that arrived during a gesture; dragging across displays is the
  // common way to change scale, so they run once the gesture settles.
  const deferred = new Map<DisplayRefreshWindow, Set<string>>();
  const reasons = new Set<string>();
  const now = input.now ?? Date.now;
  const checks = new Map<DisplayRefreshWindow, ScaleCheck>();
  const reshownAt = new Map<DisplayRefreshWindow, number>();
  const focusCheckedAt = new Map<DisplayRefreshWindow, number>();
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
      flushWindowWork(window);
    };
    const settle = (ms: number) => {
      const previous = moveTimers.get(window);
      if (previous !== undefined) cancel(previous);
      moveTimers.set(window, later(idle, ms));
    };
    const start = () => {
      pauseCheck(window);
      const active = restores.get(window);
      active?.restore();
      busy.add(window);
      if (active?.recovery && checks.get(window) === active.recovery) {
        deferRefresh(window, active.reasons);
      }
      settle(1000);
    };
    listen(window, "will-move", start);
    listen(window, "will-resize", start);
    // On macOS `moved` aliases `move`, so it fires throughout a drag.
    listen(window, "moved", () => {
      if (busy.has(window)) settle(500);
    });
    listen(window, "resized", idle);
    // Electron closes the native modal sheet when its parent window is hidden.
    listen(window, "sheet-begin", () => {
      attachedSheets.add(window);
      pauseCheck(window);
    });
    listen(window, "sheet-end", () => {
      attachedSheets.delete(window);
      flushWindowWork(window);
    });
    listen(window, "closed", () => {
      restores.get(window)?.restore();
      const pending = moveTimers.get(window);
      if (pending !== undefined) cancel(pending);
      moveTimers.delete(window);
      busy.delete(window);
      attachedSheets.delete(window);
      deferred.delete(window);
      focusCheckedAt.delete(window);
      reshownAt.delete(window);
      cancelCheck(window);
    });
    for (const event of ["hide", "minimize", "enter-full-screen"]) {
      listen(window, event, () => pauseCheck(window));
    }
    for (const event of ["show", "restore", "leave-full-screen"]) {
      listen(window, event, () => {
        pauseCheck(window);
        requestScaleCheck(window, event);
      });
    }
    const renderer = window.webContents;
    if (renderer) {
      listen(renderer, "did-finish-load", () => {
        cancelCheck(window);
        requestScaleCheck(window, "renderer-load");
      });
    }
    // The blur can outlive every display and wake event, so looking at the
    // window again is also a moment to check it.
    listen(window, "focus", () => {
      const last = focusCheckedAt.get(window);
      if (last !== undefined && now() - last < FOCUS_CHECK_INTERVAL_MS) return;
      focusCheckedAt.set(window, now());
      requestScaleCheck(window, "focus");
    });
  }
  const unusable = (window: DisplayRefreshWindow) => window.isDestroyed() || !window.isVisible()
    || window.isMinimized() || window.isFullScreen();
  const report = (window: DisplayRefreshWindow, refreshReasons: string[]) => input.notify(window, {
    reasons: refreshReasons,
    scaleFactor: input.screen.getDisplayMatching(window.getBounds()).scaleFactor,
    displayCount: input.screen.getAllDisplays().length,
  });
  function pauseCheck(window: DisplayRefreshWindow) {
    const check = checks.get(window);
    if (!check) return;
    if (check.timer !== undefined) cancel(check.timer);
    if (check.readDeadline !== undefined) cancel(check.readDeadline);
    check.timer = undefined;
    check.readDeadline = undefined;
  }
  function cancelCheck(window: DisplayRefreshWindow) {
    pauseCheck(window);
    checks.delete(window);
    const pending = deferred.get(window);
    if (pending?.delete("scale-recheck") && pending.size === 0) deferred.delete(window);
  }
  const blocked = (window: DisplayRefreshWindow) =>
    busy.has(window) || restores.has(window) || attachedSheets.has(window);
  const canCheck = (window: DisplayRefreshWindow) => !disposed && !unusable(window) && !blocked(window);

  function requestScaleCheck(window: DisplayRefreshWindow, reason: string) {
    if (disposed || window.isDestroyed()) return;
    if (readScale && !checks.has(window)) checks.set(window, { reason, phase: "initial" });
    flushWindowWork(window);
  }

  function deferRefresh(window: DisplayRefreshWindow, refreshReasons: string[]) {
    const pending = deferred.get(window) ?? new Set<string>();
    for (const reason of refreshReasons) pending.add(reason);
    deferred.set(window, pending);
  }

  function flushWindowWork(window: DisplayRefreshWindow) {
    if (!canCheck(window)) return;
    const pending = deferred.get(window);
    if (pending) {
      deferred.delete(window);
      refresh(window, [...pending]);
    } else {
      resumeScaleCheck(window);
    }
  }

  function resumeScaleCheck(window: DisplayRefreshWindow) {
    const check = checks.get(window);
    if (!readScale || !check || check.timer !== undefined || check.readDeadline !== undefined || !canCheck(window)) return;
    check.timer = later(() => {
      check.timer = undefined;
      if (!canCheck(window)) return;
      const finish = (value: number) => {
        if (check.readDeadline !== deadline) return;
        cancel(deadline);
        check.readDeadline = undefined;
        if (!canCheck(window)) return;
        const rendered = Number.isFinite(value) && value > 0 ? value : null;
        handleScaleSample(window, check, rendered);
      };
      const deadline = later(() => finish(NaN), SCALE_READ_TIMEOUT_MS);
      check.readDeadline = deadline;
      try {
        void readScale(window).then(finish, () => finish(NaN));
      } catch {
        finish(NaN);
      }
    }, SCALE_SETTLE_MS);
  }

  function handleScaleSample(window: DisplayRefreshWindow, check: ScaleCheck, rendered: number | null) {
    const nativeScale = input.screen.getDisplayMatching(window.getBounds()).scaleFactor;
    const observe = (outcome: ScaleObservation["outcome"]) => input.observeScale?.({
      reason: check.reason,
      phase: check.phase,
      nativeScale,
      rendererScale: rendered,
      outcome,
    });
    if (rendered === null && !check.retriedRead) {
      check.retriedRead = true;
      resumeScaleCheck(window);
      return;
    }
    check.retriedRead = false;
    const belowDisplay = rendered !== null && nativeScale - rendered > 0.01;
    if (belowDisplay && check.phase === "initial") {
      observe("refresh");
      refresh(window, ["scale-recheck"]);
      return;
    }
    if (belowDisplay && check.phase === "after-refresh") {
      const last = reshownAt.get(window);
      if (last === undefined || now() - last >= RESHOW_INTERVAL_MS) {
        observe("reshow");
        check.phase = "after-reshow";
        reshownAt.set(window, now());
        const focused = window.isFocused();
        window.hide();
        if (focused) window.show();
        else window.showInactive();
        resumeScaleCheck(window);
        return;
      }
      observe("reshow-throttled");
    } else {
      observe(rendered === null ? "unavailable" : belowDisplay ? "still-low" : "ok");
    }
    checks.delete(window);
    if (check.phase === "after-reshow") report(window, ["scale-reshow"]);
  }
  function refresh(
    window: DisplayRefreshWindow,
    refreshReasons: string[],
  ) {
    if (blocked(window)) {
      deferRefresh(window, refreshReasons);
      return;
    }
    if (unusable(window)) return;
    pauseCheck(window);
    const recovery = refreshReasons.includes("scale-recheck") ? checks.get(window) : undefined;
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
    restores.set(window, { restore, reasons: refreshReasons, recovery });
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
        if (recovery && checks.get(window) === recovery) recovery.phase = "after-refresh";
        report(window, refreshReasons);
        requestScaleCheck(window, refreshReasons.join(","));
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
    for (const { restore } of restores.values()) restore();
    for (const window of checks.keys()) cancelCheck(window);
    busy.clear();
    attachedSheets.clear();
    deferred.clear();
  };
}
