import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runElectronCarrier, validateElectronCarrierConfig } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { runControlledElectronShell } from "./adapters/standalone/electron-control.js";
import { loadInstalledElectronCapsule } from "./adapters/standalone/capsule.js";

const installedManifest = JSON.parse(readFileSync(join(__dirname, "shell.json"), "utf8")) as ElectronShellManifest;
const installedCarrier = validateElectronCarrierConfig(JSON.parse(readFileSync(join(__dirname, "carrier.json"), "utf8")));
void runControlledElectronShell(async () => await runElectronCarrier({
  manifest: installedManifest,
  preflight: installedCarrier.preflight,
  loadCapsule: loadInstalledElectronCapsule,
}), installedCarrier.startupTimeoutMs);
