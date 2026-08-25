import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { assembleElectronScene, buildElectronDistribution, type ElectronDistributionReceipt } from "../build/index.js";
import { validateElectronShellManifest, type ElectronShellManifest } from "../boundary/index.js";

export async function packElectronShell(input: Readonly<{
  entryPath: string;
  manifestPath: string;
  fixtureSidecarPath: string;
  nodeCarrierLockPath: string;
  outputRoot: string;
}>): Promise<ElectronDistributionReceipt> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  const scene = await assembleElectronScene({
    entryPath: input.entryPath,
    manifestPath: input.manifestPath,
    outputRoot: join(dirname(input.manifestPath), ".tmp", "electron-kit", manifest.namespace, "scene"),
    fixtureSidecarPath: input.fixtureSidecarPath,
    nodeCarrierLockPath: input.nodeCarrierLockPath,
  });
  return await buildElectronDistribution({ scene, manifest, outputRoot: input.outputRoot });
}
