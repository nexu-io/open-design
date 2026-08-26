import { fileURLToPath } from "node:url";

import { packElectronShell } from "@open-design/electron-kit/pack";

const receipt = await packElectronShell({
  distributionPath: fileURLToPath(new URL("../config/distribution.json", import.meta.url)),
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: fileURLToPath(new URL("../config/shell.json", import.meta.url)),
  fixtureSidecarPath: fileURLToPath(new URL("../../../packages/electron-kit/dist/fixtures/lifecycle/sidecar.cjs", import.meta.url)),
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  outputRoot: fileURLToPath(new URL("../dist", import.meta.url)),
  projectRoot: fileURLToPath(new URL("..", import.meta.url)),
});
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
