/**
 * Closing the main window on Windows used to quit Open Design and interrupt
 * running tasks (OPEND-4390). Windows now behaves like chat apps that live in
 * the notification area: closing the window always hides it, and the app
 * keeps running behind a tray icon. The icon is the way back (click / "Open")
 * and the way out ("Quit", which still asks before interrupting tasks).
 *
 * The icon is present for the whole session once the main window has been
 * shown, so Quit is reachable whether or not the window is visible. Linux
 * keeps the close confirmation dialog because tray support varies by desktop
 * environment; macOS already hides on close and is untouched.
 */

/**
 * Windows close button, Alt+F4 and taskbar close all arrive as `close`.
 * Every one of them hides to the tray; only the app's own shutdown path
 * (`isStopped`) lets the window actually close.
 */
export function attachWindowsCloseToTray(
  window: { on(event: "close", listener: (event: { preventDefault: () => void }) => void): unknown },
  options: { isStopped: () => boolean; hideToTray: () => void },
): void {
  window.on("close", (event) => {
    if (options.isStopped()) return;
    event.preventDefault();
    options.hideToTray();
  });
}

export interface BackgroundTrayLabels {
  open: string;
  quit: string;
  balloonTitle: string;
  balloonContent: string;
}

// The main process has no i18n layer; like the close prompt, the OS locale
// picks Chinese or English.
export function backgroundTrayLabels(productName: string, locale: string): BackgroundTrayLabels {
  if (locale.trim().toLowerCase().startsWith("zh")) {
    return {
      open: `打开 ${productName}`,
      quit: "退出",
      balloonTitle: `${productName} 仍在后台运行`,
      balloonContent: "点击托盘图标可重新打开窗口，右键选择「退出」可完全退出。",
    };
  }
  return {
    open: `Open ${productName}`,
    quit: "Quit",
    balloonTitle: `${productName} is still running`,
    balloonContent: "Click the tray icon to reopen the window, or right-click it and choose Quit to exit.",
  };
}

export interface BackgroundTrayMenuItem {
  label: string;
  click: () => void;
}

/** Structural slice of Electron's `Tray`, so the lifecycle is unit-testable. */
export interface BackgroundTraySurface {
  setToolTip(text: string): void;
  setContextMenu(items: BackgroundTrayMenuItem[]): void;
  onClick(listener: () => void): void;
  displayBalloon(options: { title: string; content: string }): void;
  destroy(): void;
  isDestroyed(): boolean;
}

export interface BackgroundTray {
  /** Show the tray icon; idempotent. Call once the main window is revealed. */
  install(): void;
  /** The close-button path: hide the window, keep the app and its tasks. */
  hideToTray(): void;
  dispose(): void;
}

export function createBackgroundTray(deps: {
  createTray: () => BackgroundTraySurface;
  window: { hide: () => void; show: () => void };
  productName: string;
  locale: () => string;
  /** Resolves true to quit; asks first when tasks are still running. */
  confirmQuit: () => Promise<boolean>;
  requestQuit: () => void;
}): BackgroundTray {
  // Held for the tray's whole life: a Tray that is garbage-collected drops
  // its icon and stops delivering clicks.
  let tray: BackgroundTraySurface | null = null;
  let noticeShown = false;
  let quitting = false;
  let disposed = false;

  const quit = () => {
    if (quitting) return;
    quitting = true;
    void deps.confirmQuit()
      .catch(() => true)
      .then((proceed) => {
        quitting = false;
        if (proceed) deps.requestQuit();
      });
  };

  const install = (): BackgroundTraySurface | null => {
    if (disposed) return null;
    if (tray != null && !tray.isDestroyed()) return tray;
    const labels = backgroundTrayLabels(deps.productName, deps.locale());
    tray = deps.createTray();
    tray.setToolTip(deps.productName);
    tray.setContextMenu([
      { label: labels.open, click: () => deps.window.show() },
      { label: labels.quit, click: quit },
    ]);
    tray.onClick(() => deps.window.show());
    return tray;
  };

  return {
    install() {
      install();
    },
    hideToTray() {
      const icon = install();
      deps.window.hide();
      if (icon != null && !noticeShown) {
        noticeShown = true;
        const labels = backgroundTrayLabels(deps.productName, deps.locale());
        icon.displayBalloon({ title: labels.balloonTitle, content: labels.balloonContent });
      }
    },
    dispose() {
      disposed = true;
      if (tray != null && !tray.isDestroyed()) tray.destroy();
      tray = null;
    },
  };
}
