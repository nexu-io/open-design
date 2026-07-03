import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { parseLauncherAfterQuitArgs } from "@open-design/launcher-proto";
import {
  bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import { applyOsLocaleSwitch, createSplashWindow, setSplashStage } from "@open-design/desktop/main";
import { readProcessStamp } from "@open-design/platform";
import { join } from "node:path";
import { app, dialog } from "electron";

import { readPackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity } from "./identity.js";
import { PackagedPathAccessError } from "./errors.js";
import { inspectExistingDesktopForLauncher, waitForLauncherAfterQuit } from "./launcher-after-quit.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "./launcher-runtime.js";
import {
  applyPackagedElectronPathOverrides,
  claimPackagedSingleInstanceLock,
  ensurePackagedNamespacePaths,
} from "./launch.js";
import {
  attachPackagedDesktopProcessLogging,
  createPackagedDesktopLogger,
  type PackagedDesktopLogger,
} from "./logging.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { packagedEntryUrl, registerOdProtocol } from "./protocol.js";
import { startPackagedSidecars } from "./sidecars.js";
import { reportStartupFailure, resolveStartupDistinctId } from "./startup-telemetry.js";
import { resolvePackagedWindowTitle } from "./window-title.js";
import { syncWindowsUninstallDisplayVersion } from "./windows-lifecycle.js";

let packagedLogger: PackagedDesktopLogger | null = null;
let pendingSecondInstanceFocus = false;
let showExistingDesktop: (() => void) | null = null;

// Telemetry context for the fatal-exit path. Populated once config + launcher
// runtime are resolved so the `main().catch` below can report a startup failure
// even though the daemon (the PostHog host) never came up. Null until then —
// failures earlier than config resolution simply skip telemetry. See
// `startup-telemetry.ts` for the zero-startup-side-effect contract.
let startupTelemetryContext:
  | {
      posthogKey: string | null;
      posthogHost: string | null;
      appVersion: string | null;
      namespace: string;
      source: string;
      installationRoot: string;
      nativeModulePath: string | null;
    }
  | null = null;

function createPackagedDesktopStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function applyLaunchEnv(base: string, stamp: SidecarStamp): void {
  const env = createSidecarLaunchEnv({
    base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    stamp,
  });

  for (const [key, value] of Object.entries(env)) {
    if (value != null) process.env[key] = value;
  }
}

function applyPackagedUpdaterEnv(updateMetadataUrl: string | null): void {
  if (updateMetadataUrl == null) return;
  if (process.env.OD_UPDATE_METADATA_URL != null && process.env.OD_UPDATE_METADATA_URL.length > 0) return;
  process.env.OD_UPDATE_METADATA_URL = updateMetadataUrl;
}

async function main(): Promise<void> {
  // Must run BEFORE `app.whenReady()` below, because Chromium consumes
  // `--lang` at session bootstrap. Doing it here lets the packaged
  // renderer's `navigator.language` follow the OS instead of Chromium's
  // en-US default. runDesktopMain (called later) calls the same helper
  // again to recover the resolved locale string for the BrowserWindow.
  applyOsLocaleSwitch(app);

  const config = await readPackagedConfig();
  const afterQuit = parseLauncherAfterQuitArgs(process.argv.slice(1));
  const argvStamp = readProcessStamp(process.argv.slice(1), OPEN_DESIGN_SIDECAR_CONTRACT);
  const namespace = argvStamp?.namespace ?? config.namespace;
  const namespaceConfig = namespace === config.namespace ? config : { ...config, namespace };
  const initialPaths = resolvePackagedNamespacePaths(namespaceConfig, namespace, process.env);
  await waitForLauncherAfterQuit(afterQuit, initialPaths);
  const existingDesktop = await inspectExistingDesktopForLauncher(namespace, {
    logger: console,
    paths: initialPaths,
  });
  if (existingDesktop.action === "exit") {
    return;
  }
  const launcherRuntime = await resolvePackagedLauncherRuntime(namespaceConfig, initialPaths);
  const activeConfig = launcherRuntime.config;
  const paths = launcherRuntime.paths;
  const stamp = argvStamp ?? createPackagedDesktopStamp(namespace);

  // Arm fatal-exit telemetry now that we know the channel key/version. The
  // startPackagedSidecars call below is THE failure this covers (daemon/web
  // dying before reporting status, e.g. issue #4638's missing better-sqlite3).
  startupTelemetryContext = {
    posthogKey: activeConfig.posthogKey,
    posthogHost: activeConfig.posthogHost,
    appVersion: activeConfig.appVersion,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
    // Pass installationRoot explicitly: OD_INSTALLATION_DIR is only set in the
    // daemon child env, not this parent process (see startup-telemetry.ts).
    installationRoot: paths.installationRoot,
    // Absolute path where the daemon's better-sqlite3 binding ships in the
    // packaged bundle (`Contents/Resources/app/node_modules/...` — layout
    // verified against the shipped 0.13.0 DMG). The fatal-exit report probes
    // this to record whether the .node actually exists on the crashing machine.
    nativeModulePath: join(
      app.getAppPath(),
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
  };

  await ensurePackagedNamespacePaths(paths);
  packagedLogger = createPackagedDesktopLogger(paths);
  attachPackagedDesktopProcessLogging({ logger: packagedLogger, paths, stamp });
  applyPackagedElectronPathOverrides(paths);
  applyPackagedUpdaterEnv(activeConfig.updateMetadataUrl);
  if (!claimPackagedSingleInstanceLock(app, () => {
    if (showExistingDesktop == null) {
      pendingSecondInstanceFocus = true;
      return;
    }
    showExistingDesktop();
  })) {
    return;
  }
  const identity = await writePackagedDesktopIdentity({ paths, stamp });
  await app.whenReady();

  // Show the brand splash IMMEDIATELY, before we await the daemon/web sidecars
  // below. Cold boot otherwise leaves the user staring at no window at all for
  // the few seconds the sidecars take to come up; putting the animation on
  // screen in parallel masks that gap, and the runtime keeps it up until the
  // real app has mounted (see createDesktopRuntime). The handle carries the
  // creation timestamp so the runtime's minimum-hold timer counts from here —
  // BEFORE the sidecar boot below — rather than re-adding the delay afterwards.
  const splash = createSplashWindow();

  applyLaunchEnv(paths.runtimeRoot, stamp);

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const sidecars = await startPackagedSidecars(runtime, paths, {
    appVersion: activeConfig.appVersion,
    amrProfile: activeConfig.amrProfile,
    daemonCliEntry: activeConfig.daemonCliEntry,
    daemonSidecarEntry: activeConfig.daemonSidecarEntry,
    electronNodeCommand: launcherRuntime.electronNodeCommand,
    nodeCommand: activeConfig.nodeCommand,
    telemetryRelayUrl: activeConfig.telemetryRelayUrl,
    posthogKey: activeConfig.posthogKey,
    posthogHost: activeConfig.posthogHost,
    // PR #974 round-5 (lefarcen P2): the Electron entry runs desktop
    // main alongside the daemon, so the import-folder gate must be
    // pinned ON from request 0. See `apps/packaged/src/headless.ts` for
    // the daemon+web-only counterpart that passes `false`.
    requireDesktopAuth: true,
    webSidecarEntry: activeConfig.webSidecarEntry,
    webStandaloneRoot: activeConfig.webStandaloneRoot,
    webOutputMode: activeConfig.webOutputMode,
    // Surface each sidecar boot phase on the splash status line so a slow
    // cold start (Defender scans, native module loads) never reads as a hang.
    // Both the "spawning" and "ready" edges are mapped so the step counter
    // advances the instant each long native wait clears.
    onPhase(phase) {
      const stage =
        phase === "daemon-spawning"
          ? "engine"
          : phase === "daemon-ready"
            ? "engineReady"
            : phase === "web-spawning"
              ? "interface"
              : "interfaceReady";
      setSplashStage(splash.window, stage);
    },
  });
  // Sidecars are up; the remaining wait is the hidden main window loading and
  // mounting the web bundle (the runtime re-asserts this stage at its reveal
  // gate, which is a no-op when the label is already current).
  setSplashStage(splash.window, "workspace");
  registerOdProtocol(sidecars.web.url ?? "http://127.0.0.1:0");

  const { runDesktopMain } = await import("@open-design/desktop/main");
  await runDesktopMain(runtime, {
    splashWindow: splash.window,
    splashStartedAt: splash.startedAt,
    async beforeShutdown() {
      try {
        await sidecars.close();
      } finally {
        await identity.close();
      }
    },
    async discoverWebUrl() {
      return packagedEntryUrl();
    },
    // Round-7 (lefarcen P2 @ runtime.ts:336): packaged main-process
    // fetch targets the daemon sidecar's real http URL — never the
    // od://app/ renderer URL, which Node/undici cannot resolve through
    // Electron's protocol handler.
    async discoverDaemonUrl() {
      return sidecars.daemon.url;
    },
    windowTitle: resolvePackagedWindowTitle(activeConfig),
    onDesktopReady(controls) {
      void confirmPackagedLauncherRuntime(launcherRuntime).catch((error: unknown) => {
        packagedLogger?.warn("failed to confirm packaged launcher runtime", { error });
      });
      void syncWindowsUninstallDisplayVersion({
        namespace,
        version: launcherRuntime.config.appVersion,
      }).catch((error: unknown) => {
        packagedLogger?.warn("failed to sync Windows uninstall registry version", { error });
      });
      showExistingDesktop = controls.show;
      if (!pendingSecondInstanceFocus) return;
      pendingSecondInstanceFocus = false;
      controls.show();
    },
    preloadPath: join(app.getAppPath(), "preload.cjs"),
    update: {
      currentVersion: activeConfig.appVersion,
      downloadRoot: paths.updateRoot,
      installerObservationRoot: paths.installerObservationRoot,
      launcherLaunchPath: launcherRuntime.installedLaunchPath,
      launcherRoot: launcherRuntime.launcherPaths.root,
      launcherPayloadExtractorPath: activeConfig.resourceRoot == null ? null : join(activeConfig.resourceRoot, "bin", "7z.exe"),
      launcherRuntimePath: launcherRuntime.launcherPaths.runtimePath,
    },
  });
}

void main().catch(async (error: unknown) => {
  const isPathAccess = error instanceof PackagedPathAccessError;
  if (isPathAccess) {
    try {
      dialog.showErrorBox(error.title, error.message);
    } catch {
      // Fall through to console logging + process exit.
    }
  }
  packagedLogger?.error("packaged runtime failed", { error });
  console.error("packaged runtime failed", error);
  // Best-effort crash telemetry on the way out. This is the ONLY new behavior
  // on the failure path; the happy path never reaches here. reportStartupFailure
  // self-caps its runtime (Promise.race timeout) and swallows all errors, so it
  // can neither block nor crash the exit. No-op when telemetry isn't armed yet
  // or the build has no PostHog key.
  if (startupTelemetryContext) {
    await reportStartupFailure({
      error,
      isPathAccess,
      posthogKey: startupTelemetryContext.posthogKey,
      posthogHost: startupTelemetryContext.posthogHost,
      distinctId: resolveStartupDistinctId(
        startupTelemetryContext.namespace,
        startupTelemetryContext.installationRoot,
      ),
      appVersion: startupTelemetryContext.appVersion,
      namespace: startupTelemetryContext.namespace,
      source: startupTelemetryContext.source,
      nativeModulePath: startupTelemetryContext.nativeModulePath,
    });
  }
  process.exit(1);
});
