/**
 * Closing the main window on Windows/Linux used to quit Open Design and
 * interrupt running tasks (OPEND-4390). On Windows the window now hides to a
 * notification-area icon while tasks are running, so they keep going; Linux
 * keeps the confirmation dialog because tray support varies by desktop
 * environment.
 *
 * The icon is transient: it exists only while the window is hidden, and goes
 * away once the window is shown again. The notification area is meant for
 * temporary status, and a permanent icon would need an opt-in setting.
 */

export type NonDarwinCloseAction = "close" | "confirm" | "hide-to-tray";

/**
 * What closing the main window should do. Only a confirmed running task
 * changes anything: when the count is unknown (daemon unreachable) the close
 * goes ahead, so the user is never left with an app they cannot quit.
 */
export function nonDarwinCloseAction(
  platform: NodeJS.Platform,
  safety: { state: "clear" | "blocked" | "unknown"; activeRunCount: number | null },
): NonDarwinCloseAction {
  if (safety.state !== "blocked") return "close";
  return platform === "win32" ? "hide-to-tray" : "confirm";
}

export interface BackgroundTrayLabels {
  open: string;
  quit: string;
  balloonTitle: string;
  balloonContent: string;
}

// The main process has no i18n layer; like the close prompt, the OS locale
// picks Chinese or English.
export function backgroundTrayLabels(productName: string, activeRunCount: number, locale: string): BackgroundTrayLabels {
  if (locale.trim().toLowerCase().startsWith("zh")) {
    return {
      open: `打开 ${productName}`,
      quit: "退出",
      balloonTitle: `${productName} 仍在后台运行`,
      balloonContent: `${activeRunCount} 个任务会继续运行。点击此处的图标可重新打开窗口。`,
    };
  }
  return {
    open: `Open ${productName}`,
    quit: "Quit",
    balloonTitle: `${productName} is still running`,
    balloonContent: `${activeRunCount} task${activeRunCount === 1 ? " keeps" : "s keep"} running. Click this icon to reopen the window.`,
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
  /** Hide the window and show the icon; `activeRunCount` feeds the notice. */
  hideToTray(activeRunCount: number): void;
  /** Call from the window's `show` event: the icon is no longer needed. */
  windowShown(): void;
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

  const removeIcon = () => {
    if (tray != null && !tray.isDestroyed()) tray.destroy();
    tray = null;
  };

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

  return {
    hideToTray(activeRunCount) {
      const labels = backgroundTrayLabels(deps.productName, activeRunCount, deps.locale());
      if (tray == null || tray.isDestroyed()) {
        tray = deps.createTray();
        tray.setToolTip(deps.productName);
        tray.setContextMenu([
          { label: labels.open, click: () => deps.window.show() },
          { label: labels.quit, click: quit },
        ]);
        tray.onClick(() => deps.window.show());
      }
      deps.window.hide();
      if (!noticeShown) {
        noticeShown = true;
        tray.displayBalloon({ title: labels.balloonTitle, content: labels.balloonContent });
      }
    },
    windowShown: removeIcon,
    dispose: removeIcon,
  };
}
