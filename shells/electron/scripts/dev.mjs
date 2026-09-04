import { fileURLToPath } from "node:url";

import { devElectronShell } from "@open-design/electron-kit/dev";

const code = await devElectronShell({
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: fileURLToPath(new URL("../config/shell.json", import.meta.url)),
  fixtureSidecarPath: fileURLToPath(new URL("../../../packages/electron-kit/dist/fixtures/lifecycle/sidecar.cjs", import.meta.url)),
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  projectRoot: fileURLToPath(new URL("..", import.meta.url)),
  rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  argv: process.argv.slice(2),
});
process.exitCode = code;
