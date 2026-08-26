import { fileURLToPath } from "node:url";

import { devElectronShell } from "@open-design/electron-kit/dev";

const code = await devElectronShell({
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: fileURLToPath(new URL("../electron-shell.json", import.meta.url)),
  fixtureSidecarPath: fileURLToPath(new URL("../../../packages/electron-kit/dist/lifecycle/fixture-sidecar.cjs", import.meta.url)),
  nodeCarrierLockPath: fileURLToPath(new URL("../node-lock.json", import.meta.url)),
  preflightPath: fileURLToPath(new URL("../preflight.json", import.meta.url)),
  warmupPath: fileURLToPath(new URL("../warmup.json", import.meta.url)),
  argv: process.argv.slice(2),
});
process.exitCode = code;
