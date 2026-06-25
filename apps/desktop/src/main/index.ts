import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BrowserWindow, Menu, app, dialog, globalShortcut, shell, type MenuItemConstructorOptions } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  normalizeDesktopSidecarMessage,
  type DesktopClickInput,
  type DesktopEvalInput,
  type DesktopExportArtifactInput,
  type DesktopExportPdfInput,
  type DesktopScreenshotInput,
  type DesktopStatusSnapshot,
  type DesktopUpdateStatusSnapshot,
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
export {
  createSplashWindow,
  isAllowedChildWindowUrl,
  isAllowedEmbeddedBrowserUrl,
  isHttpUrl,
  registerSplashStageTracking,
  resolveDesktopStatusUrl,
  setSplashStage,
  type SplashBootStage,
  type SplashStageSurface,
} from "./runtime.js";

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
const AMR_PROFILE_ENV_KEY = "OPEN_DESIGN_AMR_PROFILE";
const AMR_PROFILE_AGENT_ID = "amr";
const AMR_ENVIRONMENT_PROFILES = ["prod", "test", "local"] as const;
const APP_CONFIG_CHANGED_IPC_CHANNEL = "od:app-config-changed";
type AmrEnvironmentProfile = (typeof AMR_ENVIRONMENT_PROFILES)[number];
type DesktopAppConfigPrefs = {
  agentModels?: Record<string, { model?: string; reasoning?: string }>;
  agentCliEnv?: Record<string, Record<string, string>>;
  [key: string]: unknown;
};

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
  windowTitle?: string;
  onDesktopReady?: (controls: { show(): void }) => void;
  /**
   * Optional pre-created splash window. The packaged entry creates it before
   * awaiting the daemon/web sidecars so the brand animation overlaps the cold
   * boot; forwarded straight to the runtime, which owns closing it once the
   * main window is revealed. Omitted by tools-dev (the runtime makes its own).
   */
  splashWindow?: BrowserWindow | null;
  /** Creation time of `splashWindow` (from `createSplashWindow().startedAt`), so
   * the runtime measures the minimum splash hold from when it actually appeared. */
  splashStartedAt?: number;
  update?: {
    currentVersion?: string | null;
    downloadRoot?: string | null;
    installerObservationRoot?: string | null;
    launcherLaunchPath?: string | null;
    launcherRoot?: string | null;
    launcherPayloadExtractorPath?: string | null;
    launcherRuntimePath?: string | null;
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

// Resolve the daemon base URL the same way app-config reads/writes do: an
// explicit daemon URL, else the web URL (which proxies `/api/*` to the daemon),
// else sidecar web discovery. Shared by app-config menu actions and the
// diagnostics export so they all target the same daemon. Throws when none is
// available.
function resolveDaemonBaseUrl(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  options: Pick<DesktopMainOptions, "discoverDaemonUrl" | "discoverWebUrl">,
): () => Promise<string> {
  return async () => {
    const baseUrl =
      (await options.discoverDaemonUrl?.()) ??
      (await options.discoverWebUrl?.()) ??
      (await createWebDiscovery(runtime)());
    if (!baseUrl) {
      throw new Error("daemon URL is unavailable");
    }
    return baseUrl;
  };
}

export function normalizeAmrEnvironmentProfile(profile: unknown): AmrEnvironmentProfile {
  if (typeof profile !== "string") return "prod";
  const trimmed = profile.trim();
  return AMR_ENVIRONMENT_PROFILES.includes(trimmed as AmrEnvironmentProfile)
    ? (trimmed as AmrEnvironmentProfile)
    : "prod";
}

export function mergeAmrEnvironmentProfileConfig(
  config: DesktopAppConfigPrefs,
  profile: AmrEnvironmentProfile,
): DesktopAppConfigPrefs {
  if (!AMR_ENVIRONMENT_PROFILES.includes(profile)) {
    throw new Error(`Unsupported AMR Environment Profile: ${String(profile)}`);
  }
  const currentProfile = normalizeAmrEnvironmentProfile(
    config.agentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY],
  );
  const shouldClearAmrModel = currentProfile !== profile;
  const hadAmrModel =
    shouldClearAmrModel && Object.prototype.hasOwnProperty.call(config.agentModels ?? {}, AMR_PROFILE_AGENT_ID);
  const nextAgentModels = { ...(config.agentModels ?? {}) };
  if (shouldClearAmrModel) {
    delete nextAgentModels[AMR_PROFILE_AGENT_ID];
  }
  return {
    ...config,
    ...(Object.keys(nextAgentModels).length > 0
      ? { agentModels: nextAgentModels }
      : hadAmrModel
        ? { agentModels: {} }
        : {}),
    agentCliEnv: {
      ...(config.agentCliEnv ?? {}),
      [AMR_PROFILE_AGENT_ID]: {
        ...(config.agentCliEnv?.[AMR_PROFILE_AGENT_ID] ?? {}),
        [AMR_PROFILE_ENV_KEY]: profile,
      },
    },
  };
}

export function createAmrEnvironmentProfileMenuItems(
  selectedProfile: AmrEnvironmentProfile,
  onSelect: (profile: AmrEnvironmentProfile) => void,
): MenuItemConstructorOptions[] {
  return [
    {
      label: "AMR Profile",
      submenu: AMR_ENVIRONMENT_PROFILES.map((profile) => ({
        label: profile,
        type: "radio" as const,
        checked: selectedProfile === profile,
        click: () => onSelect(profile),
      })),
    },
  ];
}

export function resolveAboutPanelVersion(options: DesktopMainOptions): string | null {
  const version = options.update?.currentVersion?.trim();
  return version == null || version.length === 0 ? null : version;
}

function configureAboutPanel(options: DesktopMainOptions): void {
  const version = resolveAboutPanelVersion(options);
  if (version == null) return;
  app.setAboutPanelOptions({ version });
}

function appConfigUrl(baseUrl: string): string {
  return new URL("/api/app-config", baseUrl).toString();
}

async function readAppConfigFromDaemon(baseUrl: string): Promise<DesktopAppConfigPrefs> {
  const response = await fetch(appConfigUrl(baseUrl));
  if (!response.ok) {
    throw new Error(`GET /api/app-config failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as { config?: DesktopAppConfigPrefs };
  if (payload.config == null || typeof payload.config !== "object") {
    throw new Error("GET /api/app-config returned an invalid config payload");
  }
  return payload.config;
}

async function writeAppConfigToDaemon(
  baseUrl: string,
  config: DesktopAppConfigPrefs,
): Promise<DesktopAppConfigPrefs> {
  const response = await fetch(appConfigUrl(baseUrl), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`PUT /api/app-config failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as { config?: DesktopAppConfigPrefs };
  if (payload.config == null || typeof payload.config !== "object") {
    throw new Error("PUT /api/app-config returned an invalid config payload");
  }
  return payload.config;
}

function installDesktopMenu(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  options: Pick<DesktopMainOptions, "discoverDaemonUrl" | "discoverWebUrl"> = {},
): () => void {
  let developMenuVisible = false;
  let lastKnownAmrProfile: AmrEnvironmentProfile = "prod";

  const showDevelopMenuError = (message: string, error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(message, detail);
  };

  const discoverAppConfigBaseUrl = resolveDaemonBaseUrl(runtime, options);

  const readCurrentAmrProfile = async (): Promise<AmrEnvironmentProfile> => {
    const baseUrl = await discoverAppConfigBaseUrl();
    const config = await readAppConfigFromDaemon(baseUrl);
    return normalizeAmrEnvironmentProfile(config.agentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY]);
  };

  const writeCurrentAmrProfile = async (profile: AmrEnvironmentProfile): Promise<AmrEnvironmentProfile> => {
    const baseUrl = await discoverAppConfigBaseUrl();
    const config = await readAppConfigFromDaemon(baseUrl);
    const nextConfig = mergeAmrEnvironmentProfileConfig(config, profile);
    const writtenConfig = await writeAppConfigToDaemon(baseUrl, nextConfig);
    return normalizeAmrEnvironmentProfile(
      writtenConfig.agentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY],
    );
  };

  const selectAmrProfile = (profile: AmrEnvironmentProfile): void => {
    void writeCurrentAmrProfile(profile)
      .then((writtenProfile) => {
        lastKnownAmrProfile = writtenProfile;
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(APP_CONFIG_CHANGED_IPC_CHANNEL);
        }
        rebuild();
      })
      .catch((error: unknown) => {
        showDevelopMenuError("AMR Environment Profile switch failed", error);
      });
  };

  const exportDiagnostics = () => {
    const focused = BrowserWindow.getFocusedWindow();
    void exportDiagnosticsToFile(
      { discoverDaemonBaseUrl: discoverAppConfigBaseUrl },
      focused,
    ).catch((error: unknown) => {
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
      ...(developMenuVisible
        ? [
            {
              label: "Develop",
              submenu: createAmrEnvironmentProfileMenuItems(lastKnownAmrProfile, selectAmrProfile),
            },
          ]
        : []),
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
              void shell.openExternal("https://x.com/OpenDesignHQ");
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
              void shell.openExternal("https://discord.gg/9ptkbbqRu");
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
  const accelerator = process.platform === "darwin" ? "Command+Option+Shift+D" : "Control+Alt+Shift+D";
  const registered = globalShortcut.register(accelerator, () => {
    if (developMenuVisible) {
      developMenuVisible = false;
      rebuild();
      return;
    }
    void readCurrentAmrProfile()
      .then((profile) => {
        lastKnownAmrProfile = profile;
        developMenuVisible = true;
        rebuild();
      })
      .catch((error: unknown) => {
        showDevelopMenuError("Develop menu unavailable", error);
      });
  });
  if (!registered) {
    console.warn("[open-design desktop] develop menu shortcut unavailable", { accelerator });
  }
  return () => {
    globalShortcut.unregister(accelerator);
  };
}

const REGISTER_DESKTOP_AUTH_RETRY_DELAYS_MS = [120, 240, 480, 960, 1500];
const REGISTER_DESKTOP_AUTH_TIMEOUT_MS = 800;

function summarizeDesktopIpcInput(input: unknown): Record<string, unknown> | null {
  if (input == null || typeof input !== "object") return null;
  if ("expression" in input && typeof (input as { expression?: unknown }).expression === "string") {
    const expression = (input as { expression: string }).expression;
    return {
      expressionLength: expression.length,
      expressionPreview: expression.length > 120 ? `${expression.slice(0, 120)}...` : expression,
    };
  }
  if ("path" in input && typeof (input as { path?: unknown }).path === "string") {
    return { path: (input as { path: string }).path };
  }
  if ("action" in input && typeof (input as { action?: unknown }).action === "string") {
    return { action: (input as { action: string }).action };
  }
  if ("selector" in input && typeof (input as { selector?: unknown }).selector === "string") {
    return { selector: (input as { selector: string }).selector };
  }
  return null;
}

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
  configureAboutPanel(options);

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
      launcherLaunchPath: options.update?.launcherLaunchPath,
      launcherRoot: options.update?.launcherRoot,
      launcherPayloadExtractorPath: options.update?.launcherPayloadExtractorPath,
      launcherRuntimePath: options.update?.launcherRuntimePath,
      namespace: runtime.namespace,
      runtimeBase: runtime.base,
      source: runtime.source,
    },
    { openPath: (path) => shell.openPath(path) },
  );
  // Resolve the namespace root the same way the daemon diagnostics export does
  // (apps/daemon/src/diagnostics-export.ts buildSidecarLogSources). In packaged
  // builds `runtime.base` is `<namespaceRoot>/runtime`, so re-appending the
  // namespace via `resolveNamespaceRoot` would write renderer.log to a phantom
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

  async function snapshotUpdateForStatus(): Promise<{
    update: DesktopUpdateStatusSnapshot;
    updateStatusError?: string;
  }> {
    const timeoutMs = 250;
    let timeout: NodeJS.Timeout | null = null;
    try {
      const update = await Promise.race([
        updater.status(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`desktop updater status timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      return { update };
    } catch (error) {
      return {
        update: updater.snapshot(),
        updateStatusError: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeout != null) clearTimeout(timeout);
    }
  }

  async function desktopStatusSnapshot(activeDesktop: DesktopRuntime | null): Promise<DesktopStatusSnapshot> {
    const update = await snapshotUpdateForStatus();
    if (activeDesktop == null) {
      return {
        pid: process.pid,
        state: "idle",
        updatedAt: new Date().toISOString(),
        url: null,
        windowVisible: false,
        ...update,
      };
    }
    return { ...activeDesktop.status(), ...update };
  }

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

  console.info("[open-design desktop] starting desktop IPC server", { ipc: runtime.ipc });
  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDesktopSidecarMessage(message);
      const startedAt = Date.now();
      const input = "input" in request ? summarizeDesktopIpcInput(request.input) : null;
      console.info("[open-design desktop] desktop IPC request start", { input, type: request.type });
      try {
        const activeDesktop = desktop;
        switch (request.type) {
          case SIDECAR_MESSAGES.STATUS:
            return await desktopStatusSnapshot(activeDesktop);
          case SIDECAR_MESSAGES.SHUTDOWN:
            setImmediate(() => {
              shutdownAndExit();
            });
            return { accepted: true };
        }
        if (activeDesktop == null) {
          throw new Error("desktop runtime is not initialized");
        }
        switch (request.type) {
          case SIDECAR_MESSAGES.EVAL:
            return await activeDesktop.eval(request.input as DesktopEvalInput);
          case SIDECAR_MESSAGES.SCREENSHOT:
            return await activeDesktop.screenshot(request.input as DesktopScreenshotInput);
          case SIDECAR_MESSAGES.CONSOLE:
            return activeDesktop.console();
          case SIDECAR_MESSAGES.SHOW:
            activeDesktop.show();
            return { accepted: true };
          case SIDECAR_MESSAGES.CLICK:
            return await activeDesktop.click(request.input as DesktopClickInput);
          case SIDECAR_MESSAGES.EXPORT_PDF:
            return await activeDesktop.exportPdf(request.input as DesktopExportPdfInput);
          case SIDECAR_MESSAGES.EXPORT_ARTIFACT:
            return await activeDesktop.exportArtifact(request.input as DesktopExportArtifactInput);
          case SIDECAR_MESSAGES.UPDATE:
            return await updater.handle((request.input as DesktopUpdateInput).action);
        }
      } catch (error) {
        console.error("[open-design desktop] desktop IPC request failed", {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          type: request.type,
        });
        throw error;
      } finally {
        console.info("[open-design desktop] desktop IPC request end", {
          durationMs: Date.now() - startedAt,
          type: request.type,
        });
      }
    },
  });
  console.info("[open-design desktop] desktop IPC server listening", { ipc: runtime.ipc });

  console.info("[open-design desktop] creating desktop runtime");
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
    splashWindow: options.splashWindow,
    splashStartedAt: options.splashStartedAt,
    updater,
    windowTitle: options.windowTitle,
  });
  console.info("[open-design desktop] desktop runtime created");
  options.onDesktopReady?.({ show: () => desktop?.show() });
  disposeMenu = installDesktopMenu(runtime, options);
  removeDiagnosticsIpc = registerDesktopDiagnosticsIpc({
    discoverDaemonBaseUrl: resolveDaemonBaseUrl(runtime, options),
  });
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
