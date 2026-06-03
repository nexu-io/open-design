import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BrowserWindow, Menu, app, shell, type MenuItemConstructorOptions } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  normalizeDesktopSidecarMessage,
  type DesktopClickInput,
  type DesktopEvalInput,
  type DesktopExportPdfInput,
  type DesktopScreenshotInput,
  type DesktopUpdateInput,
  type RegisterDesktopAuthResult,
  type SidecarStamp,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { dirname, join } from "node:path";

import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
  resolveLogFilePath,
  resolveRuntimeNamespaceRoot,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { createDesktopRuntime, type DesktopRuntime } from "./runtime.js";
import { attachDesktopProcessErrorFilter } from "./uncaught-exception.js";
import { createDesktopUpdater, createDesktopUpdaterScheduler, type DesktopUpdaterScheduler } from "./updater.js";
import {
  exportDiagnosticsToFile,
  registerDesktopDiagnosticsIpc,
} from "./diagnostics.js";

// Re-export pure URL-policy helpers so the packaged workspace's
// vitest can pin their behaviour without spinning up a full Electron
// runtime. They are part of the security boundary for child-window
// navigation (see `setWindowOpenHandler` in `runtime.ts`), so
// pinning them is worth the small extra surface.
export { isAllowedChildWindowUrl, isHttpUrl, resolveDesktopStatusUrl } from "./runtime.js";

// Re-export the path-validation helpers for the same reason (#974).
// shell.openPath is privileged main-process behaviour; pinning the
// validation gate via tests is worth the extra surface.
//
// Round-5 (lefarcen P1, mrcfps) adds `pickAndImportFolder` and its
// types so the lazy-retry-on-DESKTOP_AUTH_PENDING flow is testable in
// the packaged workspace without booting Electron.
export {
  validateExistingDirectory,
  fetchResolvedProjectDir,
  isOpenPathAllowedForProject,
  signDesktopImportToken,
  pickAndImportFolder,
  type PathValidationResult,
  type ResolvedProjectDirContext,
  type PickAndImportFolderDeps,
  type PickAndImportFolderResult,
} from "./runtime.js";

const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;

// Argv prefix the preload uses to recover the OS locale main process
// read at startup. The renderer wires `__od__.client.osLocale` from it.
export const OS_LOCALE_PRELOAD_ARG_PREFIX = "--od-os-locale=";

/**
 * Read the OS preferred language and, when Electron has not yet
 * emitted `ready`, point Chromium's `--lang` flag at it so the
 * renderer's `navigator.language` follows the OS instead of falling
 * back to en-US. Returns the resolved BCP-47 string so callers can
 * forward it to `BrowserWindow.webPreferences.additionalArguments`
 * for the preload to expose to the renderer.
 *
 * Safe to call multiple times: `appendSwitch('lang', ...)` is a no-op
 * once `app.isReady()` is true. The packaged entry calls this once
 * before its own `whenReady` (so the switch lands) and `runDesktopMain`
 * calls it again later to recover the same string for the BrowserWindow.
 */
export function applyOsLocaleSwitch(electronApp: Electron.App): string {
  const preferred = electronApp.getPreferredSystemLanguages?.() ?? [];
  const osLocale = preferred[0] ?? "en";
  if (!electronApp.isReady()) {
    electronApp.commandLine.appendSwitch("lang", osLocale);
  }
  return osLocale;
}

export type DesktopMainOptions = {
  beforeShutdown?: () => Promise<void>;
  discoverWebUrl?: () => Promise<string | null>;
  /**
   * Round-7 (lefarcen P2 @ runtime.ts:336): packaged builds report the
   * renderer URL (`od://app/`) over `discoverWebUrl`, but Node-side
   * fetch can't resolve a custom Electron protocol. Optional. When
   * provided, runtime API calls (`/api/import/folder`,
   * `/api/projects/:id`) target this URL instead. tools-dev callers
   * omit it because their web URL IS already an http://127.0.0.1 URL
   * Node fetch can hit.
   */
  discoverDaemonUrl?: () => Promise<string | null>;
  preloadPath?: string;
  onDesktopReady?: (controls: { show(): void }) => void;
  update?: {
    currentVersion?: string | null;
    downloadRoot?: string | null;
    installerObservationRoot?: string | null;
  };
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

function installDesktopMenu(
  runtime: SidecarRuntimeContext<SidecarStamp>,
): () => void {
  const exportDiagnostics = () => {
    const focused = BrowserWindow.getFocusedWindow();
    void exportDiagnosticsToFile(runtime, focused).catch((error: unknown) => {
      console.error("desktop diagnostics export from menu failed", error);
    });
  };
  const rebuild = () => {
    const template: MenuItemConstructorOptions[] = [
      ...(process.platform === "darwin"
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                { role: "services" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : [
            {
              label: "File",
              submenu: [
                { role: "quit" as const },
              ],
            },
          ]),
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          ...(process.platform === "darwin"
            ? [{ type: "separator" as const }, { role: "front" as const }]
            : [{ role: "close" as const }]),
        ],
      },
      {
        label: "Help",
        role: "help",
        submenu: [
          {
            label: "Documentation",
            click() {
              void shell.openExternal("https://github.com/nexu-io/open-design#readme");
            },
          },
          { type: "separator" },
          {
            label: "Contact Us",
            click() {
              void shell.openExternal("https://x.com/nexudotio");
            },
          },
          {
            label: "Report Issue",
            click() {
              void shell.openExternal("https://github.com/nexu-io/open-design/issues/new");
            },
          },
          {
            label: "Join Discord",
            click() {
              void shell.openExternal("https://discord.gg/mHAjSMV6gz");
            },
          },
          { type: "separator" },
          { label: "Export Diagnostics…", click: exportDiagnostics },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  rebuild();
  return () => undefined;
}

const REGISTER_DESKTOP_AUTH_RETRY_DELAYS_MS = [120, 240, 480, 960, 1500];
const REGISTER_DESKTOP_AUTH_TIMEOUT_MS = 800;

/**
 * Sends a fresh, per-process secret to the daemon over its sidecar IPC
 * before any BrowserWindow is created. The daemon stores the secret
 * and from this point on requires every `POST /api/import/folder`
 * request to carry an HMAC token signed with it (PR #974). On a clean
 * orchestrator startup the daemon is already up — but desktop and
 * daemon are sibling processes spawned by `tools-dev` / `tools-pack`,
 * so we retry the IPC call a few times before giving up. A failed
 * registration is *not* a hard error: the desktop runtime continues
 * and the import-folder bridge will simply refuse pickAndImport calls
 * (because no secret is in scope), instead of opening a renderer-
 * bypassable path. We log the failure so the operator can investigate.
 */
async function registerDesktopAuthWithDaemon(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  secret: Buffer,
): Promise<boolean> {
  const daemonIpc = resolveAppIpcPath({
    app: APP_KEYS.DAEMON,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: runtime.namespace,
  });
  const message = {
    input: { secret: secret.toString("base64") },
    type: SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
  };
  const delays = REGISTER_DESKTOP_AUTH_RETRY_DELAYS_MS;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const result = await requestJsonIpc<RegisterDesktopAuthResult>(
        daemonIpc,
        message,
        { timeoutMs: REGISTER_DESKTOP_AUTH_TIMEOUT_MS },
      );
      if (result?.accepted === true) return true;
    } catch {
      // Daemon not yet listening on the IPC socket, or message rejected.
      // Fall through to the retry sleep below.
    }
    if (attempt >= delays.length) break;
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, delays[attempt]);
    });
  }
  return false;
}

export async function runDesktopMain(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  options: DesktopMainOptions = {},
): Promise<void> {
  // Install the defensive uncaughtException filter BEFORE awaiting
  // app.whenReady, so a setTypeOfService EINVAL thrown by undici during
  // the renderer's first fetch is intercepted rather than surfacing as
  // Electron's "JavaScript error in main process" dialog (issue #647).
  // The packaged entry has the parallel filter wired in
  // apps/packaged/src/logging.ts; both must stay in sync until the
  // helper is promoted to a shared workspace package.
  attachDesktopProcessErrorFilter();

  // dev (tools-dev) enters here without a prior `whenReady` — so this
  // is where the `--lang` switch actually lands. In packaged builds
  // `apps/packaged/src/index.ts` has already applied the switch before
  // its own `whenReady`; this call is then a no-op for the switch and
  // only recovers the locale string for the BrowserWindow below.
  const osLocale = applyOsLocaleSwitch(app);

  await app.whenReady();

  // PR #974: mint a per-process auth secret and hand it to the daemon
  // BEFORE the BrowserWindow loads. The daemon uses it to verify the
  // HMAC tokens that the `dialog:pick-and-import` IPC mints for
  // `POST /api/import/folder`. Doing this before the window load is
  // load-bearing: it closes the race where a compromised renderer
  // races to call /api/import/folder with an arbitrary baseDir before
  // the gate is armed.
  //
  // Round-5 (lefarcen P1, mrcfps): if the initial registration fails
  // (daemon slow to listen, missed startup window, or daemon restarted
  // mid-session), we still pass the secret to the runtime so the lazy
  // re-registration path inside `dialog:pick-and-import` can recover.
  // The runtime's first import attempt under a daemon that doesn't yet
  // know the secret gets a `503 DESKTOP_AUTH_PENDING`, the runtime
  // re-invokes the registration callback below, and the import retries
  // once with a fresh token. A persistent failure surfaces in the
  // renderer toast rather than silently dropping forever.
  const desktopAuthSecret = randomBytes(32);
  const registered = await registerDesktopAuthWithDaemon(runtime, desktopAuthSecret);
  if (!registered) {
    console.warn(
      "[open-design desktop] initial import-token handshake with daemon did not complete; " +
        "first folder-import attempt will lazily retry registration before failing",
    );
  }

  const updater = createDesktopUpdater(
    {
      currentVersion: options.update?.currentVersion,
      downloadRoot: options.update?.downloadRoot,
      installerObservationRoot: options.update?.installerObservationRoot,
      namespace: runtime.namespace,
      runtimeBase: runtime.base,
      source: runtime.source,
    },
    { openPath: (path) => shell.openPath(path) },
  );
  // Resolve the namespace root the same way the diagnostics export does
  // (apps/desktop/src/main/diagnostics.ts). In packaged builds `runtime.base`
  // is `<namespaceRoot>/runtime`, so re-appending the namespace via
  // `resolveNamespaceRoot` would write renderer.log to a phantom
  // `<namespaceRoot>/runtime/<namespace>/logs/desktop` dir that the export
  // reader never looks in. Keeping both sides on `resolveRuntimeNamespaceRoot`
  // co-locates renderer.log with the desktop log dir AND keeps it captured.
  const namespaceRoot = resolveRuntimeNamespaceRoot({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtime,
    runtimeMode: SIDECAR_MODES.RUNTIME,
  });
  const desktopLogPath = resolveLogFilePath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtimeRoot: namespaceRoot,
  });
  const rendererLogPath = join(dirname(desktopLogPath), "renderer.log");

  let desktop: DesktopRuntime | null = null;
  let disposeMenu: () => void = () => undefined;
  let updateScheduler: DesktopUpdaterScheduler | null = null;
  let removeDiagnosticsIpc: () => void = () => undefined;
  let ipcServer: JsonIpcServerHandle | null = null;
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await options.beforeShutdown?.().catch((error: unknown) => {
      console.error("desktop beforeShutdown failed", error);
    });
    updateScheduler?.stop("shutdown");
    disposeMenu();
    removeDiagnosticsIpc();
    await ipcServer?.close().catch(() => undefined);
    await desktop?.close().catch(() => undefined);
    app.quit();
  }

  function shutdownAndExit(): void {
    void shutdown().finally(() => process.exit(0));
  }

  desktop = await createDesktopRuntime({
    desktopAuthSecret,
    discoverUrl: options.discoverWebUrl ?? createWebDiscovery(runtime),
    discoverDaemonUrl: options.discoverDaemonUrl,
    osLocale,
    preloadPath: options.preloadPath,
    // Round-5 (lefarcen P1, mrcfps): runtime hands this back to itself
    // on `503 DESKTOP_AUTH_PENDING` to re-handshake with the daemon
    // (after a daemon restart, or after a missed startup window). The
    // runtime then mints a FRESH token (new nonce + new exp — replay
    // protection still works) and POSTs once more.
    registerDesktopAuthWithDaemon: () => registerDesktopAuthWithDaemon(runtime, desktopAuthSecret),
    rendererLogPath,
    requestQuit: shutdownAndExit,
    updater,
  });
  options.onDesktopReady?.({ show: () => desktop?.show() });
  disposeMenu = installDesktopMenu(runtime);
  removeDiagnosticsIpc = registerDesktopDiagnosticsIpc(runtime);
  updateScheduler = createDesktopUpdaterScheduler(updater, {
    backoffInitialMs: updater.config.checkBackoffInitialMs,
    backoffMaxMs: updater.config.checkBackoffMaxMs,
    initialDelayMs: updater.config.checkInitialDelayMs,
    intervalMs: updater.config.checkIntervalMs,
  });
  if (updater.shouldAutoCheck()) updateScheduler.start();

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
      const activeDesktop = desktop;
      if (activeDesktop == null) {
        throw new Error("desktop runtime is not initialized");
      }
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          return { ...activeDesktop.status(), update: await updater.status() };
        case SIDECAR_MESSAGES.EVAL:
          return await activeDesktop.eval(request.input as DesktopEvalInput);
        case SIDECAR_MESSAGES.SCREENSHOT:
          return await activeDesktop.screenshot(request.input as DesktopScreenshotInput);
        case SIDECAR_MESSAGES.CONSOLE:
          return activeDesktop.console();
        case SIDECAR_MESSAGES.CLICK:
          return await activeDesktop.click(request.input as DesktopClickInput);
        case SIDECAR_MESSAGES.EXPORT_PDF:
          return await activeDesktop.exportPdf(request.input as DesktopExportPdfInput);
        case SIDECAR_MESSAGES.UPDATE:
          return await updater.handle((request.input as DesktopUpdateInput).action);
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
    desktop?.show();
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
