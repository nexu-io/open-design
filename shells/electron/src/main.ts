import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runElectronCarrier, validateElectronCarrierConfig, resolveElectronLaunchNamespace } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { runControlledElectronShell, runElectronShellEntry } from "./adapters/standalone/electron-control.js";
import { loadInstalledElectronCapsule } from "./adapters/standalone/capsule.js";

async function main(): Promise<void> {
  const installedManifest = JSON.parse(readFileSync(join(__dirname, "shell.json"), "utf8")) as ElectronShellManifest;
  // Reject path overrides before registering a supervised business process.
  const namespace = resolveElectronLaunchNamespace(installedManifest.namespace);
  const installedCarrier = validateElectronCarrierConfig(JSON.parse(readFileSync(join(__dirname, "carrier.json"), "utf8")));
  await runControlledElectronShell(async () => await runElectronCarrier({
    manifest: installedManifest,
    preflight: installedCarrier.preflight,
    loadCapsule: loadInstalledElectronCapsule,
  }), installedCarrier.startupTimeoutMs, { channel: installedManifest.channel, namespace });
}

void runElectronShellEntry(main);
