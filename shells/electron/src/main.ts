import manifest from "../electron-shell.json" with { type: "json" };

import {
  ElectronFixtureLifecyclePort,
  ElectronFixtureShellUpdater,
  runElectronShell,
  type ElectronShellManifest,
} from "@open-design/electron-kit/runtime";

void runElectronShell({
  manifest: manifest as ElectronShellManifest,
  handlers: {
    openDeepLink(url) {
      console.info("[shell/electron] deep link", { url });
    },
  },
  createPorts({ sidecarEntryPath }) {
    return {
      lifecycle: new ElectronFixtureLifecyclePort(sidecarEntryPath),
      updater: new ElectronFixtureShellUpdater(process.env.OD_UPDATE_METADATA_URL ?? null, manifest.shell),
    };
  },
});
