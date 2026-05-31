import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_MESSAGES, type DaemonStatusSnapshot } from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Node binary resolution ────────────────────────────────────────────────
// In Electron, process.execPath is electron.exe — NOT the Node.js that Electron
// wraps.  We need the Node binary to spawn tsx (which runs the daemon TypeScript).
// Since pnpm stores node in <workspace>/nodejs/node.exe and electron lives under
// <workspace>/node_modules/.pnpm/electron@X.X.X/..., we resolve node.exe by
// walking up from electron's pnpm package root (7 levels above electron.exe).
function resolveNodeExe(): string {
  // Option 1: node.exe alongside electron.exe (Electron distribution layout)
  const nodeByElectron = join(process.execPath, "..", "node.exe");
  if (existsSync(nodeByElectron)) return nodeByElectron;

  // Option 2: pnpm-managed node — electron.exe is at:
  //   <workspace>/node_modules/.pnpm/electron@X.X.X/node_modules/electron/dist/electron.exe
  //   That's 7 ".." levels above electron.exe to the workspace root.
  const pnpmRoot = join(process.execPath, "..", "..", "..", "..", "..", "..", "..");
  const nodeByPnpm = join(pnpmRoot, "nodejs", "node.exe");
  if (existsSync(nodeByPnpm)) return nodeByPnpm;

  // Option 3: global node in PATH (fallback)
  return "node";
}

// Resolve workspace root: tray app is at apps/tray/dist/main/index.js
// Go up: dist -> tray -> apps -> workspace
function getWorkspaceRoot(): string {
  // 1. Try OD_DATA_DIR env var (used by packaged daemon)
  const odDataDir = process.env.OD_DATA_DIR;
  if (odDataDir) {
    // OD_DATA_DIR points to .od/ parent, i.e. the workspace root
    return resolve(odDataDir);
  }

  // 2. Derive from the resolved node.exe path: <workspace>/nodejs/node.exe → <workspace>
  const nodeExe = resolveNodeExe();
  if (nodeExe !== "node") {
    const candidate = resolve(nodeExe, "..");
    // Verify it has apps/ to confirm we found the right root
    if (existsSync(join(candidate, "apps"))) return candidate;
  }

  // 3. Walk up from __dirname as fallback (dev mode)
  const parts = __dirname.split(/[/\\]/);
  const appsIdx = parts.indexOf("apps");
  if (appsIdx >= 2) return parts.slice(0, appsIdx).join("/");

  // 4. Try environment variable or current working directory
  if (process.env.PWD) {
    const pwdParts = process.env.PWD.split(/[/\\]/);
    const pwdAppsIdx = pwdParts.indexOf("apps");
    if (pwdAppsIdx >= 2) return pwdParts.slice(0, pwdAppsIdx).join("/");
  }

  // Last resort — this should not happen in a normal dev environment
  throw new Error("Could not resolve workspace root for daemon-manager");
}

const WORKSPACE_ROOT = getWorkspaceRoot();

function resolveTsxPath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("tsx/cli");
}

function resolveDaemonEntryPath(): string {
  return join(WORKSPACE_ROOT, "apps/daemon/src/sidecar/index.ts");
}

export type DaemonStatus = {
  isRunning: boolean;
  port: number;
  url: string | null;
  pid: number | null;
};

export type DaemonManagerOptions = {
  namespace?: string;
  daemonPort?: number;
  webPort?: number;
};

export class DaemonManager {
  private childProcess: ChildProcess | null = null;
  private _port: number = 0;
  private _url: string | null = null;
  private _pid: number | null = null;
  private namespace: string;
  private daemonPort: number;
  private webPort: number;

  constructor(options: DaemonManagerOptions = {}) {
    this.namespace = options.namespace ?? "default";
    this.daemonPort = options.daemonPort ?? 0;
    this.webPort = options.webPort ?? 0;
  }

  private getDaemonIpcPath(): string {
    return resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: this.namespace,
    });
  }

  private getStampArgs(): string[] {
    const ipc = this.getDaemonIpcPath();
    return [
      `--od-stamp-app=${APP_KEYS.DAEMON}`,
      `--od-stamp-ipc=${ipc}`,
      `--od-stamp-mode=dev`,
      `--od-stamp-namespace=${this.namespace}`,
      `--od-stamp-source=tray`,
    ];
  }

  async start(): Promise<void> {
    if (this.childProcess != null) {
      await this.stop();
    }

    // Check if daemon is already running via IPC
    const existing = await this.getStatus();
    if (existing.isRunning) {
      console.log("[tray] daemon already running, skipping spawn");
      return;
    }

    console.log("[tray] daemon not running, spawning...");
    const tsxPath = resolveTsxPath();
    console.log("[tray] tsx path:", tsxPath);
    const daemonPath = resolveDaemonEntryPath();
    console.log("[tray] daemon entry path:", daemonPath);
    const stampArgs = this.getStampArgs();
    console.log("[tray] stamp args:", stampArgs);

    const env = { ...process.env };
    env["OD_SIDECAR_NAMESPACE"] = this.namespace;
    if (this.daemonPort > 0) env["OD_DAEMON_PORT"] = String(this.daemonPort);
    if (this.webPort > 0) env["OD_WEB_PORT"] = String(this.webPort);

    console.log("[tray] spawning daemon...");
    // detached=true + stdio=ignore: daemon outlives tray, no shared stdin
    const nodeExe = resolveNodeExe();
    this.childProcess = spawn(nodeExe, [tsxPath, daemonPath, ...stampArgs], {
      env,
      stdio: "ignore",
      detached: true,
    });
    console.log("[tray] spawned child pid:", this.childProcess.pid);

    this._pid = this.childProcess.pid ?? null;

    this.childProcess.on("exit", (code) => {
      console.log("[tray] daemon child exited with code:", code);
      this.childProcess = null;
      this._pid = null;
      this._url = null;
    });

    this.childProcess.on("error", (err) => {
      console.error("[tray] daemon spawn error:", err.message);
      this.childProcess = null;
    });

    // Wait for daemon to become ready
    await this.waitForDaemon();
  }

  async stop(): Promise<void> {
    if (this.childProcess == null) return;

    const ipc = this.getDaemonIpcPath();
    try {
      await requestJsonIpc(ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 3000 });
    } catch {
      // ignore — will force kill below
    }

    await new Promise<void>((resolve) => {
      if (this.childProcess == null) return resolve();
      this.childProcess.once("exit", () => resolve());
      this.childProcess.kill("SIGTERM");
      setTimeout(resolve, 2000);
    });

    if (this.childProcess != null) {
      try {
        this.childProcess.kill("SIGKILL");
      } catch {
        // already dead
      }
      this.childProcess = null;
    }

    this._pid = null;
    this._url = null;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async getStatus(): Promise<DaemonStatus> {
    // Always try IPC — the child process reference may be stale after the
    // spawn helper exits, but the real daemon is still alive and listening.
    const ipc = this.getDaemonIpcPath();
    try {
      const status = await requestJsonIpc<DaemonStatusSnapshot>(
        ipc,
        { type: SIDECAR_MESSAGES.STATUS },
        { timeoutMs: 4000 }
      );
      // Cache URL and port so callers can read them without an IPC round-trip.
      this._url = status.url ?? null;
      this._port = this.extractPort(status.url ?? "");
      return {
        isRunning: true,
        port: this._port,
        url: this._url,
        pid: this._pid,
      };
    } catch (err) {
      // Only report not running if we have no cached URL either
      if (this._url != null) {
        return {
          isRunning: true,
          port: this._port,
          url: this._url,
          pid: this._pid,
        };
      }
      return { isRunning: false, port: this._port, url: null, pid: null };
    }
  }

  get port(): number {
    return this._port;
  }

  get url(): string | null {
    return this._url;
  }

  get pid(): number | null {
    return this._pid;
  }

  // Expose _pid for callers to read after start() even if childProcess became null
  get spawnedPid(): number | null {
    return this._pid;
  }

  private async waitForDaemon(): Promise<void> {
    const ipc = this.getDaemonIpcPath();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        const status = await requestJsonIpc<DaemonStatusSnapshot>(
          ipc,
          { type: SIDECAR_MESSAGES.STATUS },
          { timeoutMs: 1500 }
        );
        if (status.url != null) {
          this._url = status.url;
          this._port = this.extractPort(status.url);
          return;
        }
      } catch {
        // not ready yet
      }
      await sleep(500);
    }
    throw new Error("daemon did not become ready in time");
  }

  private extractPort(url: string): number {
    try {
      return Number(new URL(url).port) || 0;
    } catch {
      return 0;
    }
  }
} // end of DaemonManager class
