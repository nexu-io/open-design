import * as Electron from "electron";
const { Menu, shell } = Electron;
type MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;

import { t } from "./i18n.js";

export type TrayState = {
  isRunning: boolean;
  daemonPort: number;
  webUrl: string | null;
  autoStart: boolean;
  version: string;
};

export type TrayCallbacks = {
  startDaemon: () => Promise<void>;
  stopDaemon: () => Promise<void>;
  restartDaemon: () => Promise<void>;
  restartTray: () => Promise<void>;
  setAutoStart: (enabled: boolean) => Promise<void>;
  quit: () => Promise<void>;
};

export function buildTrayMenu(state: TrayState, callbacks: TrayCallbacks): Electron.Menu {
  const TR = t();
  const items: MenuItemConstructorOptions[] = [];

  // Status line (disabled, informational only)
  const statusLabel = state.isRunning
    ? `${TR.running} (${TR.port} ${state.daemonPort || TR.auto})`
    : TR.stopped;
  items.push({ label: `${TR.statusLabel}: ${statusLabel}`, enabled: false });

  // Web UI — only when running
  if (state.isRunning && state.webUrl) {
    items.push({
      label: `${TR.webUi}: ${state.webUrl}`,
      click: () => {
        shell.openExternal(state.webUrl!);
      },
    });
  }

  items.push({ type: "separator" });

  // Start / Stop
  if (state.isRunning) {
    items.push({
      label: TR.stopService,
      click: () => {
        void callbacks.stopDaemon();
      },
    });
  } else {
    items.push({
      label: TR.startService,
      click: () => {
        void callbacks.startDaemon();
      },
    });
  }

  // Restart daemon
  items.push({
    label: TR.restartDaemon,
    click: () => {
      void callbacks.restartDaemon();
    },
    enabled: state.isRunning,
  });

  // Relaunch application
  items.push({
    label: TR.restartApp,
    click: () => {
      void callbacks.restartTray();
    },
  });

  items.push({ type: "separator" });

  // Settings submenu
  items.push({
    label: TR.settings,
    submenu: [
      {
        label: `${TR.port}: ${state.daemonPort > 0 ? state.daemonPort : TR.auto}`,
        enabled: false,
      },
      {
        label: TR.autoStart,
        type: "checkbox",
        checked: state.autoStart,
        click: () => {
          void callbacks.setAutoStart(!state.autoStart);
        },
      },
    ],
  });

  items.push({ type: "separator" });

  // About / version
  items.push({
    label: TR.about(state.version),
    enabled: false,
  });

  items.push({ type: "separator" });

  // Quit
  items.push({
    label: TR.quit,
    click: () => {
      callbacks.quit();
    },
  });

  return Menu.buildFromTemplate(items);
}

export function buildTooltip(state: TrayState): string {
  const TR = t();
  if (state.isRunning && state.webUrl) {
    return TR.tooltipRunning(state.webUrl);
  }
  if (state.isRunning) {
    return `Open Design — ${TR.running} (${TR.port} ${state.daemonPort || TR.auto})`;
  }
  return TR.tooltipStopped;
}