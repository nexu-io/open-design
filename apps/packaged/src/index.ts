import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import { applyOsLocaleSwitch } from "@open-design/desktop/main";
import { readProcessStamp } from "@open-design/platform";
import { join } from "node:path";
import { app, dialog } from "electron";

import { readPackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity } from "./identity.js";
import { PackagedPathAccessError } from "./errors.js";
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

let packagedLogger: PackagedDesktopLogger | null = null;
let pendingSecondInstanceFocus = false;
let showExistingDesktop: (() => void) | null = null;

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

async function main(): Promise<void> {
  // Must run BEFORE `app.whenReady()` below, because Chromium consumes
  // `--lang` at session bootstrap. Doing it here lets the packaged
  // renderer's `navigator.language` follow the OS instead of Chromium's
  // en-US default. runDesktopMain (called later) calls the same helper
  // again to recover the resolved locale string for the BrowserWindow.
  applyOsLocaleSwitch(app);

  const config = await readPackagedConfig();
  const argvStamp = readProcessStamp(process.argv.slice(1), OPEN_DESIGN_SIDECAR_CONTRACT);
  const namespace = argvStamp?.namespace ?? config.namespace;
  const paths = resolvePackagedNamespacePaths(config, namespace, process.env);
  const stamp = argvStamp ?? createPackagedDesktopStamp(namespace);

  await ensurePackagedNamespacePaths(paths);
  packagedLogger = createPackagedDesktopLogger(paths);
  attachPackagedDesktopProcessLogging({ logger: packagedLogger, paths, stamp });
  applyPackagedElectronPathOverrides(paths);
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

  applyLaunchEnv(paths.runtimeRoot, stamp);

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const sidecars = await startPackagedSidecars(runtime, paths, {
    appVersion: config.appVersion,
    daemonCliEntry: config.daemonCliEntry,
    daemonSidecarEntry: config.daemonSidecarEntry,
    nodeCommand: config.nodeCommand,
    telemetryRelayUrl: config.telemetryRelayUrl,
    posthogKey: config.posthogKey,
    posthogHost: config.posthogHost,
    // PR #974 round-5 (lefarcen P2): the Electron entry runs desktop
    // main alongside the daemon, so the import-folder gate must be
    // pinned ON from request 0. See `apps/packaged/src/headless.ts` for
    // the daemon+web-only counterpart that passes `false`.
    requireDesktopAuth: true,
    webSidecarEntry: config.webSidecarEntry,
    webStandaloneRoot: config.webStandaloneRoot,
    webOutputMode: config.webOutputMode,
  });
  registerOdProtocol(sidecars.web.url ?? "http://127.0.0.1:0");

  const { runDesktopMain } = await import("@open-design/desktop/main");
  await runDesktopMain(runtime, {
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
    onDesktopReady(controls) {
      showExistingDesktop = controls.show;
      if (!pendingSecondInstanceFocus) return;
      pendingSecondInstanceFocus = false;
      controls.show();
    },
    preloadPath: join(app.getAppPath(), "preload.cjs"),
    update: {
      currentVersion: config.appVersion,
      downloadRoot: paths.updateRoot,
      installerObservationRoot: paths.installerObservationRoot,
    },
  });
}

void main().catch((error: unknown) => {
  if (error instanceof PackagedPathAccessError) {
    try {
      dialog.showErrorBox(error.title, error.message);
    } catch {
      // Fall through to console logging + process exit.
    }
  }
  packagedLogger?.error("packaged runtime failed", { error });
  console.error("packaged runtime failed", error);
  process.exit(1);
});
