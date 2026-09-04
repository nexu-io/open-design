import { fileURLToPath } from "node:url";

import { devElectronShell } from "@open-design/electron-kit/dev";
import { loadElectronStandaloneAuthorityResources } from "./build-authority.mjs";

const authorityResourceRoot = process.env.OD_ELECTRON_STANDALONE_RESOURCE_ROOT;
if (authorityResourceRoot == null) throw new Error("OD_ELECTRON_STANDALONE_RESOURCE_ROOT is required; fixture authority fallback has been removed");
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
