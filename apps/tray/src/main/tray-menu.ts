import * as Electron from "electron";
const { Menu, shell } = Electron;
type MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;

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
  const items: MenuItemConstructorOptions[] = [];

  // Status line (disabled, informational only)
  const statusLabel = state.isRunning
    ? `● 运行中 (端口 ${state.daemonPort || "—"})`
    : "○ 已停止";
  items.push({ label: `状态: ${statusLabel}`, enabled: false });

  // Web UI — only when running
  if (state.isRunning && state.webUrl) {
    items.push({
      label: `Web UI: ${state.webUrl}`,
      click: () => {
        shell.openExternal(state.webUrl!);
      },
    });
  }

  items.push({ type: "separator" });

  // Start / Stop
  if (state.isRunning) {
    items.push({
      label: "■ 停止服务",
      click: () => {
        void callbacks.stopDaemon();
      },
    });
  } else {
    items.push({
      label: "▶ 启动服务",
      click: () => {
        void callbacks.startDaemon();
      },
    });
  }

  // Restart daemon
  items.push({
    label: "⟳ 重启守护进程",
    click: () => {
      void callbacks.restartDaemon();
    },
    enabled: state.isRunning,
  });

  // Relaunch application
  items.push({
    label: "↻ 重启主程序",
    click: () => {
      void callbacks.restartTray();
    },
  });

  items.push({ type: "separator" });

  // Settings submenu
  items.push({
    label: "⚙ 设置",
    submenu: [
      {
        label: state.daemonPort > 0
          ? `端口: ${state.daemonPort}`
          : "端口: 自动分配",
        enabled: false,
      },
      {
        label: "开机自启动",
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
    label: `关于 Open Design v${state.version}`,
    enabled: false,
  });

  items.push({ type: "separator" });

  // Quit
  items.push({
    label: "退出 Open Design",
    click: () => {
      callbacks.quit();
    },
  });

  return Menu.buildFromTemplate(items);
}

export function buildTooltip(state: TrayState): string {
  if (state.isRunning && state.webUrl) {
    return `Open Design — 运行中\nWeb: ${state.webUrl}`;
  }
  if (state.isRunning) {
    return `Open Design — 运行中 (端口 ${state.daemonPort || "—"})`;
  }
  return "Open Design — 已停止";
}
