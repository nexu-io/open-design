/**
 * tray.ts — single-process tray + window manager for the desktop app.
 *
 * Owns:
 *   - The system tray icon and its context menu
 *   - Daemon-status polling (every 5s) to keep menu/tooltip fresh
 *   - The JSON-IPC server that tools-dev / tools-pack talk to for
 *     STATUS / SHUTDOWN requests
 *
 * Phase D of the tray-merge plan: this module replaces the old
 * `apps/tray/src/main/index.ts`. Once the desktop ships this module,
 * the old tray package can be deleted.
 */
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { app, Menu, Tray, nativeImage, type NativeImage, type MenuItemConstructorOptions, shell } from "electron";
import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, type SidecarStamp } from "@open-design/sidecar-proto";
import { type SidecarRuntimeContext } from "@open-design/sidecar";

import { crc32 } from "./utils/crc32.js";
import { DaemonManager } from "./daemon-manager.js";
import { t } from "./i18n.js";
import { setAutoStart } from "./auto-start.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_VERSION = "0.9.0";
const TRAY_POLL_MS = 5000;
const TRAY_FALLBACK_ICON_PX = 32;

export type DesktopTrayState = {
  isRunning: boolean;
  daemonPort: number;
  webUrl: string | null;
  autoStart: boolean;
  version: string;
};

export type DesktopTrayController = {
  /** Stop polling, close the IPC server, destroy the tray icon. */
  dispose: () => Promise<void>;
  /** Force a refresh of the menu + tooltip from the current state. */
  refresh: () => Promise<void>;
};

export type DesktopTrayOptions = {
  runtime: SidecarRuntimeContext<SidecarStamp>;
  /**
   * Optional persistence of the autoStart toggle. Production builds don't
   * need this (NSIS handles it); the dev tools-dev path stores the last
   * choice in `.od/tray-config.json` so the toggle survives a restart.
   */
  configPath?: string;
  /** Initial autoStart state (from a prior run, or `false` to default-off). */
  initialAutoStart?: boolean;
  /** Initial daemon port, used as a fallback before the first status poll. */
  initialDaemonPort?: number;
  /**
   * Restore the main BrowserWindow. Called from the tray context menu's
   * "Show window" entry and from the tray-icon single click when the
   * daemon isn't reachable through a web URL. The desktop main process
   * wires this to `runtime.show()` (which also restores from minimised).
   */
  onShowWindow: () => void;
};

// ─── Config persistence (dev only) ─────────────────────────────────────────

type TrayConfigFile = { autoStart: boolean };

async function readConfigFile(path: string): Promise<TrayConfigFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as TrayConfigFile;
  } catch {
    return { autoStart: false };
  }
}

async function writeConfigFile(path: string, value: TrayConfigFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

// ─── Programmatic icon (PNG generated from rgba) ──────────────────────────

function createPngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeB, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, typeB, data, crcBuf]);
}

function createPngImage(size: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowLen + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", compressed),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Blue rounded-square with white "O" mark, matching the original tray icon. */
function createTrayIconPng(size: number): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = size * 0.44;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      const cornerRadius = size * 0.18;
      let inside = false;
      if (dx <= radius - cornerRadius && dy <= radius) inside = true;
      else if (dx <= radius && dy <= radius - cornerRadius) inside = true;
      else if (dx <= radius && dy <= radius) {
        const cdx = dx - (radius - cornerRadius);
        const cdy = dy - (radius - cornerRadius);
        if (cdx * cdx + cdy * cdy <= cornerRadius * cornerRadius) inside = true;
      }
      const idx = (y * size + x) * 4;
      if (!inside) {
        rgba[idx + 3] = 0;
        continue;
      }
      const gradientFactor = (x + y) / (size * 2);
      const r = Math.round(59 + (29 - 59) * gradientFactor);
      const g = Math.round(130 + (78 - 130) * gradientFactor);
      const b = Math.round(246 + (216 - 246) * gradientFactor);
      const oCenter = center;
      const oOuterRadius = size * 0.22;
      const oInnerRadius = size * 0.12;
      const oDist = Math.sqrt((x - oCenter) ** 2 + (y - oCenter) ** 2);
      if (oDist <= oOuterRadius && oDist >= oInnerRadius) {
        rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; rgba[idx + 3] = 255;
      } else if (oDist < oInnerRadius) {
        rgba[idx + 3] = 0;
      } else {
        rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
      }
    }
  }
  return createPngImage(size, rgba);
}

function loadTrayIcon(): NativeImage {
  const assetPaths = [
    join(__dirname, "..", "..", "assets", "icon.ico"),
    join(__dirname, "..", "..", "assets", "icon.png"),
    join(__dirname, "..", "assets", "icon.ico"),
    join(__dirname, "..", "assets", "icon.png"),
  ];
  if (typeof process !== "undefined" && process.resourcesPath) {
    assetPaths.push(
      join(process.resourcesPath, "assets", "icon.ico"),
      join(process.resourcesPath, "assets", "icon.png"),
    );
  }
  for (const p of assetPaths) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    } catch {
      // ignore
    }
  }
  return nativeImage.createFromBuffer(createTrayIconPng(TRAY_FALLBACK_ICON_PX));
}

// ─── Menu + tooltip builders ──────────────────────────────────────────────

function buildTooltip(state: DesktopTrayState): string {
  const TR = t();
  if (state.isRunning && state.webUrl) {
    return TR.tooltipRunning(state.webUrl);
  }
  if (state.isRunning) {
    return `Open Design — ${TR.running} (${TR.port} ${state.daemonPort || TR.auto})`;
  }
  return TR.tooltipStopped;
}

function buildMenuItems(
  state: DesktopTrayState,
  callbacks: {
    onStart: () => Promise<void>;
    onStop: () => Promise<void>;
    onRestart: () => Promise<void>;
    onToggleAutoStart: (enabled: boolean) => Promise<void>;
    onQuit: () => Promise<void>;
    onShowWindow: () => void;
  },
): MenuItemConstructorOptions[] {
  const TR = t();
  const items: MenuItemConstructorOptions[] = [];
  const statusLabel = state.isRunning
    ? `${TR.running} (${TR.port} ${state.daemonPort || TR.auto})`
    : TR.stopped;
  items.push({ label: `${TR.statusLabel}: ${statusLabel}`, enabled: false });
  if (state.isRunning && state.webUrl) {
    items.push({
      label: `${TR.webUi}: ${state.webUrl}`,
      click: () => {
        shell.openExternal(state.webUrl!);
      },
    });
  }
  items.push({ label: TR.showWindow, click: () => callbacks.onShowWindow() });
  items.push({ type: "separator" });
  if (state.isRunning) {
    items.push({ label: TR.stopService, click: () => void callbacks.onStop() });
  } else {
    items.push({ label: TR.startService, click: () => void callbacks.onStart() });
  }
  items.push({
    label: TR.restartDaemon,
    enabled: state.isRunning,
    click: () => void callbacks.onRestart(),
  });
  items.push({ type: "separator" });
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
        click: () => void callbacks.onToggleAutoStart(!state.autoStart),
      },
    ],
  });
  items.push({ type: "separator" });
  items.push({ label: TR.about(state.version), enabled: false });
  items.push({ type: "separator" });
  items.push({ label: TR.quit, click: () => void callbacks.onQuit() });
  return items;
}

// ─── Public entry: create the tray controller ─────────────────────────────

export async function createDesktopTray(
  options: DesktopTrayOptions,
): Promise<DesktopTrayController> {
  const { runtime, configPath, initialAutoStart = false, initialDaemonPort = 0, onShowWindow } = options;

  const manager = new DaemonManager({
    namespace: runtime.namespace,
    daemonPort: initialDaemonPort,
  });

  let state: DesktopTrayState = {
    isRunning: false,
    daemonPort: initialDaemonPort,
    webUrl: null,
    autoStart: initialAutoStart,
    version: APP_VERSION,
  };
  let polling: NodeJS.Timeout | null = null;
  let shuttingDown = false;
  let tray: Tray | null = null;

  /**
   * Toggle auto-start on login. OS hook first, config second: a
   * config write must not succeed while the OS write fails, or the
   * next launch will disagree with the user's last toggle.
   */
  async function persistAutoStart(enabled: boolean): Promise<void> {
    try {
      await setAutoStart(enabled, undefined, runtime.namespace, runtime.ipc);
    } catch (error) {
      // Log + rethrow: the caller surfaces a user-visible diagnostic.
      console.error(`[desktop-tray] setAutoStart(${enabled}) failed:`, error);
      throw error;
    }
    if (!configPath) return;
    await writeConfigFile(configPath, { autoStart: enabled });
  }

  async function refreshFromDaemon(): Promise<void> {
    const status = await manager.getStatus().catch(() => null);
    state.isRunning = status?.isRunning ?? false;
    state.daemonPort = status?.port ?? state.daemonPort;
    state.webUrl = status?.url ?? null;
    refreshMenu();
  }

  function refreshMenu(): void {
    if (!tray) return;
    const items = buildMenuItems(state, {
      onStart: () => manager.start().then(refreshFromDaemon),
      onStop: () => manager.stop().then(refreshFromDaemon),
      onRestart: () => manager.restart().then(refreshFromDaemon),
      onToggleAutoStart: async (enabled) => {
        state.autoStart = enabled;
        await persistAutoStart(enabled);
        refreshMenu();
      },
      onShowWindow,
      onQuit: async () => {
        shuttingDown = true;
        await manager.stop().catch(() => undefined);
        app.quit();
      },
    });
    tray.setContextMenu(Menu.buildFromTemplate(items));
    tray.setToolTip(buildTooltip(state));
  }

  // Boot
  console.log(`[desktop-tray] starting — namespace=${runtime.namespace} ipc=${runtime.ipc}`);

  // Tray icon
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip(t().tooltipStarting);
  tray.on("click", () => {
    if (state.webUrl) shell.openExternal(state.webUrl);
    else if (state.isRunning) shell.openExternal(`http://127.0.0.1:${state.daemonPort || 53450}`);
    else onShowWindow();
  });

  refreshMenu();

  // Note: STATUS / SHUTDOWN IPC is now answered by the desktop's main
  // IPC server (apps/desktop/src/main/index.ts). The tray controller only
  // owns the icon + menu + polling; the IPC surface lives with the main
  // process. Nothing to start here.

  // Polling
  polling = setInterval(() => {
    if (shuttingDown) return;
    refreshFromDaemon().catch((err: unknown) => {
      console.error("[desktop-tray] refresh error:", err);
    });
  }, TRAY_POLL_MS);

  // Initial refresh
  await refreshFromDaemon();
  manager.start().catch((err: unknown) => {
    console.error("[desktop-tray] start daemon failed:", err);
  });

  return {
    refresh: refreshFromDaemon,
    async dispose() {
      shuttingDown = true;
      if (polling) {
        clearInterval(polling);
        polling = null;
      }
      if (tray) {
        try {
          tray.destroy();
        } catch {
          // ignore
        }
        tray = null;
      }
    },
  };
}

// Re-export for desktop's main index to keep it on hand
export { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT };
