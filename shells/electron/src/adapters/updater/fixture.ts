import {
  ElectronFixtureBootstrapPort,
  ElectronFixtureLifecyclePort,
  ElectronFixtureShellUpdater,
  type ElectronShellDefinition,
  type ElectronShellManifest,
} from "@open-design/electron-kit/runtime";

export function createFixtureClosurePortsAdapter(
  manifest: ElectronShellManifest,
): ElectronShellDefinition["createPorts"] {
  return ({ runtimeRoot, sidecarEntryPath, nodeExecutablePath }) => {
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
  };
}
