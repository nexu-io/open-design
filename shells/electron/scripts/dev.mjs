import { fileURLToPath } from "node:url";

import { devElectronShell } from "@open-design/electron-kit/dev";
import { resolveElectronStandaloneTarget } from "../src/adapters/standalone/installation.ts";
import { loadElectronStandaloneAuthorityResources } from "./build-authority.ts";
import { materializeElectronDevInstallation } from "./dev-installation.ts";

const installedResourceRoot = process.env.OD_ELECTRON_STANDALONE_RESOURCE_ROOT;
const bootstrapUrl = process.env.OD_ELECTRON_STANDALONE_BOOTSTRAP_URL;
if (installedResourceRoot != null && bootstrapUrl != null) {
  throw new Error("OD_ELECTRON_STANDALONE_RESOURCE_ROOT and OD_ELECTRON_STANDALONE_BOOTSTRAP_URL are mutually exclusive");
}
let authorityResourceRoot = installedResourceRoot;
if (bootstrapUrl != null) {
  const outputDirectory = process.env.OD_ELECTRON_STANDALONE_INSTALLATION_ROOT;
  if (outputDirectory == null) throw new Error("OD_ELECTRON_STANDALONE_INSTALLATION_ROOT is required with OD_ELECTRON_STANDALONE_BOOTSTRAP_URL");
  authorityResourceRoot = (await materializeElectronDevInstallation({
    bootstrapUrl,
    operation: "electron.dev.installation.materialize",
    outputDirectory,
    schemaVersion: 1,
    target: resolveElectronStandaloneTarget(),
  })).resourceDirectory;
}
if (authorityResourceRoot == null) {
  throw new Error("an installed Electron Standalone authority or loopback bootstrap URL is required; fixture fallback has been removed");
}
const manifestPath = process.env.OD_ELECTRON_SHELL_MANIFEST
  ?? fileURLToPath(new URL("../config/shell.json", import.meta.url));

const code = await devElectronShell({
  authorityResources: await loadElectronStandaloneAuthorityResources(authorityResourceRoot),
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath,
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  projectRoot: fileURLToPath(new URL("..", import.meta.url)),
  rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  argv: process.argv.slice(2),
});
process.exitCode = code;
