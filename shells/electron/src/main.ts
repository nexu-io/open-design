import manifest from "../electron-shell.json" with { type: "json" };
import preflight from "../preflight.json" with { type: "json" };
import warmup from "../warmup.json" with { type: "json" };

import {
  ElectronFixtureLifecyclePort,
  ElectronFixtureBootstrapPort,
  ElectronFixtureShellUpdater,
  runElectronShell,
  scheduleElectronInstallerHandoff,
  type ElectronShellManifest,
  type ElectronPreflightTopology,
  type ElectronWarmupTopology,
} from "@open-design/electron-kit/runtime";

import { placeholderRenderer } from "./renderer/placeholder.js";

void runElectronShell({
  manifest: manifest as ElectronShellManifest,
  preflight: preflight as ElectronPreflightTopology,
  warmup: warmup as ElectronWarmupTopology,
  renderer: placeholderRenderer,
  actions: {
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
