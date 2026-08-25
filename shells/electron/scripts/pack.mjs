import { fileURLToPath } from "node:url";

import { packElectronShell } from "@open-design/electron-kit/pack";

const receipt = await packElectronShell({
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: fileURLToPath(new URL("../electron-shell.json", import.meta.url)),
  fixtureSidecarPath: fileURLToPath(new URL("../../../packages/electron-kit/dist/lifecycle/fixture-sidecar.cjs", import.meta.url)),
  nodeCarrierLockPath: fileURLToPath(new URL("../node-lock.json", import.meta.url)),
  outputRoot: fileURLToPath(new URL("../dist", import.meta.url)),
});
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
