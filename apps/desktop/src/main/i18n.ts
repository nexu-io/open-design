/**
 * i18n.ts — minimal i18n for desktop's tray module.
 *
 * Detects the system locale via Electron's `app.getLocale()` and returns
 * the matching translations for the tray menu and tooltips. Three
 * locales supported: en, zh-CN, zh-TW. Falls back to en.
 *
 * Phase D merge: this module replaces `apps/tray/src/main/i18n.ts`.
 */

export interface DesktopI18n {
  // Menu items
  statusLabel: string;
  running: string;
  stopped: string;
  port: string;
  auto: string;
  webUi: string;
  showWindow: string;
  stopService: string;
  startService: string;
  restartDaemon: string;
  settings: string;
  autoStart: string;
  about: (version: string) => string;
  quit: string;

  // Tooltips
  tooltipRunning: (url?: string | null) => string;
  tooltipStopped: string;
  tooltipStarting: string;
}

function en(): DesktopI18n {
  return {
    statusLabel: "Status",
    running: "Running",
    stopped: "Stopped",
    port: "Port",
    auto: "auto",
    webUi: "Web UI",
    showWindow: "Show window",
    stopService: "Stop Service",
    startService: "Start Service",
    restartDaemon: "Restart Daemon",
    settings: "Settings",
    autoStart: "Auto-start on login",
    about: (v) => `About Open Design v${v}`,
    quit: "Quit Open Design",
    tooltipRunning: (url) => url ? `Open Design — Running\nWeb: ${url}` : "Open Design — Running",
    tooltipStopped: "Open Design — Stopped",
    tooltipStarting: "Open Design — Starting...",
  };
}

function zhCN(): DesktopI18n {
  return {
    statusLabel: "状态",
    running: "运行中",
    stopped: "已停止",
    port: "端口",
    auto: "自动",
    webUi: "Web UI",
    showWindow: "显示窗口",
    stopService: "停止服务",
    startService: "启动服务",
    restartDaemon: "重启守护进程",
    settings: "设置",
    autoStart: "开机自启动",
    about: (v) => `关于 Open Design v${v}`,
    quit: "退出 Open Design",
    tooltipRunning: (url) => url ? `Open Design — 运行中\nWeb: ${url}` : "Open Design — 运行中",
    tooltipStopped: "Open Design — 已停止",
    tooltipStarting: "Open Design — 启动中...",
  };
}

function zhTW(): DesktopI18n {
  return {
    statusLabel: "狀態",
    running: "運行中",
    stopped: "已停止",
    port: "連接埠",
    auto: "自動",
    webUi: "Web UI",
    showWindow: "顯示視窗",
    stopService: "停止服務",
    startService: "啟動服務",
    restartDaemon: "重啟守護程序",
    settings: "設定",
    autoStart: "開機自動啟動",
    about: (v) => `關於 Open Design v${v}`,
    quit: "退出 Open Design",
    tooltipRunning: (url) => url ? `Open Design — 運行中\nWeb: ${url}` : "Open Design — 運行中",
    tooltipStopped: "Open Design — 已停止",
    tooltipStarting: "Open Design — 啟動中...",
  };
}

let cached: DesktopI18n | null = null;

export function t(): DesktopI18n {
  if (cached !== null) return cached;
  let lang = "en";
  try {
    // Lazy require so the module is testable in pure Node.
    // The require is resolved against this file's URL to avoid the
    // bare-specifier resolution rules.
    const { createRequire } = require("node:module") as typeof import("node:module");
    const req = createRequire(import.meta.url);
    const electron = req("electron") as { app: { getLocale?: () => string; language?: string } };
    lang = electron.app.getLocale?.() ?? electron.app.language ?? "en";
  } catch {
    // Not running inside Electron — keep "en"
  }
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK") || lang.startsWith("zh-MO")) {
    cached = zhTW();
  } else if (lang.startsWith("zh")) {
    cached = zhCN();
  } else {
    cached = en();
  }
  return cached;
}
