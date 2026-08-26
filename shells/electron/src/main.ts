import runtime from "../config/runtime.json" with { type: "json" };
import manifest from "../config/shell.json" with { type: "json" };
import windowsLifecycle from "../config/platforms/windows.json" with { type: "json" };

import {
  ElectronFixtureLifecyclePort,
  ElectronFixtureBootstrapPort,
  ElectronFixtureShellUpdater,
  runElectronShell,
  scheduleElectronInstallerHandoff,
  type ElectronShellManifest,
  type ElectronRuntimeConfig,
} from "@open-design/electron-kit/runtime";
import {
  createElectronWindowsRegExePort,
  reconcileElectronWindowsDisplayVersion,
  resolveElectronWindowsInstallIdentity,
  type ElectronWindowsLifecyclePolicy,
} from "@open-design/electron-kit/windows";

import { placeholderRenderer, prewarmPlaceholderResource } from "./renderer/placeholder.js";

void runElectronShell({
  manifest: manifest as ElectronShellManifest,
  preflight: (runtime as ElectronRuntimeConfig).preflight,
  warmup: (runtime as ElectronRuntimeConfig).warmup,
  warmupExecutors: {
    "shell.placeholder-resource": () => prewarmPlaceholderResource(manifest.window.title),
  },
  renderer: placeholderRenderer,
  actions: {
    async observeCommitted() {
      const identity = resolveElectronWindowsInstallIdentity({
        manifest: manifest as ElectronShellManifest,
        policy: windowsLifecycle as ElectronWindowsLifecyclePolicy,
      });
      const receipt = await reconcileElectronWindowsDisplayVersion({
        identity,
        registry: createElectronWindowsRegExePort(),
        version: manifest.version,
      });
      if (receipt.status !== "ignored-platform" && receipt.status !== "unchanged") {
        console.info("[shell/electron] Windows DisplayVersion reconciliation", receipt);
      }
    },
    openDeepLink(url) {
      console.info("[shell/electron] deep link", { url });
    },
    installUpdate(request) {
      return scheduleElectronInstallerHandoff({
        ...request,
        mode: process.env.ELECTRON_KIT_FIXTURE_INSTALLER_VERIFY_ONLY === "1" ? "verify-only" : "execute",
      });
    },
  },
  createPorts({ runtimeRoot, sidecarEntryPath, nodeExecutablePath }) {
    const lifecycle = new ElectronFixtureLifecyclePort(sidecarEntryPath, nodeExecutablePath);
    const updater = new ElectronFixtureShellUpdater({
      metadataUrl: process.env.OD_UPDATE_METADATA_URL ?? null,
      shell: manifest.shell,
      cacheRoot: runtimeRoot,
      lifecycle,
      scope: { channel: manifest.channel, namespace: manifest.namespace },
    });
    lifecycle.exposeShellUpdater(updater);
    return {
      bootstrap: new ElectronFixtureBootstrapPort(),
      lifecycle,
      updater,
    };
  },
});
