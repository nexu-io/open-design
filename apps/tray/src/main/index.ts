import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { DaemonManager } from "./daemon-manager.js";
import { buildTrayMenu, buildTooltip, type TrayCallbacks, type TrayState } from "./tray-menu.js";
import {
  disableAutoStart,
  enableAutoStart,
  isAutoStartEnabled,
} from "./auto-start.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Electron resolution: use createRequire with the source file's URL as base
// so that 'electron' resolves from apps/tray/node_modules/electron (the pnpm symlink)
const electronRequire = createRequire(import.meta.url);
const Electron = electronRequire("electron") as typeof import("electron");
const { app, nativeImage, shell } = Electron;

// Version from package.json
const VERSION = "0.4.0";

// Config file path — stored in .od/ so it persists across restarts
function getConfigPath(base: string): string {
  return join(base, ".od", "tray-config.json");
}

export type TrayConfig = {
  daemonPort: number;
  autoStart: boolean;
};

async function loadConfig(base: string): Promise<TrayConfig> {
  try {
    const content = await readFile(getConfigPath(base), "utf8");
    return JSON.parse(content) as TrayConfig;
  } catch {
    return { daemonPort: 0, autoStart: false };
  }
}

async function saveConfig(base: string, config: TrayConfig): Promise<void> {
  await mkdir(dirname(getConfigPath(base)), { recursive: true });
  await writeFile(getConfigPath(base), JSON.stringify(config, null, 2), "utf8");
}

// ─── PNG/ICO icon generation ───────────────────────────────────────────────

function createPngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeB, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, typeB, data, crcBuf]);
}

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

function createPngImage(size: number, rgba: Buffer): Buffer {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width, height, bit depth, color type (6=RGBA), compression, filter, interlace
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Raw image rows (filter byte + RGBA per row)
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // no filter
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
  const idat = createPngChunk("IDAT", compressed);
  const ihdrC = createPngChunk("IHDR", ihdr);
  const iend = createPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrC, idat, iend]);
}

function createYellowCirclePng(size: number): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        // Claude yellow #EAB308
        rgba[idx] = 234;
        rgba[idx + 1] = 179;
        rgba[idx + 2] = 8;
        rgba[idx + 3] = 255;
      } else {
        // Transparent
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  return createPngImage(size, rgba);
}

async function getTrayIcon(): Promise<Electron.NativeImage> {
  // 1. Try to load from assets folder (ICO or PNG)
  const assetPaths = [
    join(__dirname, "..", "..", "assets", "icon.ico"),
    join(__dirname, "..", "..", "assets", "icon.png"),
    join(__dirname, "..", "assets", "icon.ico"),
    join(__dirname, "..", "assets", "icon.png"),
    join(process.resourcesPath ?? "", "assets", "icon.ico"),
    join(process.resourcesPath ?? "", "assets", "icon.png"),
  ];

  for (const iconPath of assetPaths) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        console.log(`[tray] loaded icon from: ${iconPath}`);
        return img;
      }
    } catch (err) {
      console.log(`[tray] icon path failed: ${iconPath} — ${err}`);
    }
  }

  // 2. Fallback: programmatically create PNG
  console.log("[tray] using programmatic icon (32px yellow circle)");
  const png32 = createYellowCirclePng(32);
  return nativeImage.createFromBuffer(png32);
}

// ─── Main ────────────────────────────────────────────────────────────────

export async function runTrayMain(
  runtime: SidecarRuntimeContext<SidecarStamp>,
): Promise<void> {
  console.log(`[tray] starting — namespace=${runtime.namespace} ipc=${runtime.ipc}`);

  await app.whenReady();
  console.log("[tray] electron ready");

  // Load persisted config
  const config = await loadConfig(runtime.base);
  const autoStartEnabled = await isAutoStartEnabled();
  console.log(`[tray] config loaded — daemonPort=${config.daemonPort} autoStart=${autoStartEnabled}`);

  const state: TrayState = {
    isRunning: false,
    daemonPort: config.daemonPort,
    webUrl: null,
    autoStart: autoStartEnabled,
    version: VERSION,
  };

  // Create tray icon
  let icon: Electron.NativeImage;
  try {
    icon = await getTrayIcon();
  } catch (err) {
    console.error("[tray] getTrayIcon failed:", err);
    // Last-resort: empty icon (will show default)
    icon = nativeImage.createEmpty();
  }

  const { Tray } = await import("electron");
  const tray = new Tray(icon);
  tray.setToolTip("Open Design — 启动中...");

  // Daemon manager
  const manager = new DaemonManager({
    namespace: runtime.namespace,
    daemonPort: config.daemonPort,
  });

  let shuttingDown = false;
  let pollTimer: NodeJS.Timeout | null = null;

  async function refreshTray(): Promise<void> {
    const status = await manager.getStatus().catch(() => null);
    state.isRunning = status?.isRunning ?? false;
    state.daemonPort = status?.port ?? config.daemonPort;
    state.webUrl = status?.url ?? null;

    tray.setToolTip(buildTooltip(state));
    tray.setContextMenu(buildTrayMenu(state, callbacks));
  }

  async function startDaemon(): Promise<void> {
    tray.setToolTip("Open Design — 启动服务中...");
    await manager.start();
    // Query the actual daemon status so we always have the correct URL/port,
    // even when the daemon was already running (start() returned early).
    const status = await manager.getStatus().catch(() => null);
    state.isRunning = status?.isRunning ?? false;
    state.webUrl = status?.url ?? null;
    state.daemonPort = status?.port ?? config.daemonPort;
    await refreshTray();
  }

  async function stopDaemon(): Promise<void> {
    tray.setToolTip("Open Design — 停止服务中...");
    await manager.stop();
    await refreshTray();
  }

  async function restartDaemon(): Promise<void> {
    tray.setToolTip("Open Design — 重启守护进程...");
    await manager.restart();
    await refreshTray();
  }

  async function restartTray(): Promise<void> {
    tray.setToolTip("Open Design — 重启主程序...");
    // Relaunch the electron app
    app.relaunch();
    app.exit(0);
  }

  async function setAutoStart(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await enableAutoStart(process.execPath);
      } else {
        await disableAutoStart();
      }
      state.autoStart = enabled;
      await saveConfig(runtime.base, { ...config, autoStart: enabled });
      await refreshTray();
    } catch (err) {
      console.error("[tray] setAutoStart failed:", err);
    }
  }

  async function quitTray(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    if (pollTimer) clearInterval(pollTimer);
    try {
      await stopDaemon();
    } catch {
      // best-effort
    }
    try {
      await ipcServer?.close();
    } catch {
      // ignore
    }
    app.quit();
  }

  const callbacks: TrayCallbacks = {
    startDaemon,
    stopDaemon,
    restartDaemon,
    restartTray,
    setAutoStart,
    quit: quitTray,
  };

  // Initial menu
  tray.setContextMenu(buildTrayMenu(state, callbacks));

  // Left-click: open web UI
  tray.on("click", () => {
    if (state.webUrl) {
      shell.openExternal(state.webUrl);
    } else if (state.isRunning) {
      shell.openExternal(`http://127.0.0.1:${state.daemonPort || 53450}`);
    }
  });

  // IPC server — handles STATUS and SHUTDOWN from tools-dev
  let ipcServer: JsonIpcServerHandle | null = null;
  try {
    ipcServer = await createJsonIpcServer({
      socketPath: runtime.ipc,
      handler: async (message: unknown) => {
        const msg = message as { type?: string };
        if (msg.type === SIDECAR_MESSAGES.STATUS) {
          return {
            isRunning: state.isRunning,
            port: state.daemonPort,
            url: state.webUrl,
            autoStart: state.autoStart,
            version: VERSION,
          };
        }
        if (msg.type === SIDECAR_MESSAGES.SHUTDOWN) {
          void quitTray();
          return { accepted: true };
        }
        return { error: "unknown message type" };
      },
    });
    console.log(`[tray] IPC server listening at: ${runtime.ipc}`);
  } catch (err) {
    console.error("[tray] createJsonIpcServer failed:", err);
  }

  // Background polling
  pollTimer = setInterval(async () => {
    if (shuttingDown) {
      clearInterval(pollTimer!);
      return;
    }
    try {
      await refreshTray();
    } catch (err) {
      console.error("[tray] refreshTray error:", err);
    }
  }, 5000);

  // Initial refresh
  await refreshTray();

  // Always start daemon when tray starts (start() checks if already running)
  console.log("[tray] starting daemon...");
  void startDaemon().catch((err) => {
    console.error("[tray] start daemon failed:", err);
  });

  // Signals
  process.on("SIGINT", () => { void quitTray(); });
  process.on("SIGTERM", () => { void quitTray(); });
}

// ─── Entry point ─────────────────────────────────────────────────────────

function isDirectEntry(): boolean {
  const entryPath = process.argv[1];
  if (entryPath == null || entryPath.length === 0 || entryPath.startsWith("--")) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  const args = process.argv.slice(2);
  console.log("[tray] entry args:", args);

  const stamp = readProcessStamp(args, OPEN_DESIGN_SIDECAR_CONTRACT);
  if (stamp == null) {
    console.error("[tray] ERROR: no valid sidecar stamp found in args:", args);
    process.exit(1);
  }
  console.log("[tray] stamp:", stamp);

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.TRAY,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  void runTrayMain(runtime).catch((error: unknown) => {
    console.error("[tray] FATAL:", error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
