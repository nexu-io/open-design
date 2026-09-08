import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runElectronCarrier } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";
import type { ElectronRuntimeConfig } from "@open-design/electron-kit/runtime";

import { runControlledElectronShell } from "./adapters/standalone/electron-control.js";

const installedManifest = JSON.parse(readFileSync(join(__dirname, "shell.json"), "utf8")) as ElectronShellManifest;
const installedRuntime = JSON.parse(readFileSync(join(__dirname, "runtime.json"), "utf8")) as ElectronRuntimeConfig;
void runControlledElectronShell(async () => await runElectronCarrier({
  manifest: installedManifest,
  preflight: installedRuntime.preflight,
  async loadCapsule() {
    return await import("./capsule.js");
  },
}));
