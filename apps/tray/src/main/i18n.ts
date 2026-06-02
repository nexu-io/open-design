/**
 * i18n.ts — Minimal i18n for the tray app.
 *
 * Detects system language (Electron's app.language or navigator.language)
 * and returns the appropriate translations.
 *
 * Supported: English, Chinese Simplified (zh-CN), Chinese Traditional (zh-TW/HK/MO)
 */

import { createRequire } from "node:module";

export interface TrayI18n {
  // Menu items
  statusLabel: string;
  running: string;
  stopped: string;
  port: string;
  auto: string;
  webUi: string;
  stopService: string;
  startService: string;
  restartDaemon: string;
  restartApp: string;
  settings: string;
  autoStart: string;
  about: (version: string) => string;
  quit: string;

  // Tooltips
  tooltipRunning: (url?: string | null) => string;
  tooltipStopped: string;
  tooltipStarting: string;
  tooltipStartingDaemon: string;
  tooltipStoppingDaemon: string;
  tooltipRestartingDaemon: string;
  tooltipRestartingApp: string;
}

function en(): TrayI18n {
  return {
    statusLabel: "Status",
    running: "Running",
    stopped: "Stopped",
    port: "Port",
    auto: "auto",
    webUi: "Web UI",
    stopService: "Stop Service",
    startService: "Start Service",
    restartDaemon: "Restart Daemon",
    restartApp: "Restart App",
    settings: "Settings",
    autoStart: "Auto-start on login",
    about: (v) => `About Open Design v${v}`,
    quit: "Quit Open Design",

    tooltipRunning: (url) => url ? `Open Design — Running\nWeb: ${url}` : "Open Design — Running",
    tooltipStopped: "Open Design — Stopped",
    tooltipStarting: "Open Design — Starting...",
    tooltipStartingDaemon: "Open Design — Starting daemon...",
    tooltipStoppingDaemon: "Open Design — Stopping daemon...",
    tooltipRestartingDaemon: "Open Design — Restarting daemon...",
    tooltipRestartingApp: "Open Design — Restarting app...",
  };
}

function zhCN(): TrayI18n {
  return {
    statusLabel: "状态",
    running: "运行中",
    stopped: "已停止",
    port: "端口",
    auto: "自动",
    webUi: "Web UI",
    stopService: "停止服务",
    startService: "启动服务",
    restartDaemon: "重启守护进程",
    restartApp: "重启主程序",
    settings: "设置",
    autoStart: "开机自启动",
    about: (v) => `关于 Open Design v${v}`,
    quit: "退出 Open Design",

    tooltipRunning: (url) => url ? `Open Design — 运行中\nWeb: ${url}` : "Open Design — 运行中",
    tooltipStopped: "Open Design — 已停止",
    tooltipStarting: "Open Design — 启动中...",
    tooltipStartingDaemon: "Open Design — 启动服务中...",
    tooltipStoppingDaemon: "Open Design — 停止服务中...",
    tooltipRestartingDaemon: "Open Design — 重启守护进程...",
    tooltipRestartingApp: "Open Design — 重启主程序...",
  };
}

function zhTW(): TrayI18n {
  return {
    statusLabel: "狀態",
    running: "運行中",
    stopped: "已停止",
    port: "連接埠",
    auto: "自動",
    webUi: "Web UI",
    stopService: "停止服務",
    startService: "啟動服務",
    restartDaemon: "重啟守護程序",
    restartApp: "重啟主程式",
    settings: "設定",
    autoStart: "開機自動啟動",
    about: (v) => `關於 Open Design v${v}`,
    quit: "退出 Open Design",
    tooltipRunning: (url) => url ? `Open Design — 運行中\nWeb: ${url}` : "Open Design — 運行中",
    tooltipStopped: "Open Design — 已停止",
    tooltipStarting: "Open Design — 啟動中...",
    tooltipStartingDaemon: "Open Design — 啟動服務中...",
    tooltipStoppingDaemon: "Open Design — 停止服務中...",
    tooltipRestartingDaemon: "Open Design — 重啟守護程序...",
    tooltipRestartingApp: "Open Design — 重啟主程式...",
  };
}

function detectLocale(): TrayI18n {
  // Electron's app.getLocale() returns the OS locale (e.g. "zh-CN", "en-US").
  // Falls back to "en" if we are running outside Electron.
  let lang = "en";
  try {
    const electronRequire = createRequire(import.meta.url);
    const { app } = electronRequire("electron") as { app: { language?: string; getLocale?: () => string } };
    // getLocale() returns the OS locale; language may be undefined in some Electron versions
    lang = app.getLocale?.() ?? app.language ?? "en";
  } catch {
    // Not running in Electron — keep "en"
  }

  // zh-TW, zh-HK, zh-MO
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK") || lang.startsWith("zh-MO")) {
    return zhTW();
  }
  // zh-CN, zh-SG, zh-Hans
  if (lang.startsWith("zh")) {
    return zhCN();
  }
  return en();
}

// Lazy singleton — detect once and cache
let _t: TrayI18n | null = null;
export function t(): TrayI18n {
  if (_t === null) _t = detectLocale();
  return _t;
}