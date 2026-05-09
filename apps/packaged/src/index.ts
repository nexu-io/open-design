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
import { readProcessStamp } from "@open-design/platform";
import { app, dialog } from "electron";

import { readPackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity } from "./identity.js";
import {
  PackagedPathAccessError,
  applyPackagedElectronPathOverrides,
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
  const config = await readPackagedConfig();
  const argvStamp = readProcessStamp(process.argv.slice(1), OPEN_DESIGN_SIDECAR_CONTRACT);
  const namespace = argvStamp?.namespace ?? config.namespace;
  const paths = resolvePackagedNamespacePaths(config, namespace);
  const stamp = argvStamp ?? createPackagedDesktopStamp(namespace);

  await ensurePackagedNamespacePaths(paths);
  packagedLogger = createPackagedDesktopLogger(paths);
  attachPackagedDesktopProcessLogging({ logger: packagedLogger, paths, stamp });
  applyPackagedElectronPathOverrides(paths);
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
