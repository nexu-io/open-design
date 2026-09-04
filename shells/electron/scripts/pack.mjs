import { fileURLToPath } from "node:url";

import { packElectronShell } from "@open-design/electron-kit/pack";
import { loadElectronStandaloneAuthorityResources } from "./build-authority.ts";

const authorityResourceRoot = process.env.OD_ELECTRON_STANDALONE_RESOURCE_ROOT;
if (authorityResourceRoot == null) throw new Error("OD_ELECTRON_STANDALONE_RESOURCE_ROOT is required; fixture authority fallback has been removed");
const manifestPath = process.env.OD_ELECTRON_SHELL_MANIFEST
  ?? fileURLToPath(new URL("../config/shell.json", import.meta.url));

const receipt = await packElectronShell({
  authorityResources: await loadElectronStandaloneAuthorityResources(authorityResourceRoot),
  distributionPath: fileURLToPath(new URL("../config/distribution.json", import.meta.url)),
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath,
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  windowsLifecyclePath: fileURLToPath(new URL("../config/platforms/windows.json", import.meta.url)),
  outputRoot: fileURLToPath(new URL("../dist", import.meta.url)),
  projectRoot: fileURLToPath(new URL("..", import.meta.url)),
  rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
});
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
