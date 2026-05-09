import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  normalizeDesktopSidecarMessage,
  type DesktopClickInput,
  type DesktopEvalInput,
  type DesktopExportPdfInput,
  type DesktopScreenshotInput,
  type SidecarStamp,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { createDesktopRuntime } from "./runtime.js";

// Re-export pure URL-policy helpers so the packaged workspace's
// vitest can pin their behaviour without spinning up a full Electron
// runtime. They are part of the security boundary for child-window
// navigation (see `setWindowOpenHandler` in `runtime.ts`), so
// pinning them is worth the small extra surface.
export { isAllowedChildWindowUrl, isHttpUrl } from "./runtime.js";

const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;

export type DesktopMainOptions = {
  beforeShutdown?: () => Promise<void>;
  discoverWebUrl?: () => Promise<string | null>;
};

function isDirectEntry(): boolean {
  const entryPath = process.argv[1];
  if (entryPath == null || entryPath.length === 0 || entryPath.startsWith("--")) return false;

  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function attachParentMonitor(stop: () => Promise<void>): void {
  const parentPid = Number(process.env[TOOLS_DEV_PARENT_PID_ENV]);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;

  const timer = setInterval(() => {
    if (isProcessAlive(parentPid)) return;
    clearInterval(timer);
    void stop().finally(() => process.exit(0));
  }, 1000);
  timer.unref();
}

function createWebDiscovery(runtime: SidecarRuntimeContext<SidecarStamp>): () => Promise<string | null> {
  return async () => {
    const webIpc = resolveAppIpcPath({
      app: APP_KEYS.WEB,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: runtime.namespace,
    });
    const web = await requestJsonIpc<WebStatusSnapshot>(webIpc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 600 }).catch(() => null);
    return web?.url ?? null;
  };
}

export async function runDesktopMain(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  options: DesktopMainOptions = {},
): Promise<void> {
  await app.whenReady();

  const desktop = await createDesktopRuntime({
    discoverUrl: options.discoverWebUrl ?? createWebDiscovery(runtime),
  });
  let ipcServer: JsonIpcServerHandle | null = null;
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await options.beforeShutdown?.().catch((error: unknown) => {
      console.error("desktop beforeShutdown failed", error);
    });
    await ipcServer?.close().catch(() => undefined);
    await desktop.close().catch(() => undefined);
    app.quit();
  }

  function shutdownAndExit(): void {
    void shutdown().finally(() => process.exit(0));
  }

  attachParentMonitor(shutdown);

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    void shutdown().finally(() => process.exit(0));
  });

  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDesktopSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          return desktop.status();
        case SIDECAR_MESSAGES.EVAL:
          return await desktop.eval(request.input as DesktopEvalInput);
        case SIDECAR_MESSAGES.SCREENSHOT:
          return await desktop.screenshot(request.input as DesktopScreenshotInput);
        case SIDECAR_MESSAGES.CONSOLE:
          return desktop.console();
        case SIDECAR_MESSAGES.CLICK:
          return await desktop.click(request.input as DesktopClickInput);
        case SIDECAR_MESSAGES.EXPORT_PDF:
          return await desktop.exportPdf(request.input as DesktopExportPdfInput);
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            shutdownAndExit();
          });
          return { accepted: true };
      }
    },
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shutdownAndExit();
  });

  app.on("window-all-closed", () => {
    shutdownAndExit();
  });

  app.on("activate", () => {
    desktop.show();
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      shutdownAndExit();
    });
  }
}

if (isDirectEntry()) {
  const stamp = readProcessStamp(process.argv.slice(2), OPEN_DESIGN_SIDECAR_CONTRACT);
  if (stamp == null) throw new Error("sidecar stamp is required");

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  void runDesktopMain(runtime).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
